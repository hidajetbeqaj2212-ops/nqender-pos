/* ---- data from the local server (injected into the page as window.__BOOT) ---- */
const BOOT=window.__BOOT||{cfg:[],orders:[],sales:[],house:[],exp:[],ledger:[],rem:[],done:[],closings:[],local:true,remote:false,info:{}};
const DKEYS=new Set(['t','opened','from']);
function revive(v){
  if(Array.isArray(v)){ v.forEach((x,i)=>{ if(x&&typeof x==='object') revive(x); }); return v; }
  if(v&&typeof v==='object'){ for(const k in v){ const x=v[k]; if(DKEYS.has(k)&&typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)) v[k]=new Date(x); else if(x&&typeof x==='object') revive(x); } }
  return v;
}
const bootList=c=>(BOOT[c]||[]).map(d=>revive(d.data)).sort((a,b)=>(a.t||0)-(b.t||0));
const bootDoc=c=>{ const d=(BOOT[c]||[]).find(x=>x.id==='main'); return d?revive(d.data):null; };
const bootMap=c=>Object.fromEntries((BOOT[c]||[]).map(d=>[d.id,revive(d.data)]));
const LS={ get(k,f){ try{ const v=localStorage.getItem(k); return v==null?f:v; }catch(e){ return f; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
