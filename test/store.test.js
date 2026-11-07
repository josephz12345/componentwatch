import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
const p={id:'1:2',title:'Test SSD',category:'SSD',price:10000,available:true};
test('unchanged scans update freshness without duplicating history',t=>{
  const s=new Store();t.after(()=>s.close());s.ingest([p],'2026-01-01T00:00:00.000Z');s.ingest([p],'2026-01-01T00:00:05.000Z');
  assert.equal(s.history(p.id).length,1);assert.equal(s.products()[0].lastSeen,'2026-01-01T00:00:05.000Z');
  s.ingest([{...p,price:9000}]);assert.equal(s.history(p.id).length,2);assert.equal(s.events()[0].kind,'price_drop');assert.equal(s.products()[0].low,9000);
});
test('stock transitions are independent of price changes',t=>{
  const s=new Store();t.after(()=>s.close());s.ingest([{...p,available:false}]);s.ingest([p]);
  assert.equal(s.events()[0].kind,'restock');assert.equal(s.history(p.id).length,2);
});
test('target is edge-triggered and rearms after price moves above target',t=>{
  const s=new Store();t.after(()=>s.close());s.ingest([p]);s.watch(p.id,true,9500);
  s.ingest([{...p,price:9000}]);s.ingest([{...p,price:9000}]);
  assert.equal(s.events().filter(e=>e.kind==='target_hit').length,1);
  s.ingest([p]);s.ingest([{...p,price:9000}]);assert.equal(s.events().filter(e=>e.kind==='target_hit').length,2);
});
test('target set below an unavailable price waits for stock and unchanged saves do not duplicate alerts',t=>{
  const s=new Store();t.after(()=>s.close());s.ingest([{...p,available:false}]);s.watch(p.id,true,11000);
  assert.equal(s.events().filter(e=>e.kind==='target_hit').length,0);s.ingest([p]);s.watch(p.id,true,11000);
  assert.equal(s.events().filter(e=>e.kind==='target_hit').length,1);
});
test('pruning preserves the last observation and watchlists',t=>{
  const s=new Store();t.after(()=>s.close());s.ingest([p],'2020-01-01T00:00:00.000Z');s.watch(p.id,true,8000);s.prune(30);
  assert.equal(s.history(p.id).length,1);assert.equal(s.products()[0].target,8000);assert.equal(s.events().length,0);
});
