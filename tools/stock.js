/* -------- stock (fridge drinks: counted per bottle/can) --------
   Movements in S.stock: {id, t, type:'in'|'count', by, items:[{id,q,exp?}], paid?, arka?, note?}
   'in'    = a delivery from the supplier (adds bottles; optional amount paid, maybe from the cash drawer)
   'count' = a stock count (sets the real number per item; the difference shows what went missing)
   Sales, "nga shtëpia" and saved rounds on open tables take bottles off automatically. */
const STOCK_CATS=['Pije','Lëngje','Birra'];
const isTracked=m=>m.track!==undefined?!!m.track:STOCK_CATS.includes(m.c);
const tracked=()=>MENU.filter(isTracked);
const minOf=m=>m.min!=null?m.min:6;
function stockLevels(){
  const out={}, last={};
  for(const mv of S.stock) if(mv.type==='count') for(const it of mv.items){ if(!last[it.id]||mv.t>last[it.id].t) last[it.id]={t:mv.t,q:it.q}; }
  for(const m of tracked()){ const b=last[m.id]; out[m.id]={q:b?b.q:0,since:b?b.t:null}; }
  for(const mv of S.stock) if(mv.type==='in') for(const it of mv.items){ const o=out[it.id]; if(o&&(!o.since||mv.t>o.since)) o.q+=it.q; }
  const vals=Object.values(out), minT=vals.length&&vals.every(o=>o.since)?Math.min(...vals.map(o=>+o.since)):0;
  const take=list=>{ for(let i=list.length-1;i>=0;i--){ const x=list[i]; if(+x.t<minT) break; for(const l of x.lines){ const o=out[l.id]; if(o&&(!o.since||x.t>o.since)) o.q-=l.q; } } };
  take(S.sales); take(S.house);
  for(const o of Object.values(S.orders)) for(const r of o.rounds) if(r.saved) for(const i of r.items){ const x=out[i.id]; if(x&&(!x.since||r.t>x.since)) x.q-=i.q; }
  return out;
}
const lowList=L=>tracked().filter(m=>L[m.id]&&L[m.id].q<=minOf(m));
function soldUnits(a,b){
  const c={}; const add=list=>list.forEach(x=>{ if(x.t>a&&x.t<=b) x.lines.forEach(l=>{ if(M[l.id]&&isTracked(M[l.id])) c[l.id]=(c[l.id]||0)+l.q; }); });
  add(S.sales); add(S.house); return c;
}
const mvTxt=mv=>mv.items.map(i=>`${i.q}× ${esc(M[i.id]?M[i.id].n:'—')}`).join(', ');
function stockView(){
  const L=stockLevels(), items=tracked(), low=lowList(L), mode=S.skMode||'list';
  if(mode==='count') return stockCountView(L);
  if(mode==='edit') return stockEditView(L);
  const f=S.skf||'all', list=f==='low'?low:items.filter(m=>!S.skc||m.c===S.skc);
  const wk=weekStart(now()), ins=S.stock.filter(m=>m.type==='in'&&m.t>=wk), units=sum(ins,m=>sum(m.items,i=>i.q));
  const today=soldUnits(sod(now()),now()), soldToday=sum(Object.values(today),q=>q);
  const value=sum(items,m=>Math.max(0,L[m.id].q)*(m.cost||0)), hasCost=items.some(m=>m.cost);
  const hist=S.stock.slice().sort((a,b)=>b.t-a.t).slice(0,12);
  const card=m=>{ const q=L[m.id].q, mn=minOf(m), st=q<=0?'out':q<=mn?'low':'ok';
    return `<button class="sk ${st}" data-skin="${m.id}"><span class="sk-pic">${m.a()}</span><span class="sk-n">${esc(m.n)}</span>
      <span class="sk-q"><b>${q}</b><small>copë</small></span>
      <span class="sk-s">${st==='out'?'Mbaroi':st==='low'?`Pak · min ${mn}`:`min ${mn}`}</span></button>`; };
  return `<div class="oh sk-h"><h1>Stoku</h1>
      <div class="filters"><button class="f" data-skf="all" aria-pressed="${f==='all'}">Të gjitha<em>${items.length}</em></button><button class="f facc" data-skf="low" aria-pressed="${f==='low'}">Për t'u porositur${low.length?`<em>${low.length}</em>`:''}</button></div>
      <div class="th-r"><button class="take" data-skact="edit">${I.gear}Cilësimet</button><button class="take" data-skact="count">${I.doc}Inventura</button><button class="btn pri sk-in" data-skact="in">${I.plus}Pranim malli</button></div></div>
    <div class="skl"><div>
      ${f==='all'?`<div class="filters sk-cats">${[['','Të gjitha'],...STOCK_CATS.map(c=>[c,c])].filter(([c])=>!c||items.some(m=>m.c===c)).map(([c,l])=>`<button class="f" data-skc="${c}" aria-pressed="${(S.skc||'')===c}">${l}</button>`).join('')}</div>`:''}
      ${list.length?`<div class="skg">${list.map(card).join('')}</div>`:`<div class="empty">${f==='low'?'Asgjë për t\'u porositur. Stoku është në rregull.':'Asnjë artikull i ndjekur. Shto te Cilësimet.'}</div>`}
      ${f==='low'&&low.length?`<div class="sk-order"><b>Lista për furnitorin</b><p>${low.map(m=>`${esc(m.n)} · kanë mbetur ${Math.max(0,L[m.id].q)}`).join('<br>')}</p></div>`:''}
    </div>
    <aside class="sk-side">
      <section class="box"><div class="sk-k"><div><span>Shitur sot</span><b>${soldToday}</b><small>pije në shishe/kanaçe</small></div><div><span>Pranuar këtë javë</span><b>${units}</b><small>${ins.length} herë</small></div>
        ${hasCost?`<div><span>Vlera e stokut</span><b>${fmt(value)}</b><small>me çmimin e blerjes</small></div>`:''}<div class="${low.length?'warn':''}"><span>Për t'u porositur</span><b>${low.length}</b><small>${low.length?'nën minimum':'gjithçka në rregull'}</small></div></div></section>
      <section class="box"><h3>Lëvizjet e fundit</h3>
        <div class="hist">${hist.map(mv=>`<div><span><b>${mv.type==='in'?'Pranim malli':'Inventura'}</b><small>${dayLabel(mv.t)} ${hm(mv.t)} · ${esc(mv.by||'')}</small><small class="sk-it">${mv.type==='in'?mvTxt(mv):countTxt(mv)}</small></span>
          ${mv.type==='in'?`<em class="${mv.paid?'plus':'ok'}">${mv.paid?fmt(mv.paid)+(mv.arka?' · arka':''):`+${sum(mv.items,i=>i.q)}`}</em>`:`<em class="${countLoss(mv)?'minus':'ok'}">${countLoss(mv)?`−${countLoss(mv)} copë`:'Në rregull'}</em>`}
          ${S.admin&&mv.type==='in'?`<button class="del" data-skdel="${mv.id}" aria-label="Fshi">${I.trash}</button>`:''}</div>`).join('')||'<div class="empty">Ende asnjë lëvizje. Fillo me një inventurë.</div>'}</div>
      </section>
    </aside></div>`;
}
const countLoss=mv=>sum(mv.items,i=>i.exp!=null&&i.exp>i.q?i.exp-i.q:0);
const countTxt=mv=>{ const d=mv.items.filter(i=>i.exp!=null&&i.exp!==i.q); return d.length?d.map(i=>`${esc(M[i.id]?M[i.id].n:'—')} ${i.q-i.exp>0?'+':''}${i.q-i.exp}`).join(', '):`${mv.items.length} artikuj, të gjithë përputhen`; };
function stockCountView(L){
  const items=tracked(), first=!S.stock.some(m=>m.type==='count');
  return `<div class="oh"><button class="back" data-skact="list">${I.back}Stoku</button><h1>Inventura</h1><span class="ahint ml-a">${first?'Numëro çka ka në frigorifer dhe në depo. Kjo bëhet fillimi i stokut.':'Numëro çdo artikull. Lëre bosh atë që nuk e numërove.'}</span></div>
    <section class="box"><div class="skc-h"><span>Artikulli</span><span>Sipas sistemit</span><span>Numëruar</span><span>Diferenca</span></div>
      ${items.map(m=>`<div class="skc-r"><span class="skc-n"><span class="tb">${m.a()}</span><b>${esc(m.n)}</b></span><span class="skc-e">${L[m.id].q}</span>
        <input class="ai" data-skcount="${m.id}" data-exp="${L[m.id].q}" inputmode="numeric" placeholder="—" value="${S.skCnt&&S.skCnt[m.id]!=null?S.skCnt[m.id]:''}" aria-label="Numëruar ${esc(m.n)}">
        <span class="skc-d" id="skd-${m.id}">${cntDiff(S.skCnt&&S.skCnt[m.id],L[m.id].q)}</span></div>`).join('')}
      <div class="skc-f"><span id="skc-sum">${cntSum(L)}</span><div class="btns"><button class="btn out" data-skact="list">Anulo</button><button class="btn pri" data-skact="countok">${I.ok}Ruaj inventurën</button></div></div>
    </section>`;
}
function cntDiff(v,exp){ if(v==null||v==='') return ''; const d=Number(v)-exp; return d===0?'<b class="ok">Në rregull</b>':d<0?`<b class="minus">Mungojnë ${-d}</b>`:`<b class="plus">+${d} tepër</b>`; }
function cntSum(L){
  const c=S.skCnt||{}; let miss=0, val=0, n=0;
  for(const [id,v] of Object.entries(c)){ if(v===''||v==null||!M[id]) continue; n++; const d=L[id].q-Number(v); if(d>0){ miss+=d; val+=d*(M[id].cost||M[id].p); } }
  return n?(miss?`Numëruar ${n} artikuj · mungojnë <b>${miss} copë</b> (~${fmt(val)})`:`Numëruar ${n} artikuj · asgjë nuk mungon`):'Shkruaj sa copë numërove.';
}
function stockEditView(L){
  const all=MENU.filter(m=>m.c!=='Kafe'&&m.c!=='Çaj');
  return `<div class="oh"><button class="back" data-skact="list">${I.back}Stoku</button><h1>Cilësimet e stokut</h1><span class="ahint ml-a">Ndryshimet ruhen automatikisht</span></div>
    <section class="box"><div class="ske-h"><span>Artikulli</span><span>Ndiqet</span><span>Minimumi</span><span>Çmimi i blerjes</span><span>Fitimi</span></div>
      ${all.map(m=>`<div class="ske-r ${isTracked(m)?'':'off'}"><span class="skc-n"><span class="tb">${m.a()}</span><b>${esc(m.n)}<small>shitet ${fmt(m.p)}</small></b></span>
        <label class="sw"><input type="checkbox" data-sktrack="${m.id}" ${isTracked(m)?'checked':''}><i></i></label>
        <input class="ai" data-skmin="${m.id}" inputmode="numeric" value="${minOf(m)}" aria-label="Minimumi ${esc(m.n)}">
        <label class="ap"><input class="ai" data-skcost="${m.id}" inputmode="decimal" placeholder="0,00" value="${m.cost?m.cost.toFixed(2).replace('.',','):''}" aria-label="Çmimi i blerjes ${esc(m.n)}"><span>€</span></label>
        <span class="ske-m">${m.cost?`<b>${fmt(m.p-m.cost)}</b><small>${Math.round((m.p-m.cost)/m.p*100)}%</small>`:'—'}</span></div>`).join('')}
    </section>`;
}
function inModal(pre){
  if(pre) S.skIn={...(S.skIn||{}),[pre]:(S.skIn&&S.skIn[pre])||0};
  const L=stockLevels(), sel=S.skIn||{}, cat=S.skInCat||STOCK_CATS.find(c=>tracked().some(m=>m.c===c))||'Pije';
  const items=tracked().filter(m=>m.c===cat), tot=sum(Object.values(sel),q=>q||0);
  modal(`<div class="sp-h"><h3>Pranim malli</h3><button class="x" data-close aria-label="Mbyll">${I.x}</button></div><p class="mp">Çka solli furnitori? Shto sasinë për çdo artikull.</p>
    <div class="filters">${STOCK_CATS.filter(c=>tracked().some(m=>m.c===c)).map(c=>`<button class="f" data-skincat="${c}" aria-pressed="${cat===c}">${c}${sum(tracked().filter(m=>m.c===c),m=>sel[m.id]||0)?`<em>${sum(tracked().filter(m=>m.c===c),m=>sel[m.id]||0)}</em>`:''}</button>`).join('')}</div>
    <div class="ski">${items.map(m=>{ const q=sel[m.id]||0; return `<div class="ski-r ${q?'on':''}"><span class="tb">${m.a()}</span><span class="ski-n"><b>${esc(m.n)}</b><small>në stok ${L[m.id].q}</small></span>
      <span class="step"><button data-skq="${m.id}" data-d="-1" aria-label="Një më pak">${I.minus}</button><b>${q}</b><button data-skq="${m.id}" data-d="1" aria-label="Një më shumë">${I.plus}</button></span>
      <button class="ski-24" data-skq="${m.id}" data-d="24">+24</button></div>`; }).join('')}</div>
    <div class="two-i q2"><label class="ap"><input class="ai" id="ski-paid" inputmode="decimal" placeholder="Paguar (opsionale)" value="${S.skPaid||''}"><span>€</span></label>
      <label class="skchk"><input type="checkbox" id="ski-arka" ${S.skArka!==false?'checked':''}><span>Paguar nga arka</span></label></div>
    <div class="btns"><button class="btn out" data-close>Anulo</button><button class="btn pri" data-skact="inok" ${tot?'':'disabled'}>${I.ok}Ruaj · ${tot} copë</button></div>`,'wide');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-skact],[data-skf],[data-skc],[data-skin],[data-skincat],[data-skq],[data-skdel]'); if(!b) return;
  const d=b.dataset, own=()=>{ if(S.admin) return true; toast('Vetëm pronari · hap Zyrën me PIN'); return false; };
  if(d.skf){ S.skf=d.skf; render(); return; }
  if(d.skc!==undefined){ S.skc=d.skc; render(); return; }
  if(d.skin){ S.skIn={}; S.skInCat=M[d.skin].c; S.skPaid=''; inModal(d.skin); return; }
  if(d.skincat){ keepIn(); S.skInCat=d.skincat; inModal(); return; }
  if(d.skq){ keepIn(); const s=S.skIn||(S.skIn={}); s[d.skq]=Math.max(0,(s[d.skq]||0)+Number(d.d)); inModal(); return; }
  if(d.skdel){ if(!own()) return; S.stock=S.stock.filter(m=>m.id!==d.skdel); saveStock(); render(); toast('Pranimi u fshi'); return; }
  const a=d.skact;
  if(a==='list'){ S.skMode='list'; S.skCnt=null; render(); scrollTo(0,0); return; }
  if(a==='in'){ S.skIn={}; S.skPaid=''; S.skArka=true; inModal(); return; }
  if(a==='count'){ if(!own()) return; S.skMode='count'; S.skCnt={}; render(); scrollTo(0,0); return; }
  if(a==='edit'){ if(!own()) return; S.skMode='edit'; render(); scrollTo(0,0); return; }
  if(a==='inok'){
    keepIn(); const items=Object.entries(S.skIn||{}).filter(([,q])=>q>0).map(([id,q])=>({id,q})); if(!items.length) return;
    const paid=parseFloat(String(S.skPaid||'').replace(',','.'))||0;
    S.stock.push({id:'k'+Date.now(),t:now(),type:'in',by:S.staff,items,paid:paid||null,arka:paid?S.skArka!==false:false});
    saveStock(); S.skIn=null; closeModal(); render(); toast(`U pranuan ${sum(items,i=>i.q)} copë${paid?` · ${fmt(paid)}`:''}`); return;
  }
  if(a==='countok'){
    const L=stockLevels(), c=S.skCnt||{}, items=Object.entries(c).filter(([id,v])=>v!==''&&v!=null&&M[id]).map(([id,v])=>({id,q:Math.max(0,Math.round(Number(v))),exp:L[id].q}));
    if(!items.length){ toast('Shkruaj të paktën një numër'); return; }
    const mv={id:'k'+Date.now(),t:now(),type:'count',by:S.staff,items}; S.stock.push(mv); saveStock();
    S.skMode='list'; S.skCnt=null; render(); scrollTo(0,0); const l=countLoss(mv); toast(l?`Inventura u ruajt · mungojnë ${l} copë`:'Inventura u ruajt · gjithçka përputhet'); return;
  }
});
function keepIn(){ const p=document.getElementById('ski-paid'), k=document.getElementById('ski-arka'); if(p) S.skPaid=p.value; if(k) S.skArka=k.checked; }
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.skcount){ (S.skCnt||(S.skCnt={}))[t.dataset.skcount]=t.value.replace(/\D/g,''); const el=document.getElementById('skd-'+t.dataset.skcount); if(el) el.innerHTML=cntDiff(S.skCnt[t.dataset.skcount],Number(t.dataset.exp)); const s=document.getElementById('skc-sum'); if(s) s.innerHTML=cntSum(stockLevels()); }
});
document.addEventListener('change',e=>{
  const t=e.target, d=t.dataset;
  if(d.sktrack){ M[d.sktrack].track=t.checked; saveCfg(); render(); return; }
  if(d.skmin){ const v=Math.max(0,parseInt(t.value,10)||0); M[d.skmin].min=v; saveCfg(); render(); return; }
  if(d.skcost){ const v=parseFloat(t.value.replace(',','.')); M[d.skcost].cost=v>0?Math.round(v*100)/100:null; saveCfg(); render(); return; }
});
