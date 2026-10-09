/* -------- reset data: today only, or everything (settings stay) -------- */
function resetScope(kind){
  const from=kind==='day'?drawer().from:new Date(0), aft=x=>x.t>from;
  const openT=Object.keys(S.orders).filter(id=>!isAcct(id)), openA=CFG.accounts.filter(a=>S.orders[a.id]);
  return {from,
    sales:S.sales.filter(aft).length, house:S.house.filter(aft).length, exp:S.exp.filter(aft).length, ledger:S.ledger.filter(aft).length,
    stock:S.stock.filter(aft).length, closings:kind==='day'?0:closings().length, tables:openT.length,
    accts:kind==='day'?sum(openA,a=>S.orders[a.id].rounds.filter(r=>r.t>from).length):openA.length};
}
function resetModal(kind){
  S.rk=kind; const R=resetScope(kind), D=kind==='day';
  const rows=[[R.sales,'fatura'],[R.tables,'tavolina të hapura'],[R.accts,D?'porosi te klientët e rregullt':'llogari të klientëve të rregullt'],[R.house,'nga shtëpia'],[R.exp,'shpenzime'],[R.ledger,'avanse dhe paga'],[R.stock,'lëvizje stoku'],[R.closings,'mbyllje ditësh']].filter(r=>r[0]);
  modal(`<div class="sp-h"><h3>${D?'Fshi të dhënat e ditës':'Fshi të gjitha të dhënat'}</h3><button class="x" data-close aria-label="Mbyll">${I.x}</button></div>
    <p class="mp">${D?`Fshihet gjithçka që u regjistrua që nga ${sod(R.from).getTime()===sod(now()).getTime()?'sot në '+hm(R.from):dayLabel(R.from)+' '+hm(R.from)} (hapja e ditës), si të mos kishte ndodhur.`:'Aplikacioni kthehet si i ri. Menyja, çmimet, tavolinat, stafi, pagat, klientët dhe kujtesat mbeten.'}</p>
    <div class="rsl">${rows.length?rows.map(([n,l])=>`<div><b>${fmtN(n)}</b><span>${l}</span></div>`).join(''):'<div class="empty">Nuk ka asgjë për të fshirë.</div>'}</div>
    ${rows.length?`<p class="rsw">${BOOT_LOCAL_HINT}</p>
    <label class="lbl" for="rs-conf">Shkruaj <b>FSHI</b> për të konfirmuar</label>
    <input class="ai" id="rs-conf" autocomplete="off" autocapitalize="characters" placeholder="FSHI">
    <div class="btns"><button class="btn out" data-close>Anulo</button><button class="btn danger" data-act="resetok">${I.trash}${D?'Fshi ditën':'Fshi të gjitha'}</button></div>`:''}`);
}
const BOOT_LOCAL_HINT='Para fshirjes ruhet automatikisht një backup, që të mund të kthehet nëse duhet.';
async function doReset(){
  const c=document.getElementById('rs-conf'); if(!c||c.value.trim().toUpperCase()!=='FSHI'){ toast('Shkruaj FSHI për të konfirmuar'); if(c) c.focus(); return; }
  if(typeof backupBeforeReset==='function'){ const ok=await backupBeforeReset(); if(!ok){ toast('Backup dështoi · asgjë nuk u fshi'); return; } }
  const kind=S.rk, from=kind==='day'?drawer().from:new Date(0), keep=x=>!(x.t>from);
  const goneExp=new Set(S.exp.filter(x=>!keep(x)).map(e=>e.id));
  S.sales=S.sales.filter(keep); S.house=S.house.filter(keep); S.exp=S.exp.filter(keep); S.ledger=S.ledger.filter(keep); S.stock=S.stock.filter(keep);
  Object.keys(S.orders).forEach(id=>{ if(!isAcct(id)) { delete S.orders[id]; return; } if(kind!=='day'){ delete S.orders[id]; return; } const o=S.orders[id]; o.rounds=o.rounds.filter(r=>!(r.t>from)); if(!o.rounds.length) delete S.orders[id]; });
  if(kind==='day'){ Object.keys(S.done).forEach(k=>{ if(goneExp.has(S.done[k])) delete S.done[k]; }); }
  else { S.closings=[]; S.done={}; }
  S.counted=null; S.leftFloat=null; S.floatOverride=null; S.sel=null; S.table=null;
  saveExp(); saveLedger(); saveRem(); saveStock(); saveClose();
  closeModal(); S.view='tables'; render(); scrollTo(0,0); toast(kind==='day'?'Të dhënat e ditës u fshinë':'Të gjitha të dhënat u fshinë');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-reset],[data-act="resetok"]'); if(!b) return;
  if(b.dataset.reset){ if(!S.admin){ toast('Vetëm pronari'); return; } resetModal(b.dataset.reset); return; }
  doReset();
});
