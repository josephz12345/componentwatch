import { ORIGIN, COLLECTIONS } from './config.js';
import { normalize } from './normalize.js';
import { parseRobots } from './robots.js';

export function retryDelay(header, failures, now = Date.now(), random = Math.random) {
  const numeric = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : NaN;
  const date = header ? Date.parse(header) - now : NaN;
  const requested = Number.isFinite(numeric) ? numeric : Number.isFinite(date) ? Math.max(0, date) : 0;
  return Math.max(requested, Math.min(300000, 5000 * 2 ** Math.min(failures, 6)) + Math.floor(random() * 1000));
}

export class Collector {
  constructor(store, { interval = 5000, userAgent = 'ComponentWatch/1.0', fetcher = fetch, now = Date.now, collections = COLLECTIONS } = {}) {
    this.store = store; this.interval = interval; this.userAgent = userAgent; this.fetcher = fetcher; this.now = now;
    this.jobs = collections.map(collection => ({ collection, page: 1 }));
    this.index = 0; this.cache = new Map(); this.policy = null; this.policyExpires = 0;
    this.busy = false; this.nextAt = 0; this.failures = 0;
    this.state = { running: true, phase: 'starting', requests: 0, scans: 0, changes: 0, errors: 0, lastScan: null, nextScan: null, message: 'Waiting for first scan', interval, coverage: 'One collection page per tick; both collections rotate fairly.' };
  }
  pause() { this.state.running = false; this.state.phase = this.busy ? 'finishing' : 'paused'; }
  resume() { this.state.running = true; this.state.phase = 'waiting'; }
  async request(path, headers = {}) {
    this.state.requests++;
    return this.fetcher(ORIGIN + path, { headers: { 'User-Agent': this.userAgent, Accept: 'application/json,text/plain', ...headers }, redirect: 'error', signal: AbortSignal.timeout(12000) });
  }
  async tick() {
    if (this.busy || !this.state.running || this.now() < this.nextAt) return false;
    this.busy = true;
    this.state.phase = 'scanning';
    // Absolute request spacing, no overlapping requests or catch-up bursts.
    this.nextAt = this.now() + Math.max(this.interval, this.policy?.delay || 0);
    try {
      if (!this.policy || this.now() >= this.policyExpires) {
        const response = await this.request('/robots.txt');
        if (!response.ok && ![404, 410].includes(response.status)) throw this.httpError(response, 'robots.txt');
        const text = response.ok ? await response.text() : '';
        if (response.ok && /<html|<!doctype/i.test(text)) throw new Error('robots.txt returned HTML; collection paused until a valid policy is available');
        this.policy = parseRobots(text);
        this.policyExpires = this.now() + 6 * 3600000;
        this.nextAt = this.now() + Math.max(this.interval, this.policy.delay);
        this.state.message = 'Access rules refreshed; first product page is queued';
        this.failures = 0;
        return true;
      }
      const job = this.jobs[this.index];
      const path = `/collections/${job.collection}/products.json?limit=250&page=${job.page}`;
      if (!this.policy.allowed(path)) {
        this.pause();
        throw new Error('robots.txt disallows this product feed. Live collection is paused.');
      }
      const cached = this.cache.get(path);
      const response = await this.request(path, cached?.etag ? { 'If-None-Match': cached.etag } : cached?.modified ? { 'If-Modified-Since': cached.modified } : {});
      let payload;
      if (response.status === 304 && cached) payload = cached.payload;
      else {
        if (!response.ok) throw this.httpError(response, 'product feed');
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Feed returned non-JSON content; no observations were saved');
        const text = await response.text();
        if (text.length > 12000000) throw new Error('Feed exceeded the 12 MB response limit');
        payload = JSON.parse(text);
        if (!Array.isArray(payload.products) || payload.products.some(p => !p || typeof p.title !== 'string' || !Array.isArray(p.variants))) throw new Error('Product feed schema changed; no observations were saved');
        this.cache.set(path, { payload, etag: response.headers.get('etag'), modified: response.headers.get('last-modified') });
      }
      const items = normalize(payload.products);
      const at = new Date(this.now()).toISOString();
      this.state.changes += this.store.ingest(items, at);
      this.state.scans++;
      this.state.lastScan = at;
      this.state.message = `${items.length} component variants checked · ${response.status === 304 ? 'unchanged feed' : 'HTTP 200'} · page ${job.page}`;
      if (payload.products.length >= 250 && job.page >= 100) {
        this.pause();
        this.state.message += ' · Pagination limit reached; review collection coverage before resuming.';
      }
      job.page = payload.products.length < 250 || job.page >= 100 ? 1 : job.page + 1;
      this.index = (this.index + 1) % this.jobs.length;
      this.failures = 0;
    } catch (error) {
      this.failures++;
      this.state.errors++;
      const delay = retryDelay(error.retryAfter, this.failures, this.now());
      this.nextAt = Math.max(this.nextAt, this.now() + delay);
      this.state.message = error.message;
      this.state.phase = this.state.running ? 'backoff' : 'paused';
      console.error(JSON.stringify({ level: 'warn', event: 'scan_failed', message: error.message, retryInMs: delay }));
    } finally {
      this.busy = false;
      if (this.state.phase === 'scanning') this.state.phase = this.state.running ? 'waiting' : 'paused';
      if (!this.state.running) this.state.phase = 'paused';
      this.state.nextScan = new Date(this.nextAt).toISOString();
    }
    return true;
  }
  httpError(response, resource) {
    if ([401, 403].includes(response.status)) this.pause();
    const error = new Error(`${resource}: HTTP ${response.status}${[401, 403].includes(response.status) ? '; collection paused, access must be resolved' : ''}`);
    error.retryAfter = response.headers.get('retry-after');
    return error;
  }
}
