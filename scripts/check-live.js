import { Collector } from '../src/collector.js';
import { Store } from '../src/store.js';
const store = new Store();
const collector = new Collector(store);
await collector.tick();
if (!collector.policy) { store.close(); throw new Error(collector.state.message); }
await new Promise(r=>setTimeout(r,Math.max(0,collector.nextAt-Date.now())));
await collector.tick();
const products=store.products();
console.log(JSON.stringify({status:collector.state.phase,message:collector.state.message,variants:products.length,categories:Object.fromEntries(['RAM','SSD','GPU'].map(c=>[c,products.filter(p=>p.category===c).length]))},null,2));
store.close();
if (!collector.state.scans) process.exitCode=1;
