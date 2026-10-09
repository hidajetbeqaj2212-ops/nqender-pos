/* -------- export data (Excel / CSV) -------- */
const XLSX_SRC='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const EXP_PERIODS=[['day','Sot'],['week','Kjo javë'],['month','Ky muaj'],['last','Muaji i kaluar'],['year','Këtë vit'],['all','Të gjitha']];
const EXP_SETS=[['bills','Faturat'],['lines','Shitjet sipas artikullit'],['house','Nga shtëpia'],['exp','Shpenzimet'],['wages','Pagat dhe avanset'],['closings','Mbylljet e ditës'],['stock','Gjendja e stokut'],['moves','Lëvizjet e stokut']];
function expRange(k){
  const t=now(), y=t.getFullYear(), m=t.getMonth();
  if(k==='day') return [sod(t),addDays(sod(t),1),dayLabel(t)];
  if(k==='week') return [weekStart(t),addDays(sod(t),1),'kjo javë'];
  if(k==='month') return [new Date(y,m,1),new Date(y,m+1,1),mName(new Date(y,m,1))];
  if(k==='last') return [new Date(y,m-1,1),new Date(y,m,1),mName(new Date(y,m-1,1))];
  if(k==='year') return [new Date(y,0,1),new Date(y+1,0,1),String(y)];
  return [new Date(2000,0,1),new Date(2100,0,1),'të gjitha'];
}
const r2=n=>Math.round((n||0)*100)/100;
const dStr=d=>`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
function expTables(k){
  const [a,b]=expRange(k), inR=x=>x.t>=a&&x.t<b, nm=id=>M[id]?M[id].n:id, tn=id=>id?tname(id):'';
  const T={};
  T.bills={name:'Faturat',head:['Data','Ora','Tavolina','Artikujt','Totali (€)','Pagesa'],rows:S.sales.filter(inR).map(x=>[dStr(x.t),hm(x.t),tn(x.table),x.lines.map(l=>`${l.q}× ${nm(l.id)}`).join(', '),r2(x.total),x.method])};
  T.lines={name:'Shitjet sipas artikullit',head:['Data','Ora','Tavolina','Artikulli','Kategoria','Sasia','Çmimi (€)','Vlera (€)','Pagesa'],rows:S.sales.filter(inR).flatMap(x=>x.lines.map(l=>[dStr(x.t),hm(x.t),tn(x.table),nm(l.id),M[l.id]?M[l.id].c:'',l.q,r2(priceOf(l.id)),r2(priceOf(l.id)*l.q),x.method]))};
  T.house={name:'Nga shtëpia',head:['Data','Ora','Tavolina','Artikujt','Vlera (€)','Arsyeja','Kush'],rows:S.house.filter(inR).map(x=>[dStr(x.t),hm(x.t),x.table==='house'?'':tn(x.table),x.lines.map(l=>`${l.q}× ${nm(l.id)}`).join(', '),r2(x.total),x.reason||'',x.by||''])};
  T.exp={name:'Shpenzimet',head:['Data','Ora','Kategoria','Përshkrimi','Shuma (€)','Paguar nga','Kush'],rows:S.exp.filter(inR).sort((x,y)=>x.t-y.t).map(e=>[dStr(e.t),hm(e.t),e.cat,e.note||'',r2(e.amount),e.arka?'Arka':'Pronari',e.by||''])};
  T.wages={name:'Pagat dhe avanset',head:['Data','Punëtori','Lloji','Për muajin','Shuma (€)','Shënim'],rows:S.ledger.filter(inR).sort((x,y)=>x.t-y.t).map(e=>[dStr(e.t),e.who,e.type==='paga'?'Paga':'Avans',e.month||'',r2(e.amount),e.note||''])};
  T.closings={name:'Mbylljet e ditës',head:['Data','Ora','Fondi (€)','Kesh (€)','Kartelë (€)','Blerje nga arka (€)','Avanse (€)','Duhet (€)','Numëruar (€)','Diferenca (€)','Lënë për nesër (€)','Merr pronari (€)','Kush'],rows:closings().filter(inR).map(c=>[dStr(c.t),hm(c.t),r2(c.float),r2(c.cash),r2(c.card),r2(c.out),r2(c.adv),r2(c.expected),r2(c.counted),r2(c.diff),r2(c.left),r2(c.taken),c.by||''])};
  const L=stockLevels();
  T.stock={name:'Gjendja e stokut',head:['Artikulli','Kategoria','Në stok','Minimumi','Çmimi i blerjes (€)','Çmimi i shitjes (€)','Vlera e stokut (€)'],rows:tracked().map(m=>[m.n,m.c,L[m.id].q,minOf(m),m.cost?r2(m.cost):'',r2(m.p),m.cost?r2(Math.max(0,L[m.id].q)*m.cost):''])};
  T.moves={name:'Lëvizjet e stokut',head:['Data','Ora','Lloji','Artikulli','Sasia','Pritej','Paguar (€)','Kush'],rows:S.stock.filter(inR).sort((x,y)=>x.t-y.t).flatMap(mv=>mv.items.map((i,j)=>[dStr(mv.t),hm(mv.t),mv.type==='in'?'Pranim':'Inventurë',nm(i.id),i.q,mv.type==='count'&&i.exp!=null?i.exp:'',j===0&&mv.paid?r2(mv.paid):'',mv.by||'']))};
  return T;
}
function csvOf(t){
  const cell=v=>{ const s=String(v==null?'':v); return /[",\n;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
  return '﻿'+[t.head,...t.rows].map(r=>r.map(cell).join(',')).join('\r\n');
}
function loadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=XLSX_SRC; s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('xlsx')); document.head.appendChild(s); });
}
async function saveFile(filename,data){
  const dl=window.claude&&window.claude.use?await window.claude.use('downloads').catch(()=>null):null;
  if(dl){ try{ await dl.save({filename,data}); return true; }catch(e){ if(e&&e.code==='declined') return false; } }
  const type=filename.endsWith('.csv')?'text/csv;charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type})); a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000); return true;
}
function exportModal(){
  const P=S.xp||'month', F=S.xf||'xlsx', sel=S.xs||(S.xs=EXP_SETS.map(([k])=>k).filter(k=>k!=='lines'));
  const T=expTables(P);
  modal(`<div class="sp-h"><h3>Eksporto të dhënat</h3><button class="x" data-close aria-label="Mbyll">${I.x}</button></div>
    <p class="mp">Shkarko të dhënat për t'i hapur në Excel ose për t'ia dhënë kontabilistit.</p>
    <div class="lbl">Periudha</div>
    <div class="xc">${EXP_PERIODS.map(([k,l])=>`<button type="button" data-xp="${k}" aria-pressed="${P===k}">${l}</button>`).join('')}</div>
    <div class="lbl">Çka të përfshihet</div>
    <div class="xsets">${EXP_SETS.map(([k,l])=>`<label class="xset"><input type="checkbox" data-xs="${k}" ${sel.includes(k)?'checked':''}><span><b>${l}</b><small>${T[k].rows.length} rreshta</small></span></label>`).join('')}</div>
    <div class="lbl">Formati</div>
    <div class="psrc"><button type="button" data-xf="xlsx" aria-pressed="${F==='xlsx'}">Excel (.xlsx)</button><button type="button" data-xf="csv" aria-pressed="${F==='csv'}">CSV</button></div>
    <p class="qhint">${F==='xlsx'?'Një skedar, me një fletë për secilën pjesë.':'Një skedar CSV për secilën pjesë që zgjodhe.'}</p>
    <div class="btns"><button class="btn out" data-close>Anulo</button><button class="btn pri" data-act="doexport" ${sel.length?'':'disabled'}>${I.dl}Shkarko</button></div>`,'wide');
}
async function doExport(){
  const P=S.xp||'month', F=S.xf||'xlsx', sel=S.xs||[], T=expTables(P), tag=expRange(P)[2].replace(/\s+/g,'-').toLowerCase();
  if(!sel.length) return;
  if(F==='csv'){ for(const k of sel){ const ok=await saveFile(`nQender-${k}-${tag}.csv`,csvOf(T[k])); if(!ok) return; } toast(sel.length>1?`${sel.length} skedarë CSV u shkarkuan`:'CSV u shkarkua'); closeModal(); return; }
  let X; try{ X=await loadXlsx(); }catch(e){ toast('Excel nuk u ngarkua. Provo CSV.'); return; }
  const wb=X.utils.book_new();
  for(const k of sel){ const t=T[k], ws=X.utils.aoa_to_sheet([t.head,...t.rows]); ws['!cols']=t.head.map((h,i)=>({wch:Math.min(48,Math.max(h.length+2,...t.rows.slice(0,200).map(r=>String(r[i]==null?'':r[i]).length+1)))})); X.utils.book_append_sheet(wb,ws,t.name.slice(0,31)); }
  const out=X.write(wb,{bookType:'xlsx',type:'array'});
  if(await saveFile(`nQender-${tag}.xlsx`,out)){ toast('Excel u shkarkua'); closeModal(); }
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-xp],[data-xf],[data-act="export"],[data-act="doexport"]'); if(!b) return;
  if(b.dataset.act==='export'){ exportModal(); return; }
  if(b.dataset.act==='doexport'){ doExport(); return; }
  if(b.dataset.xp){ S.xp=b.dataset.xp; exportModal(); return; }
  if(b.dataset.xf){ S.xf=b.dataset.xf; exportModal(); return; }
});
document.addEventListener('change',e=>{ const k=e.target.dataset&&e.target.dataset.xs; if(!k) return; const s=new Set(S.xs||[]); e.target.checked?s.add(k):s.delete(k); S.xs=EXP_SETS.map(([x])=>x).filter(x=>s.has(x)); exportModal(); });
