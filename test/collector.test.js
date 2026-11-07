import test from 'node:test';
import assert from 'node:assert/strict';
import { Collector, retryDelay } from '../src/collector.js';
import { parseRobots } from '../src/robots.js';
import { Store } from '../src/store.js';
const feed={products:[{id:1,title:'Crucial SSD',handle:'ssd',variants:[{id:2,title:'New',price:'100',available:true}]}]};
const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json','etag':'v1'}});
test('robots uses specific agents, wildcard paths, longest match, allow ties and crawl delay',()=>{
  const p=parseRobots('User-agent: *\nDisallow: /\nUser-agent: ComponentWatch\nDisallow: /private\nAllow: /private/public\nDisallow: /*?*sort_by*\nCrawl-delay: 8');
  assert.equal(p.allowed('/products/ssd'),true);assert.equal(p.allowed('/private'),false);assert.equal(p.allowed('/private/public/a'),true);assert.equal(p.allowed('/collections/a?sort_by=price'),false);assert.equal(p.delay,8000);
  assert.equal(parseRobots('User-agent: *\nAllow: /x\nDisallow: /x').allowed('/x'),true);
  assert.equal(parseRobots('User-agent: *\nDisallow: /x$').allowed('/xyz'),true);
});
test('Retry-After seconds and HTTP dates are minimum waits',()=>{
  assert.equal(retryDelay('120',1,0,()=>0),120000);
  assert.equal(retryDelay('Thu, 01 Jan 1970 00:02:00 GMT',1,0,()=>0),120000);
  assert.equal(retryDelay(null,1,0,()=>0),10000);
});
test('spaces requests, uses ETag, preserves data on 304, and never overlaps',async t=>{
  const s=new Store();t.after(()=>s.close());let now=0,calls=0,headers;
  const c=new Collector(s,{collections:['components'],now:()=>now,fetcher:async(url,opts)=>{calls++;headers=opts.headers;return calls===1?new Response('User-agent: *\nAllow: /'):calls===2?json(feed):new Response(null,{status:304});}});
  await c.tick();await c.tick();assert.equal(calls,1);now=5000;await c.tick();assert.equal(s.products().length,1);
  now=10000;await Promise.all([c.tick(),c.tick()]);assert.equal(calls,3);assert.equal(headers['If-None-Match'],'v1');assert.equal(s.history('1:2').length,1);assert.equal(s.products()[0].lastSeen,new Date(10000).toISOString());
});
test('429 backs off and rejects manual scheduling before Retry-After',async t=>{
  const s=new Store();t.after(()=>s.close());let now=0,calls=0;
  const c=new Collector(s,{now:()=>now,fetcher:async()=>++calls===1?new Response('User-agent: *\nAllow: /'):new Response('',{status:429,headers:{'retry-after':'120'}})});
  await c.tick();now=5000;await c.tick();assert.equal(c.state.phase,'backoff');assert.ok(c.nextAt>=125000);now=10000;await c.tick();assert.equal(calls,2);
});
test('403 pauses instead of evading access controls',async t=>{
  const s=new Store();t.after(()=>s.close());let now=0,calls=0;
  const c=new Collector(s,{now:()=>now,fetcher:async()=>++calls===1?new Response('User-agent: *\nAllow: /'):new Response('',{status:403})});
  await c.tick();now=5000;await c.tick();assert.equal(c.state.running,false);assert.equal(c.state.phase,'paused');
});
test('denied robots policy never fetches a product page',async t=>{
  const s=new Store();t.after(()=>s.close());let now=0,calls=0;
  const c=new Collector(s,{now:()=>now,fetcher:async()=>{calls++;return new Response('User-agent: *\nDisallow: /collections');}});
  await c.tick();now=5000;await c.tick();assert.equal(calls,1);assert.equal(c.state.running,false);
});
test('schema drift preserves prior inventory',async t=>{
  const s=new Store();t.after(()=>s.close());s.ingest([{id:'keep',title:'Existing',price:5000,available:true}]);let now=0,calls=0;
  const c=new Collector(s,{now:()=>now,fetcher:async()=>++calls===1?new Response('User-agent: *\nAllow: /'):json({data:[]})});
  await c.tick();now=5000;await c.tick();assert.equal(s.products().length,1);assert.equal(c.state.errors,1);
});
test('round-robin pagination eventually returns to page one',async t=>{
  const s=new Store();t.after(()=>s.close());let now=0;const paths=[];
  const c=new Collector(s,{collections:['components','storage'],now:()=>now,fetcher:async url=>{paths.push(url);if(url.endsWith('robots.txt'))return new Response('User-agent: *\nAllow: /');return json({products:url.includes('components')&&url.endsWith('page=1')?Array.from({length:250},()=>feed.products[0]):[]});}});
  for(let i=0;i<5;i++){await c.tick();now+=5000;}
  assert.match(paths[1],/components.*page=1$/);assert.match(paths[2],/storage.*page=1$/);assert.match(paths[3],/components.*page=2$/);assert.equal(c.jobs[0].page,1);
});
