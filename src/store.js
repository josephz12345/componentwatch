import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, price INTEGER NOT NULL, available INTEGER NOT NULL,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
        price INTEGER NOT NULL, available INTEGER NOT NULL, at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_product_at ON history(product_id, at);
      CREATE TABLE IF NOT EXISTS watches (
        product_id TEXT PRIMARY KEY REFERENCES products(id), target INTEGER, triggered INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY, product_id TEXT REFERENCES products(id), kind TEXT NOT NULL,
        message TEXT NOT NULL, at TEXT NOT NULL
      );`);
  }
  ingest(items, at = new Date().toISOString()) {
    let changes = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of items) {
        const old = this.db.prepare('SELECT * FROM products WHERE id = ?').get(p.id);
        this.db.prepare(`INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, price=excluded.price,
          available=excluded.available, last_seen=excluded.last_seen`).run(p.id, JSON.stringify(p), p.price, +p.available, at, at);
        if (!old || old.price !== p.price || old.available !== +p.available) {
          this.db.prepare('INSERT INTO history(product_id,price,available,at) VALUES (?,?,?,?)').run(p.id, p.price, +p.available, at);
          changes++;
          if (!old) this.event(p.id, 'discovered', `${p.title} added to the radar`, at);
          else {
            if (old.price !== p.price) this.event(p.id, p.price < old.price ? 'price_drop' : 'price_rise', `${p.title}: $${(old.price/100).toFixed(2)} → $${(p.price/100).toFixed(2)}`, at);
            if (old.available !== +p.available) this.event(p.id, p.available ? 'restock' : 'sold_out', `${p.title} is ${p.available ? 'back in stock' : 'out of stock'}`, at);
          }
        }
        const watch = this.db.prepare('SELECT * FROM watches WHERE product_id=?').get(p.id);
        if (watch?.target != null) {
          const hit = p.available && p.price <= watch.target;
          if (hit && !watch.triggered) this.event(p.id, 'target_hit', `${p.title} reached your $${(watch.target/100).toFixed(2)} target`, at);
          this.db.prepare('UPDATE watches SET triggered=? WHERE product_id=?').run(+hit, p.id);
        }
      }
      this.db.exec('COMMIT');
      return changes;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(id, kind, message, at) { this.db.prepare('INSERT INTO events(product_id,kind,message,at) VALUES(?,?,?,?)').run(id, kind, message, at); }
  products() {
    return this.db.prepare(`SELECT p.*, w.target, w.product_id AS watched,
      (SELECT MIN(price) FROM history WHERE product_id=p.id) AS low,
      (SELECT price FROM history WHERE product_id=p.id ORDER BY at DESC, id DESC LIMIT 1 OFFSET 1) AS previous
      FROM products p LEFT JOIN watches w ON p.id=w.product_id ORDER BY p.last_seen DESC, p.id`).all().map(row => ({
        ...JSON.parse(row.payload), firstSeen: row.first_seen, lastSeen: row.last_seen,
        watched: !!row.watched, target: row.target, low: row.low, previous: row.previous ?? row.price,
      }));
  }
  history(id) { return this.db.prepare('SELECT price, available, at FROM (SELECT id,price,available,at FROM history WHERE product_id=? ORDER BY at DESC,id DESC LIMIT 500) ORDER BY at,id').all(id); }
  events() { return this.db.prepare('SELECT id,product_id AS productId,kind,message,at FROM events ORDER BY at DESC,id DESC LIMIT 60').all(); }
  watch(id, watched, target = null) {
    if (!this.db.prepare('SELECT id FROM products WHERE id=?').get(id)) return false;
    if (watched) {
      this.db.prepare(`INSERT INTO watches(product_id,target) VALUES(?,?) ON CONFLICT(product_id)
        DO UPDATE SET target=excluded.target, triggered=CASE WHEN watches.target IS excluded.target THEN watches.triggered ELSE 0 END`).run(id, target);
      const p = JSON.parse(this.db.prepare('SELECT payload FROM products WHERE id=?').get(id).payload);
      // Creating an alert is not a new price observation. Preserve last_seen.
      const watch = this.db.prepare('SELECT * FROM watches WHERE product_id=?').get(id);
      const hit = target != null && p.available && p.price <= target;
      if (hit && !watch.triggered) this.event(id, 'target_hit', `${p.title} reached your $${(target/100).toFixed(2)} target`, new Date().toISOString());
      this.db.prepare('UPDATE watches SET triggered=? WHERE product_id=?').run(+hit,id);
    } else this.db.prepare('DELETE FROM watches WHERE product_id=?').run(id);
    return true;
  }
  prune(days, now = Date.now()) {
    const cutoff = new Date(now - days * 86400000).toISOString();
    // Keep the most recent observation even when a product has been unchanged for months.
    this.db.prepare('DELETE FROM history WHERE at < ? AND id NOT IN (SELECT MAX(id) FROM history GROUP BY product_id)').run(cutoff);
    this.db.prepare('DELETE FROM events WHERE at < ?').run(cutoff);
  }
  close() { this.db.close(); }
}
