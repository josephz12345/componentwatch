import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { configuration } from './config.js';
import { Store } from './store.js';
import { Collector } from './collector.js';
import { demoSeed, demoChange } from '../public/demo-data.js';

const publicRoot = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
export function seedDemo(store) {
  if (store.products().length) return;
  const seed = demoSeed();
  for (let j = 0; j < 15; j++) {
    for (const p of seed.products) { const h=seed.histories[p.id][j]; store.ingest([{...p, price:h.price}], h.at); }
  }
  for (const p of seed.products.filter(p=>p.watched)) store.watch(p.id, true);
}
export function createApp({ store, collector, mode, port = 3000 }) {
  return http.createServer(async (req, res) => {
    const send = (code, data) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.shopify.com data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      // Single-user local app: reject foreign Host/Origin to protect state from DNS rebinding/CSRF.
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return send(403, {error:'Use a localhost URL. Add authenticated ingress before remote hosting.'});
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(403,{error:'Cross-origin requests are not allowed'});
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, {mode, products:store.products(), events:store.events(), scanner:collector.state});
      if (req.method === 'GET' && url.pathname === '/api/history') return send(200, store.history(url.searchParams.get('id') || ''));
      if (req.method === 'GET' && url.pathname === '/api/health') return send(200, {ok:true, mode, version:'1.0.0', scanner:collector.state.phase});
      if (req.method === 'POST' && ['/api/watch', '/api/scanner'].includes(url.pathname)) {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'Use application/json'});
        let text = '';
        for await (const chunk of req) { text += chunk; if (text.length > 8192) return send(413,{error:'Request too large'}); }
        let body; try { body = JSON.parse(text); } catch { return send(400,{error:'Invalid JSON'}); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400,{error:'Expected a JSON object'});
        if (url.pathname === '/api/watch') {
          if (typeof body.id !== 'string' || typeof body.watched !== 'boolean' || (body.target != null && (!Number.isSafeInteger(body.target) || body.target < 0 || body.target > 100000000))) return send(400,{error:'Invalid watch or target; use integer cents'});
          return store.watch(body.id, body.watched, body.target ?? null) ? send(200,{ok:true}) : send(404,{error:'Unknown product'});
        }
        if (!['pause','resume'].includes(body.action)) return send(400,{error:'Choose pause or resume'});
        collector[body.action](); return send(200,collector.state);
      }
      if (url.pathname.startsWith('/api/')) return send(404,{error:'Endpoint not found'});
      if (!['GET','HEAD'].includes(req.method)) return send(405,{error:'Method not allowed'});
      const path = resolve(publicRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(publicRoot + sep) && path !== publicRoot) return send(403,{error:'Forbidden'});
      const content = await readFile(path);
      const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'};
      res.writeHead(200,{'Content-Type':(mime[extname(path)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      send(error.code === 'ENOENT' ? 404 : 500, {error:error.code === 'ENOENT' ? 'Not found' : 'Request failed'});
      if (error.code !== 'ENOENT') console.error(error.message);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = configuration();
  const store = new Store(config.dbPath);
  const collector = new Collector(store, config);
  let step = 0;
  if (config.mode === 'demo') {
    seedDemo(store); collector.state.phase='waiting'; collector.state.message='Synthetic demo replay · no VIPOutlet requests';
    collector.state.coverage='Synthetic fixtures, not live listings.';
  }
  const tick = async () => {
    if (config.mode === 'live') await collector.tick();
    else if (collector.state.running) {
      const change = demoChange(store.products(), ++step);
      if (change) collector.state.changes += store.ingest([change]);
      collector.state.scans++;
      collector.state.lastScan=new Date().toISOString();
      collector.state.nextScan=new Date(Date.now()+config.interval).toISOString();
    }
  };
  const server = createApp({store,collector,...config});
  server.listen(config.port,config.host,()=>{ console.log(`ComponentWatch (${config.mode}) → http://localhost:${config.port}`); tick(); });
  const timer=setInterval(tick,config.interval);
  store.prune(config.retentionDays);
  const retention=setInterval(()=>store.prune(config.retentionDays),3600000);
  let stopping = false;
  const stop=()=>{ if(stopping)return; stopping=true; clearInterval(timer); clearInterval(retention); collector.pause(); server.close(async()=>{ while(collector.busy) await new Promise(r=>setTimeout(r,50)); store.close(); }); };
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
}
