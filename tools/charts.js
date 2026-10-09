/* -------- report charts: donut (part of whole), trend lines, busy-hours heatmap --------
   Categorical colors follow the validated reference order (slot 1 blue, 2 orange, 3 aqua, 4 yellow, 5 magenta),
   each category keeps its color in every period. Lighter slots get visible labels (legend list with values). */
const VZ={blue:'#2a78d6',orange:'#eb6834',aqua:'#1baf7a',yellow:'#eda100',magenta:'#e87ba4',gray:'#b9bfc8'};
const CAT_COLORS={'Kafe':VZ.blue,'Pije':VZ.orange,'Lëngje':VZ.aqua,'Birra':VZ.yellow,'Të tjera':VZ.magenta};
function donut(segs,center,sub){
  const tot=sum(segs,s=>s.v); if(!tot) return '<div class="empty">Ende asnjë shitje në këtë periudhë.</div>';
  const R=80, r=52, cx=100, cy=100; let a0=-Math.PI/2;
  const arc=(s)=>{
    const f=s.v/tot, a1=a0+f*Math.PI*2, big=a1-a0>Math.PI?1:0;
    const p=(ang,rad)=>`${(cx+rad*Math.cos(ang)).toFixed(2)} ${(cy+rad*Math.sin(ang)).toFixed(2)}`;
    const d=f>=0.9999?`M ${p(a0,R)} A ${R} ${R} 0 1 1 ${p(a0+Math.PI*1.999,R)} L ${p(a0+Math.PI*1.999,r)} A ${r} ${r} 0 1 0 ${p(a0,r)} Z`
      :`M ${p(a0,R)} A ${R} ${R} 0 ${big} 1 ${p(a1,R)} L ${p(a1,r)} A ${r} ${r} 0 ${big} 0 ${p(a0,r)} Z`;
    const out=`<path d="${d}" fill="${s.c}" stroke="#fff" stroke-width="2" stroke-linejoin="round" data-tip="${esc(s.l)}\n${fmt(s.v)} · ${Math.round(f*100)}%"/>`;
    a0=a1; return out;
  };
  return `<div class="dn"><div class="dn-c"><svg viewBox="0 0 200 200" role="img" aria-label="${esc(segs.map(s=>`${s.l} ${Math.round(s.v/tot*100)}%`).join(', '))}">${segs.filter(s=>s.v>0).map(arc).join('')}</svg>
    <div class="dn-m"><b>${center}</b><small>${sub}</small></div></div>
    <div class="dn-l">${segs.map(s=>`<div><i style="background:${s.c}"></i><span>${esc(s.l)}</span><b>${fmt(s.v)}</b><em>${Math.round(s.v/tot*100)}%</em></div>`).join('')}</div></div>`;
}
function catSegs(list){
  const by={}; list.forEach(x=>x.lines.forEach(l=>{ const m=M[l.id]; const c=m&&CAT_COLORS[m.c]?m.c:'Të tjera'; by[c]=(by[c]||0)+priceOf(l.id)*l.q; }));
  return Object.keys(CAT_COLORS).map(c=>({l:c,v:by[c]||0,c:CAT_COLORS[c]})).filter(s=>s.v>0).sort((a,b)=>b.v-a.v);
}
function lineChart({labels,series,tips,every=1,h=220,cur=-1}){
  const n=labels.length, max=niceMax(Math.max(1,...series.flatMap(s=>s.values))), W=1000;
  const x=i=>n<=1?W/2:i/(n-1)*W, y=v=>h-(v/max)*h;
  const upto=cur>=0?cur+1:n;
  const paths=series.map(s=>{ const pts=s.values.slice(0,upto).map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `${s.area?`<polygon points="0,${h} ${pts} ${x(upto-1).toFixed(1)},${h}" fill="${s.color}" opacity=".10"/>`:''}<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`; }).join('');
  const cols=labels.map((_,i)=>`<div class="lc" style="left:${n<=1?0:(i-0.5)/(n-1)*100}%;width:${100/Math.max(1,n-1)}%" data-tip="${esc(tips[i])}"><i style="left:50%"></i>${i<upto?series.map(s=>`<b style="bottom:${s.values[i]/max*100}%;background:${s.color}"></b>`).join(''):''}</div>`).join('');
  return `<div class="chart" style="--h:${h}px"><div class="cy">${[max,max/2,0].map((t,k)=>`<span style="top:${k*50}%">${Math.round(t)} €</span>`).join('')}</div>
    <div class="cp"><div class="cg"><i></i><i></i><i></i></div><div class="lw" style="height:${h}px"><svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${cols}</div>
    <div class="cx">${labels.map((l,i)=>`<span>${i%every===0?l:''}</span>`).join('')}</div></div></div>`;
}
function heatmap(list){
  const H=[]; for(let h=7;h<=22;h++) H.push(h);
  const g=Array.from({length:7},()=>H.map(()=>({n:0,v:0}))), weeks=new Set();
  list.forEach(x=>{ const hi=x.t.getHours()-7; if(hi<0||hi>=H.length) return; const c=g[dow(x.t)][hi]; c.n++; c.v+=x.total; weeks.add(+weekStart(x.t)); });
  const max=Math.max(1,...g.flat().map(c=>c.n)), wk=Math.max(1,weeks.size);
  let best={n:0}; g.forEach((row,d)=>row.forEach((c,hi)=>{ if(c.n>best.n) best={n:c.n,d,h:H[hi]}; }));
  const cell=(c,d,hi)=>{ const f=c.n/max; return `<i style="background:${c.n?`color-mix(in oklab, ${VZ.blue} ${Math.round(12+f*88)}%, #eef2f7)`:'#f3f4f6'}" data-tip="${DAY_LONG[d].replace(/^e /,'E ')} · ${String(H[hi]).padStart(2,'0')}:00\n${(c.n/wk).toFixed(c.n/wk<10?1:0).replace('.',',')} fatura në javë mesatarisht\n${fmt(c.v/wk)} xhiro"></i>`; };
  return `<div class="hm"><div class="hm-g" style="--n:${H.length}"><span></span>${H.map((h,i)=>`<span class="hm-x">${i%2===0?String(h).padStart(2,'0'):''}</span>`).join('')}
    ${g.map((row,d)=>`<span class="hm-y">${DAY_SHORT[d]}</span>${row.map((c,hi)=>cell(c,d,hi)).join('')}`).join('')}</div>
    <div class="hm-f"><span>${best.n?`Më e ngarkuara: <b>${DAY_LONG[best.d].replace(/^e /,'e ')} rreth orës ${String(best.h).padStart(2,'0')}:00</b>`:'Ende pa të dhëna'}</span><span class="hm-k">Pak<i></i>Shumë</span></div></div>`;
}
function reportCharts(k,P,cur){
  const t=now();
  // 1) where the money comes from
  const segs=catSegs(cur), tot=sum(segs,s=>s.v);
  const pie=`<div class="box"><div class="bh"><h3>Ku vjen xhiroja</h3><span class="ahint">sipas kategorisë</span></div>${donut(segs,fmt(tot).replace(',00 €',' €'),'xhiro')}</div>`;
  // 2) sales vs costs over time (same unit, one axis)
  const TK=k==='day'?'week':k, TP=k==='day'?rperiod('week'):P, TB=buckets(TK,TP);
  const rng=x=>inRange(x.t,TP.a,TP.b);
  const rev=bucketSum(S.sales.filter(rng),TB,x=>x.total);
  const cost=bucketSum([...S.exp.filter(rng),...S.ledger.filter(rng)],TB,x=>x.amount);
  const curI=TB.cur!=null?TB.cur:-1;
  const line=`<div class="box"><div class="bh"><h3>Xhiro dhe shpenzime</h3>${legend([['Xhiro',VZ.blue],['Shpenzime dhe paga',VZ.orange]])}</div>
    ${lineChart({labels:TB.labels,every:TB.every,cur:curI,series:[{values:rev,color:VZ.blue,area:true},{values:cost,color:VZ.orange}],tips:TB.labels.map((_,i)=>`${TB.tip(i)}\nXhiro: ${curI>=0&&i>curI?'—':fmt(rev[i])}\nShpenzime: ${curI>=0&&i>curI?'—':fmt(cost[i])}\nMbetja: ${curI>=0&&i>curI?'—':fmt(rev[i]-cost[i])}`)})}
    <div class="lt"><span>Gjithsej xhiro <b>${fmt(sum(rev,v=>v))}</b></span><span>Shpenzime dhe paga <b>${fmt(sum(cost,v=>v))}</b></span><span>Mbetja <b class="${sum(rev,v=>v)-sum(cost,v=>v)>=0?'pos':'neg'}">${fmt(sum(rev,v=>v)-sum(cost,v=>v))}</b></span></div></div>`;
  // 3) busiest hours (use at least the last 4 weeks so "today" still has a pattern)
  const HA=k==='day'||k==='week'?addDays(sod(t),-28):P.a, HB=k==='day'||k==='week'?addDays(sod(t),1):P.b;
  const heat=`<div class="box"><div class="bh"><h3>Kur ka më shumë punë</h3><span class="ahint">${k==='day'||k==='week'?'4 javët e fundit':P.label} · fatura sipas ditës dhe orës</span></div>${heatmap(S.sales.filter(x=>inRange(x.t,HA,HB)))}</div>`;
  return `<div class="cols vz">${pie}${line}</div>${heat}`;
}
