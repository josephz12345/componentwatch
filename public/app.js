import { demoSeed, demoChange } from './demo-data.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents/100);
const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/>',
  pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  trend:'<path d="m3 6 6 6 4-4 8 9m-6 0h6v-6"/>',
  layers:'<path d="m3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
  box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/>',
  gpu:'<rect x="2" y="5" width="20" height="13" rx="2"/><circle cx="8" cy="11.5" r="3.5"/><circle cx="17" cy="11.5" r="3.5"/><path d="M5 19v2h10v-2M2 8H0M2 16H0M8 8v7m-3-3.5h6m6-3.5v7m-3-3.5h6"/>',
  ssd:'<rect x="2" y="7" width="20" height="10" rx="1"/><rect x="6" y="9" width="5" height="6" rx=".5"/><rect x="13" y="9" width="5" height="6" rx=".5"/><path d="M3 17v2m3-2v2m3-2v2m3-2v2m3-2v2m3-2v2m3-2v2"/>',
  ram:'<path d="M2 6h20v11H2ZM4 17v3h6v-2h2v2h8v-3M5 9h3v5H5Zm6 0h3v5h-3Zm6 0h3v5h-3Z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.pulse}</svg>`;
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
$('#today').textContent=new Intl.DateTimeFormat('en-US',{month:'short',day:'2-digit',year:'numeric'}).format(new Date()).toUpperCase();

let state, histories={}, backend=true, selected=null, category='ALL', view='radar', search='', sort='discount', stockOnly=false, step=0, refreshing=false;
let saved={}, toastTimer, historyRequest=0;
try { saved=JSON.parse(localStorage.getItem('componentwatch.watches.v1') || '{}'); if (!saved || typeof saved !== 'object') saved={}; } catch { saved={}; }
const toast = message => { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,3200); };
const discount = p => p.compareAt > p.price ? Math.round((1-p.price/p.compareAt)*100) : 0;
const relative = value => { const n=Math.max(0,Math.floor((Date.now()-Date.parse(value))/1000)); return n<60 ? `${n}s ago` : n<3600 ? `${Math.floor(n/60)}m ago` : n<86400 ? `${Math.floor(n/3600)}h ago` : `${Math.floor(n/86400)}d ago`; };
async function api(path, body) {
  const response=await fetch(path,{...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`Request failed (${response.status}). Is the local server running?`);
  return response.json();
}
function filtered() {
  return state.products.filter(p=>(category==='ALL'||p.category===category)&&(!stockOnly||p.available)&&(view!=='watchlist'||p.watched)&&`${p.title} ${p.brand} ${p.subtitle||''} ${p.condition}`.toLowerCase().includes(search)).sort((a,b)=>sort==='price'?a.price-b.price:sort==='name'?a.title.localeCompare(b.title):sort==='recent'?b.lastSeen.localeCompare(a.lastSeen):discount(b)-discount(a));
}
function render() {
  if(!state)return;
  const watches=state.products.filter(p=>p.watched);
  const drops=state.events.filter(e=>e.kind==='price_drop'&&Date.parse(e.at)>Date.now()-86400000).length;
  $('#stat-total').textContent=state.products.length; $('#stat-stock').textContent=state.products.filter(p=>p.available).length;
  $('#stat-drops').textContent=drops.toString().padStart(2,'0'); $('#stat-watches').textContent=watches.length.toString().padStart(2,'0');
  $('#watch-count').textContent=watches.length;
  $('#stat-targets').textContent=`${watches.filter(p=>p.target!=null).length} price targets set`;
  $('#mode').textContent=state.mode==='demo'?'DEMO / SYNTHETIC DATA':'LIVE / VIPOUTLET';
  $('#table-mode').textContent=state.mode==='demo'?'DEMO FEED':'LIVE FEED';
  $('#data-note').textContent=state.mode==='demo'?'Synthetic prices and history for demonstration. No current deals are implied.':'Observed prices, excluding taxes and shipping. Compare-at is the seller’s reference price. Unseen items retain their last known state; check observation times.';
  renderScanner(); renderRows(); renderEvents();
}
function renderScanner() {
  const s=state.scanner;
  $('#scan-status').textContent=!s.running?'Scanner paused':s.phase==='backoff'?'Waiting to retry':state.mode==='demo'?'Demo replay active':'Scanner active';
  $('#mini-status').textContent=!s.running?'Scanner paused':state.mode==='demo'?'Demo replay':'Collector online';
  $('#scan-description').textContent=state.mode==='demo'?'Synthetic inventory · refreshes every 5 seconds':s.message;
  $('#toggle-scanner').textContent=s.running?'Pause scan':'Resume scan';
  $('#status-dot').classList.toggle('paused',!s.running||s.phase==='backoff');$('#mini-dot').classList.toggle('paused',!s.running);
}
function renderRows() {
  const items=filtered();
  $('#result-count').textContent=items.length;
  $('#inventory-title').firstChild.textContent=view==='watchlist'?'Your watchlist ':'All components ';
  $('#showing').textContent=`${items.length} of ${state.products.length} variants`;
  $('#empty').hidden=items.length>0;
  $('#products').innerHTML=items.map(p=>`<tr class="${p.id===selected?'selected':''}"><td><div class="product-cell"><div class="product-icon ${p.category.toLowerCase()}">${icon(p.category.toLowerCase())}</div><div class="product-copy"><div class="product-brand">${escape(p.brand)}</div><button class="product-name" data-select="${escape(p.id)}" title="${escape(p.title)}">${escape(p.title)}</button><div class="product-spec">${escape(p.subtitle||p.category+' · '+p.condition)}</div></div></div></td><td><div class="price">${money(p.price)}</div>${discount(p)?`<span class="compare">${money(p.compareAt)}</span><span class="discount">−${discount(p)}%</span>`:'<span class="condition">Observed price</span>'}</td><td><div class="stock-badge ${p.available?'':'out'}"><i></i>${p.available?'In stock':'Sold out'}</div><div class="condition">${escape(p.condition)}</div></td><td><button class="star-button ${p.watched?'saved':''}" data-watch="${escape(p.id)}" aria-label="${p.watched?'Unwatch':'Watch'} ${escape(p.title)}" aria-pressed="${p.watched}">${icon('star')}</button></td></tr>`).join('');
}
function signal(e) {
  return `<div class="signal"><span class="signal-icon ${escape(e.kind)}">${icon(e.kind==='restock'?'box':e.kind==='target_hit'?'star':e.kind==='discovered'?'layers':'trend')}</span><div class="signal-copy"><p>${escape(e.message)}</p><time datetime="${escape(e.at)}">${relative(e.at)} · ${escape(e.kind.replaceAll('_',' '))}</time></div></div>`;
}
function renderEvents() {
  const empty='<p class="muted">No changes recorded yet. The next signal will appear here.</p>';
  $('#signals').innerHTML=state.events.slice(0,3).map(signal).join('')||empty;
  $('#all-events').innerHTML=state.events.map(signal).join('')||empty;
}
function chart(history) {
  if(history.length<2)return '<p class="chart-empty">History starts with your first observation.<br>A chart appears after the next change.</p>';
  const width=260,height=110,pad=6;
  const prices=history.map(h=>h.price), min=Math.min(...prices),max=Math.max(...prices),range=Math.max(100,max-min);
  const times=history.map(h=>Date.parse(h.at)), start=Math.min(...times), end=Math.max(...times);
  const coords=history.map((h,i)=>[pad+(times[i]-start)/Math.max(1,end-start)*(width-pad*2),height-pad-(h.price-min)/range*(height-pad*2)]);
  const points=coords.map(c=>c.join(',')).join(' '),last=coords.at(-1);
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price history, from ${money(prices[0])} to ${money(prices.at(-1))}; lowest ${money(min)}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b8e978" stop-opacity=".17"/><stop offset="100%" stop-color="#b8e978" stop-opacity="0"/></linearGradient></defs><path d="M0 15H260 M0 55H260 M0 95H260" stroke="#34442a" stroke-dasharray="2 5"/><polygon points="${pad},${height} ${points} ${width-pad},${height}" fill="url(#chart-fill)" stroke="none"/><polyline points="${points}" stroke="#c8f58a" stroke-width="2" fill="none"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#c8f58a" stroke="#171f12" stroke-width="2"/></svg><div class="chart-labels"><span>${new Date(start).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><span>${new Date(end).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>`;
}
async function renderDetail() {
  const request=++historyRequest;
  const p=state?.products.find(p=>p.id===selected);
  if(!p){$('#detail').innerHTML='<p class="muted">Select a component to inspect its history.</p>';return;}
  let history=histories[p.id]||[];
  if(backend){try{history=await api(`/api/history?id=${encodeURIComponent(p.id)}`);histories[p.id]=history;}catch(error){toast(error.message);}}
  if(request!==historyRequest)return;
  // Preserve a price target being typed during a background refresh.
  const focused=$('#target-input')===document.activeElement;
  const pending=focused?$('#target-input').value:null;
  $('#detail').innerHTML=`<div class="detail-top"><span>UNDER THE MICROSCOPE</span><span class="category-chip">${p.category}</span></div><div class="product-brand">${escape(p.brand)}</div><h2>${escape(p.title)}</h2><p class="detail-sub">${escape(p.subtitle||p.condition)}</p><div class="detail-price-row"><span class="detail-price">${money(p.price)}</span>${discount(p)?`<span class="detail-discount">−${discount(p)}% listed</span>`:''}</div><div class="chart-header"><span>PRICE HISTORY</span><span>${state.mode==='demo'?'SIMULATED':'OBSERVED'}</span></div>${chart(history)}<div class="detail-facts"><div><span>Lowest retained price</span><strong>${money(p.low)}</strong></div><div><span>Availability</span><strong>${p.available?'In stock':'Sold out'}</strong></div></div><form id="target-form"><label class="target-label" for="target-input">YOUR TARGET PRICE</label><div class="target-row"><input class="target-input" id="target-input" type="number" min="0.01" max="1000000" step="0.01" placeholder="e.g. ${(p.price*.9/100).toFixed(2)}" value="${p.target!=null?(p.target/100).toFixed(2):''}" required aria-label="Target price in US dollars"><button class="button primary" type="submit">Set alert</button></div><p class="target-hint">${p.target!=null?`Alert when in stock at ${money(p.target)} or less.`:'A signal in your activity log when the price hits.'}</p></form><p class="detail-fresh">Last observed ${relative(p.lastSeen)} · ${escape(p.condition)}</p>${p.url&&p.url.startsWith('https://vipoutlet.com/')?`<a class="store-link" href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">View listing on VIPOutlet ↗</a>`:'<span class="store-link">Demo listing · synthetic product data</span>'}`;
  if(focused&&pending!=null){$('#target-input').value=pending;$('#target-input').focus();}
  $('#target-form').addEventListener('submit',async event=>{event.preventDefault();const value=Number($('#target-input').value);if(!Number.isFinite(value)||value<=0)return;await watch(p.id,true,Math.round(value*100));});
}
async function watch(id, watched, target) {
  const p=state.products.find(p=>p.id===id); if(!p)return;
  try {
    const nextTarget=target===undefined?p.target:target;
    if(backend) { await api('/api/watch',{id,watched,target:nextTarget}); state=await api('/api/state'); }
    else {
      p.watched=watched;p.target=watched?nextTarget:null;
      saved[id]={watched,target:p.target};
      try{localStorage.setItem('componentwatch.watches.v1',JSON.stringify(saved));}catch{toast('Browser storage is unavailable; this watch lasts until reload.');}
      if(watched&&target!=null) {
        p.triggered=false;
        checkDemoTarget(p);
      }
    }
    render();await renderDetail();toast(target!==undefined?'Price target saved':watched?'Added to your watchlist':'Removed from your watchlist');
  } catch(error){toast(error.message);}
}
function addDemoEvent(p,kind,message) { state.events.unshift({id:Date.now(),productId:p.id,kind,message,at:new Date().toISOString()});state.events=state.events.slice(0,60); }
function checkDemoTarget(p) { const hit=p.watched&&p.target!=null&&p.available&&p.price<=p.target;if(hit&&!p.triggered)addDemoEvent(p,'target_hit',`${p.title} reached your ${money(p.target)} target`);p.triggered=hit; }
function setView(next) {
  view=next;const name=next==='watchlist'?'Watchlist':next==='activity'?'Activity log':'Overview';
  $('#breadcrumb').textContent=name;
  $('#page-title').innerHTML=next==='watchlist'?'The upgrade shortlist<span>.</span>':next==='activity'?'Every change, captured<span>.</span>':'The component radar<span>.</span>';
  $('#page-subtitle').textContent=next==='watchlist'?'The components you’re watching. Ready when the price is.':next==='activity'?'Follow the trail of price changes, restocks, and target alerts.':'Keep an eye on the hardware. We’ll keep an eye on the price.';
  $$('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===next);el.setAttribute('aria-current',el.dataset.view===next?'page':'false');});
  $('#radar-view').hidden=next==='activity';$('#activity-view').hidden=next!=='activity';if(state)renderRows();
}
$$('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
$$('[data-category]').forEach(el=>el.addEventListener('click',()=>{category=el.dataset.category;$$('.tab').forEach(t=>{t.classList.toggle('active',t===el);t.setAttribute('aria-pressed',String(t===el));});if(state)renderRows();}));
$('#search').addEventListener('input',e=>{search=e.target.value.toLowerCase();if(state)renderRows();});
$('#sort').addEventListener('change',e=>{sort=e.target.value;if(state)renderRows();});
$('#stock-only').addEventListener('change',e=>{stockOnly=e.target.checked;if(state)renderRows();});
$('#products').addEventListener('click',async e=>{const w=e.target.closest('[data-watch]');if(w){const p=state.products.find(p=>p.id===w.dataset.watch);await watch(p.id,!p.watched);return;}const select=e.target.closest('[data-select]');if(select){selected=select.dataset.select;renderRows();await renderDetail();}});
$('#toggle-scanner').addEventListener('click',async()=>{if(!state)return;try{if(backend)state.scanner=await api('/api/scanner',{action:state.scanner.running?'pause':'resume'});else{state.scanner.running=!state.scanner.running;state.scanner.nextScan=new Date(Date.now()+5000).toISOString();}renderScanner();}catch(error){toast(error.message);}});
$('#view-activity').addEventListener('click',()=>setView('activity'));
$('#about').addEventListener('click',()=>$('#project-dialog').showModal());
$('#project-dialog').addEventListener('click',event=>{if(event.target===$('#project-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$('#export').addEventListener('click',()=>{
  if(!state)return;
  const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['data_mode','id','category','brand','title','condition','price_usd','compare_at_usd','available','last_observed','url'],...filtered().map(p=>[state.mode,p.id,p.category,p.brand,p.title,p.condition,(p.price/100).toFixed(2),p.compareAt==null?'':(p.compareAt/100).toFixed(2),p.available,p.lastSeen,p.url])];
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`componentwatch-${state.mode}-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Filtered inventory exported');
});
async function refresh() {
  if(refreshing)return;refreshing=true;
  try {
    if(backend)state=await api('/api/state');
    else if(state.scanner.running){
      const change=demoChange(state.products,++step);
      if(change){state.products=state.products.map(p=>p.id===change.id?change:p);histories[change.id].push({price:change.price,available:+change.available,at:change.lastSeen});histories[change.id]=histories[change.id].slice(-500);addDemoEvent(change,change.price<change.previous?'price_drop':'price_rise',`${change.title}: ${money(change.previous)} → ${money(change.price)}`);state.scanner.changes++;checkDemoTarget(change);}
      state.scanner.scans++;state.scanner.lastScan=new Date().toISOString();state.scanner.nextScan=new Date(Date.now()+5000).toISOString();
      state.products.forEach(p=>p.lastSeen=state.scanner.lastScan);
    }
    $('#connection-error').hidden=true;
    if(!selected&&state.products.length)selected=state.products[0].id;
    render();await renderDetail();
  } catch(error){$('#connection-error').textContent=error.message+' Displayed data may be stale; retrying automatically.';$('#connection-error').hidden=false;$('#scan-status').textContent='Connection lost';}
  finally{refreshing=false;}
}
async function boot(){
  try {
    const config=await api('/config.json');backend=config.api;
    if(!backend){const seed=demoSeed();histories=seed.histories;state={mode:'demo',...seed,scanner:{running:true,phase:'waiting',interval:5000,scans:0,changes:0,nextScan:new Date(Date.now()+5000).toISOString()}};state.products.forEach(p=>{if(saved[p.id]&&typeof saved[p.id].watched==='boolean'){p.watched=saved[p.id].watched;p.target=Number.isSafeInteger(saved[p.id].target)?saved[p.id].target:null;}});}
    await refresh();setInterval(refresh,5000);
  }catch(error){$('#connection-error').textContent=error.message;$('#connection-error').hidden=false;}
}
setInterval(()=>{if(!state)return;const s=state.scanner;$('#countdown').textContent=!s.running?'PAUSED':s.nextScan?`NEXT ${Math.max(0,Math.ceil((Date.parse(s.nextScan)-Date.now())/1000)).toString().padStart(2,'0')}s`:'QUEUED';},500);
boot();
