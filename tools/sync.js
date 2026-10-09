/* ================= sync with the local server =================
   After every change the screen re-renders; persist() then diffs the data against what the
   server already has and sends only the changes. Other screens receive them live (SSE). */
const CLIENT=Math.random().toString(36).slice(2)+Date.now().toString(36);
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const ARRS={sales:false,house:false,closings:false,stock:true,exp:true,ledger:true,rem:true}; // true = records can be edited in place
const arrOf=c=>c==='closings'?closings():S[c];
const SYNCED={orders:{},cfg:'',done:'',arr:{}};
Object.keys(ARRS).forEach(c=>SYNCED.arr[c]=new Map());
function markSynced(){
  SYNCED.cfg=BOOT.cfg&&BOOT.cfg.length?JSON.stringify(cfgDoc()):'';
  SYNCED.done=(BOOT.done||[]).length?JSON.stringify(S.done):'';
  Object.entries(S.orders).forEach(([id,o])=>SYNCED.orders[id]=JSON.stringify(o));
  Object.keys(ARRS).forEach(c=>{ const m=SYNCED.arr[c]; (arrOf(c)||[]).forEach(r=>m.set(r.id,ARRS[c]?JSON.stringify(r):true)); });
}
function collectOps(){
  const ops=[];
  const c=JSON.stringify(cfgDoc()); if(c!==SYNCED.cfg){ ops.push({coll:'cfg',id:'main',data:JSON.parse(c)}); SYNCED.cfg=c; }
  const d=JSON.stringify(S.done||{}); if(d!==SYNCED.done){ ops.push({coll:'done',id:'main',data:JSON.parse(d)}); SYNCED.done=d; }
  for(const [id,o] of Object.entries(S.orders)){ const j=JSON.stringify(o); if(SYNCED.orders[id]!==j){ ops.push({coll:'orders',id,data:JSON.parse(j)}); SYNCED.orders[id]=j; } }
  for(const id of Object.keys(SYNCED.orders)) if(!S.orders[id]){ ops.push({coll:'orders',id,data:null}); delete SYNCED.orders[id]; }
  for(const [coll,mut] of Object.entries(ARRS)){
    const m=SYNCED.arr[coll], arr=arrOf(coll)||[], seen=new Set();
    for(const r of arr){
      if(!r.id) r.id=uid(coll[0]);
      seen.add(r.id);
      const prev=m.get(r.id);
      if(prev===undefined){ const j=JSON.stringify(r); ops.push({coll,id:r.id,data:JSON.parse(j)}); m.set(r.id,mut?j:true); }
      else if(mut){ const j=JSON.stringify(r); if(j!==prev){ ops.push({coll,id:r.id,data:JSON.parse(j)}); m.set(r.id,j); } }
    }
    if(seen.size!==m.size) for(const id of [...m.keys()]) if(!seen.has(id)){ ops.push({coll,id,data:null}); m.delete(id); }
  }
  return ops;
}
let QUEUE=[], sending=false, ptimer=null, online=true;
function schedulePersist(){ if(ptimer) return; ptimer=setTimeout(()=>{ ptimer=null; persist(); },0); }
async function persist(){
  const ops=collectOps(); if(ops.length) QUEUE.push(...ops);
  if(sending||!QUEUE.length) return;
  sending=true; const batch=QUEUE.splice(0);
  try{
    const r=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:CLIENT,ops:batch})});
    if(r.status===401){ location.href='/login'; return; }
    if(!r.ok) throw new Error('sync '+r.status);
    setOnline(true);
  }catch(e){ QUEUE.unshift(...batch); setOnline(false); setTimeout(persist,3000); }
  finally{ sending=false; if(QUEUE.length&&online) persist(); }
}
function setOnline(v){
  if(online===v) return; online=v;
  let b=document.getElementById('netbar');
  if(!v&&!b){ b=document.createElement('div'); b.id='netbar'; b.textContent=BOOT.local?'Po ruhet… (provo përsëri)':'Pa lidhje me kompjuterin e barit. Ndryshimet ruhen sapo të kthehet lidhja.'; document.body.appendChild(b); }
  if(v&&b) b.remove();
}
/* apply changes made on another screen */
function applyRemote(ops){
  for(const op of ops){
    const data=op.data==null?null:revive(op.data);
    if(op.coll==='cfg'){ applyCfg(data); SYNCED.cfg=JSON.stringify(cfgDoc()); continue; }
    if(op.coll==='done'){ S.done=data||{}; SYNCED.done=JSON.stringify(S.done); continue; }
    if(op.coll==='orders'){
      if(data){ S.orders[op.id]=data; SYNCED.orders[op.id]=JSON.stringify(data); }
      else { delete S.orders[op.id]; delete SYNCED.orders[op.id]; if(S.table===op.id&&S.view==='order'){ S.view='tables'; S.table=null; } if(S.sel===op.id) S.sel=null; }
      continue;
    }
    if(ARRS[op.coll]!==undefined){
      const arr=arrOf(op.coll), m=SYNCED.arr[op.coll], i=arr.findIndex(r=>r.id===op.id);
      if(data){ if(i>=0) arr[i]=data; else { arr.push(data); if(data.t) arr.sort((a,b)=>a.t-b.t); } m.set(op.id,ARRS[op.coll]?JSON.stringify(data):true); }
      else { if(i>=0) arr.splice(i,1); m.delete(op.id); }
    }
  }
  softRender();
}
let pendingRender=false;
function softRender(){
  const a=document.activeElement;
  if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT')&&a.id!=='q'){ pendingRender=true; return; }
  if(layer.innerHTML){ pendingRender=true; return; }
  render();
}
document.addEventListener('focusout',()=>setTimeout(()=>{ if(pendingRender&&!layer.innerHTML){ const a=document.activeElement; if(!a||!/INPUT|TEXTAREA|SELECT/.test(a.tagName)){ pendingRender=false; render(); } } },50));
new MutationObserver(()=>{ if(!layer.innerHTML&&pendingRender){ pendingRender=false; render(); } }).observe(layer,{childList:true});
function connectEvents(){
  const es=new EventSource('/api/events?client='+CLIENT);
  es.onmessage=e=>{ const m=JSON.parse(e.data); if(m.ops) applyRemote(m.ops); if(m.info){ INFO=m.info; if(S.view==='sys') softRender(); } if(m.hello&&!online) setOnline(true); };
  es.onerror=()=>{ setOnline(false); };
  es.onopen=()=>{ setOnline(true); if(QUEUE.length) persist(); };
}
/* printing: on the bar PC the app prints silently to the receipt printer; elsewhere the browser prints */
const RECEIPT_CSS=`@page{size:80mm auto;margin:0}html,body{margin:0;padding:0;background:#fff}body{width:72mm;padding:3mm 4mm;color:#000;font:13px/1.35 Arial,sans-serif}img{width:40mm;display:block;margin:0 auto 2mm}.pc{text-align:center;font-size:12px}hr{border:0;border-top:1px dashed #000;margin:2mm 0}.pr{display:flex;justify-content:space-between;gap:3mm}.pt{font-size:16px;font-weight:700}`;
async function doPrint(){
  const el=document.getElementById('prt'); if(!el) return;
  if(!BOOT.local){ setTimeout(()=>{ try{ window.print(); }catch(e){} },60); return; }
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${el.innerHTML}</body></html>`;
  try{
    const r=await fetch('/api/local/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html})});
    const j=await r.json(); if(!j.ok) toast('Printimi dështoi: '+(j.error||'kontrollo printerin'));
  }catch(e){ toast('Printimi dështoi'); }
}
/* -------- Sistemi (system settings) -------- */
let INFO=BOOT.info||{}; let PRINTERS=null;
const api=(p,body)=>fetch(p,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
function sysView(){
  const ts=(INFO.addresses||[]).filter(a=>a.tailscale), lan=(INFO.addresses||[]).filter(a=>!a.tailscale);
  const b=INFO.backup, up=INFO.update;
  const when=t=>{ const d=new Date(t); return `${dayLabel(d)} · ${hm(d)}`; };
  if(BOOT.local&&PRINTERS===null){ PRINTERS=[]; api('/api/local/printers').then(l=>{ PRINTERS=l||[]; if(S.view==='sys') render(); }).catch(()=>{}); }
  return `<div class="oh"><h1>Sistemi</h1><span class="ahint">Versioni ${esc(INFO.version||'')}</span></div>
  <div class="sysg">
    ${BOOT.local?`<section class="box"><h3>Printeri i faturave</h3>
      <p class="sy-p">Faturat printohen direkt, pa dritare, në printerin e zgjedhur.</p>
      <select class="ai" id="sys-printer" aria-label="Printeri"><option value="">Printeri kryesor i Windows-it</option>${(PRINTERS||[]).map(p=>`<option value="${esc(p.name)}" ${INFO.printer===p.name?'selected':''}>${esc(p.displayName||p.name)}${p.isDefault?' (kryesor)':''}</option>`).join('')}</select>
      <button class="btn out full" data-act="printtest">${I.print}Printo një faturë prove</button>
    </section>`:''}
    <section class="box"><h3>Backup</h3>
      <p class="sy-p">Çdo natë dhe pas çdo mbylljeje të ditës bëhet një kopje e të dhënave në këtë kompjuter${b&&b.onedrive?' dhe në OneDrive':''}.</p>
      <div class="sy-r"><span>E fundit</span><b>${b?when(b.at):'Ende asnjë'}</b></div>
      ${b&&b.onedrive?`<div class="sy-r"><span>OneDrive</span><b class="ok">Po</b></div>`:`<div class="sy-r"><span>OneDrive</span><b class="warn">Jo, hyr në OneDrive në këtë PC</b></div>`}
      ${BOOT.local?`<div class="btns"><button class="btn out" data-act="backupnow">${I.dl}Bëj backup tani</button><button class="btn out" data-act="openbackups">Hap dosjen</button></div>
      <button class="link-btn" data-act="restore">Rikthe të dhënat nga një backup…</button>`:''}
    </section>
    <section class="box"><h3>Qasja nga larg</h3>
      <p class="sy-p">Pronari hap aplikacionin nga telefoni ose laptopi, kudo që është, përmes Tailscale. Hyn me PIN-in e pronarit.</p>
      ${ts.length?ts.map(a=>`<div class="sy-addr">http://${esc(INFO.hostname||a.ip)}:${INFO.port}<small>ose http://${esc(a.ip)}:${INFO.port}</small></div>`).join(''):`<div class="sy-r"><span>Tailscale</span><b class="warn">Nuk është aktiv në këtë PC</b></div>`}
      ${lan.length?`<div class="sy-r"><span>Në Wi-Fi të lokalit</span><b>http://${esc(lan[0].ip)}:${INFO.port}</b></div>`:''}
      ${BOOT.remote?`<button class="btn out full" data-act="logout">Dil nga kjo pajisje</button>`:''}
    </section>
    <section class="box"><h3>PIN-i i pronarit</h3>
      <p class="sy-p">Hap Zyrën dhe qasjen nga larg. Ndërroje nga PIN-i fillestar 1234.</p>
      <form class="pinf" id="pinform"><input class="ai" id="pin-old" inputmode="numeric" maxlength="4" placeholder="PIN-i aktual" autocomplete="off"><input class="ai" id="pin-new" inputmode="numeric" maxlength="4" placeholder="PIN-i i ri (4 shifra)" autocomplete="off"><button class="btn pri" type="submit">Ruaj PIN-in</button></form>
    </section>
    <section class="box"><h3>Përditësimet</h3>
      <div class="sy-r"><span>Versioni</span><b>${esc(INFO.version||'')}</b></div>
      <div class="sy-r"><span>Gjendja</span><b>${up?esc(up.text||''):'Kontrollohet automatikisht'}</b></div>
      ${BOOT.local&&up&&up.ready?`<button class="btn pri full" data-act="installupdate">Instalo tani dhe rindiz</button>`:''}
    </section>
  </div>`;
}
document.addEventListener('change',e=>{ if(e.target.id==='sys-printer'){ api('/api/local/printer',{name:e.target.value}).then(()=>{ INFO.printer=e.target.value; toast('Printeri u ruajt'); }); } });
document.addEventListener('submit',e=>{
  if(e.target.id!=='pinform') return; e.preventDefault();
  const o=document.getElementById('pin-old').value.trim(), n=document.getElementById('pin-new').value.trim();
  if(o!==CFG.pin){ toast('PIN-i aktual është i gabuar'); return; }
  if(!/^\d{4}$/.test(n)){ toast('PIN-i i ri duhet të ketë 4 shifra'); return; }
  CFG.pin=n; render(); toast('PIN-i u ndryshua');
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]'); if(!b) return; const a=b.dataset.act;
  if(a==='printtest'){ const el=document.getElementById('prt'); const d=now(); el.innerHTML=`<img src="${LOGO}" alt=""><div class="pc"><b>FATURË PROVE</b></div><div class="pc">${d.toLocaleDateString('sq-AL')} · ${hm(d)}</div><hr><div class="pr"><span>1 × Makiato e vogël</span><span>${fmt(1)}</span></div><div class="pr"><span>2 × Ujë Dea 0.5L</span><span>${fmt(1.4)}</span></div><hr><div class="pr pt"><span>TOTALI</span><span>${fmt(2.4)}</span></div><hr><div class="pc">Printeri punon mirë.</div>`; doPrint(); toast('U dërgua në printer'); }
  if(a==='backupnow'){ toast('Po bëhet backup…'); const r=await api('/api/local/backup',{}); toast(r.ok?'Backup u krye':'Backup dështoi: '+(r.error||'')); if(r.ok){ INFO=await api('/api/info'); render(); } }
  if(a==='openbackups') api('/api/local/open-backups',{});
  if(a==='restore') api('/api/local/restore',{}).then(r=>{ if(r&&r.error) toast(r.error); });
  if(a==='installupdate') api('/api/local/install-update',{});
  if(a==='logout'){ await api('/api/logout',{}); location.href='/login'; }
});
async function backupBeforeReset(){ try{ const r=await api(BOOT.local?'/api/local/backup':'/api/backup',{}); return !!(r&&r.ok); }catch(e){ return false; } }
/* boot */
markSynced();
if(BOOT.remote){ S.admin=true; }
connectEvents();
render();
schedulePersist();
