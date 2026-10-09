/* -------- reset data: today, this week, this month, last month, or everything (settings stay) -------- */
const RESET_KINDS=[['day','Sot'],['week','Kjo javë'],['month','Ky muaj'],['last','Muaji i kaluar'],['all','Të gjitha']];
function resetRange(kind){
  const t=now(), y=t.getFullYear(), m=t.getMonth(), END=new Date(8.64e15);
  if(kind==='day') return {a:drawer().from,b:END,live:true};
  if(kind==='week') return {a:weekStart(t),b:END,live:true};
  if(kind==='month') return {a:new Date(y,m,1),b:END,live:true};
  if(kind==='last') return {a:new Date(y,m-1,1),b:new Date(y,m,1),live:false};
  return {a:new Date(-8.64e15),b:END,live:true,all:true};
}
function resetScope(kind){
  const R=resetRange(kind), inR=x=>x.t>=R.a&&x.t<R.b;
  const openT=R.live?Object.keys(S.orders).filter(id=>!isAcct(id)):[], openA=CFG.accounts.filter(a=>S.orders[a.id]);
  return {...R,
    sales:S.sales.filter(inR).length, house:S.house.filter(inR).length, exp:S.exp.filter(inR).length, ledger:S.ledger.filter(inR).length,
    stock:S.stock.filter(inR).length, closings:closings().filter(inR).length, tables:openT.length,
    accts:R.all?openA.length:sum(openA,a=>S.orders[a.id].rounds.filter(inR).length)};
}
function resetDesc(kind,R){
  const t=now();
  if(kind==='day') return `Fshihet gjithçka që u regjistrua që nga ${sod(R.a).getTime()===sod(t).getTime()?'sot në '+hm(R.a):dayLabel(R.a)+' '+hm(R.a)} (hapja e ditës), si të mos kishte ndodhur.`;
  if(kind==='week') return `Fshihet gjithçka nga ${dayLabel(R.a)} deri tani, bashkë me tavolinat e hapura.`;
  if(kind==='month') return `Fshihet gjithçka nga 1 ${MONTHS[R.a.getMonth()]} deri tani, bashkë me tavolinat e hapura.`;
  if(kind==='last') return `Fshihet vetëm muaji ${MONTHS[R.a.getMonth()]} ${R.a.getFullYear()}. Sot dhe tavolinat e hapura nuk preken.`;
  return 'Aplikacioni kthehet si i ri. Menyja, çmimet, tavolinat, stafi, pagat, klientët dhe kujtesat mbeten.';
}
function resetModal(kind){
  S.rk=kind; const R=resetScope(kind), A=kind==='all';
  const rows=[[R.sales,'fatura'],[R.tables,'tavolina të hapura'],[R.accts,A?'llogari të klientëve të rregullt':'porosi te klientët e rregullt'],[R.house,'nga shtëpia'],[R.exp,'shpenzime'],[R.ledger,'avanse dhe paga'],[R.stock,'lëvizje stoku'],[R.closings,'mbyllje ditësh']].filter(r=>r[0]);
  const lbl=RESET_KINDS.find(k=>k[0]===kind)[1];
  modal(`<div class="sp-h"><h3>Fshi të dhënat</h3><button class="x" data-close aria-label="Mbyll">${I.x}</button></div>
    <div class="rsk">${RESET_KINDS.map(([k,l])=>`<button type="button" data-rk="${k}" aria-pressed="${k===kind}">${l}</button>`).join('')}</div>
    <p class="mp">${resetDesc(kind,R)}</p>
    <div class="rsl">${rows.length?rows.map(([n,l])=>`<div><b>${fmtN(n)}</b><span>${l}</span></div>`).join(''):'<div class="empty">Nuk ka asgjë për të fshirë në këtë periudhë.</div>'}</div>
    ${rows.length?`<p class="rsw">${BOOT_LOCAL_HINT}</p>
    <label class="lbl" for="rs-conf">Shkruaj <b>FSHI</b> për të konfirmuar</label>
    <input class="ai" id="rs-conf" autocomplete="off" autocapitalize="characters" placeholder="FSHI">
    <div class="btns"><button class="btn out" data-close>Anulo</button><button class="btn danger" data-act="resetok">${I.trash}Fshi · ${lbl.toLowerCase()}</button></div>`:''}`);
}
const BOOT_LOCAL_HINT='Para fshirjes ruhet automatikisht një backup, që të mund të kthehet nëse duhet.';
async function doReset(){
  const c=document.getElementById('rs-conf'); if(!c||c.value.trim().toUpperCase()!=='FSHI'){ toast('Shkruaj FSHI për të konfirmuar'); if(c) c.focus(); return; }
  if(typeof backupBeforeReset==='function'){ const ok=await backupBeforeReset(); if(!ok){ toast('Backup dështoi · asgjë nuk u fshi'); return; } }
  const kind=S.rk, R=resetRange(kind), keep=x=>!(x.t>=R.a&&x.t<R.b);
  const goneExp=new Set(S.exp.filter(x=>!keep(x)).map(e=>e.id));
  S.sales=S.sales.filter(keep); S.house=S.house.filter(keep); S.exp=S.exp.filter(keep); S.ledger=S.ledger.filter(keep); S.stock=S.stock.filter(keep);
  S.closings=closings().filter(keep);
  Object.keys(S.orders).forEach(id=>{
    if(!isAcct(id)){ if(R.live) delete S.orders[id]; return; }
    if(R.all){ delete S.orders[id]; return; }
    const o=S.orders[id]; o.rounds=o.rounds.filter(keep); if(!o.rounds.length) delete S.orders[id]; });
  if(R.all) S.done={}; else Object.keys(S.done).forEach(k=>{ if(goneExp.has(S.done[k])) delete S.done[k]; });
  if(R.live){ S.counted=null; S.leftFloat=null; S.floatOverride=null; S.sel=null; S.table=null; }
  saveExp(); saveLedger(); saveRem(); saveStock(); saveClose();
  const lbl=RESET_KINDS.find(k=>k[0]===kind)[1];
  closeModal(); S.view='tables'; render(); scrollTo(0,0); toast(R.all?'Të gjitha të dhënat u fshinë':`U fshinë të dhënat · ${lbl.toLowerCase()}`);
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-reset],[data-rk],[data-act="resetok"]'); if(!b) return;
  if(b.dataset.reset){ if(!S.admin){ toast('Vetëm pronari'); return; } resetModal(b.dataset.reset); return; }
  if(b.dataset.rk){ resetModal(b.dataset.rk); return; }
  doReset();
});

