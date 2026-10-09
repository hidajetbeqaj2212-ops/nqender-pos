#!/usr/bin/env python3
"""Turns the approved prototype (prototype/pos.html) into the production UI (app/index.html):
no demo data, data comes from the local server, changes sync back, silent printing, Sistemi tab."""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'prototype' / 'pos.html').read_text()
boot_js = (ROOT / 'tools' / 'boot.js').read_text()
sync_js = (ROOT / 'tools' / 'sync.js').read_text()
s = src

def rep(old, new, count=1):
    global s
    if old not in s:
        sys.exit(f'anchor not found: {old[:80]!r}')
    s = s.replace(old, new, count)

def rep_re(pattern, new, flags=re.S):
    global s
    s2, n = re.subn(pattern, lambda m: new, s, count=1, flags=flags)
    if n != 1:
        sys.exit(f'pattern not found: {pattern[:80]!r}')
    s = s2

# ---- head: real document, local fonts, installable on phones ----
FONTS = ''.join(
    f"@font-face{{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:{w};font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-{w}-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}}"
    f"@font-face{{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:{w};font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-ext-{w}-normal.woff2) format('woff2');unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}}"
    for w in (500, 600, 700, 800))
rep_re(r'<title>.*?</title>\s*<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>\s*<link rel="stylesheet"[^>]*>',
       '<!doctype html>\n<html lang="sq">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<title>n\'Qender POS</title>\n<meta name="theme-color" content="#2563eb">\n'
       '<link rel="manifest" href="/manifest.webmanifest">\n<link rel="icon" href="/icons/icon-192.png">\n'
       '<link rel="apple-touch-icon" href="/icons/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
       f'<style>{FONTS}</style>')
# extra CSS for the new parts
EXTRA_CSS = """
/* production additions */
#netbar{position:fixed; z-index:60; left:50%; top:10px; transform:translateX(-50%); background:var(--red); color:#fff; font-weight:700; padding:10px 16px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.18); max-width:calc(100% - 24px); text-align:center}
.sysg{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; align-items:start}
.sysg .box{display:flex; flex-direction:column; gap:12px}
.sy-p{margin:0; color:var(--mute); font-weight:600; line-height:1.45}
.sy-r{display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid var(--line); font-weight:600}
.sy-r b{font-weight:800; text-align:right} .sy-r b.ok{color:var(--green)} .sy-r b.warn{color:#b4500d}
.sy-addr{padding:14px 16px; border-radius:12px; background:var(--blue-soft); color:var(--blue-2); font-weight:800; font-size:18px; word-break:break-all}
.sy-addr small{display:block; font-size:14px; font-weight:600; color:var(--ink-2); margin-top:4px}
.pinf{display:grid; grid-template-columns:1fr 1fr auto; gap:10px}
.pinf .ai{height:52px}
.pinf .btn{height:52px}
.link-btn{align-self:flex-start; color:var(--mute); font-weight:700; text-decoration:underline; padding:4px 0}
#sys-printer{height:52px; font-family:inherit; font-weight:700; font-size:16px}
@media (max-width:1366px){ .onav{flex-wrap:nowrap} .onav-t{flex:1; min-width:0; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none} .onav-t::-webkit-scrollbar{display:none} .onav .btn{margin-left:0; width:52px; padding:0; flex:none} .onav .btn .bt{display:none} }
@media (max-width:1180px){ .onav-t button{padding:0 10px; font-size:15px; gap:6px} }
@media (max-width:1060px){ .sysg{grid-template-columns:minmax(0,1fr)} }
@media (max-width:720px){ .pinf{grid-template-columns:1fr} }
"""
rep('/* regular-clients filter tab */', EXTRA_CSS + '\n/* regular-clients filter tab */')

# ---- scripts: vendored jsPDF, boot data slot ----
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>',
    '<script src="/vendor/jspdf.umd.min.js"></script>\n<!--BOOT-->')

# ---- config: from server instead of localStorage ----
rep_re(r"try\{ for\(let i=0;i<localStorage\.length;i\+\+\).*?\n", '')
rep("const CFG={inside:8, terrace:6,", boot_js + "\nconst CFG={pin:'1234', inside:8, terrace:6,")
rep_re(r"const STORE='nqender-pos-v3';\nfunction saveCfg\(\)\{.*?\n\(function loadCfg\(\)\{.*?\n\}\)\(\);",
"""function cfgDoc(){ return {menu:MENU.map(({id,c,n,p,min,cost,track})=>({id,c,n,p,min,cost,track})), inside:CFG.inside, terrace:CFG.terrace, staff:CFG.staff, salary:CFG.salary, accounts:CFG.accounts, pin:CFG.pin}; }
function saveCfg(){ schedulePersist(); }
function applyCfg(d){
  if(!d) return;
  if(Array.isArray(d.menu)&&d.menu.length){ MENU.length=0; d.menu.forEach(m=>MENU.push({...m, a:DEF_ART[m.id]||catArt(m.c)})); Object.keys(M).forEach(k=>delete M[k]); MENU.forEach(m=>M[m.id]=m); }
  if(d.inside>0) CFG.inside=d.inside; if(d.terrace>=0) CFG.terrace=d.terrace;
  if(Array.isArray(d.staff)&&d.staff.length) CFG.staff=d.staff;
  if(d.salary&&typeof d.salary==='object') CFG.salary=d.salary;
  if(Array.isArray(d.accounts)) CFG.accounts=d.accounts;
  if(d.pin) CFG.pin=String(d.pin);
  if(typeof TABLES!=='undefined') buildTables();
}
applyCfg(bootDoc('cfg'));""")

# ---- state: no demo orders, staff remembered per device ----
rep_re(r"  orders:\{\n    t3:.*?\n  \},\n  sales:\[\]\n\};", "  orders:bootMap('orders'),\n  sales:bootList('sales')\n};")
rep("staff:CFG.staff[0],", "staff:CFG.staff.includes(LS.get('nq-staff',''))?LS.get('nq-staff',''):CFG.staff[0],")
rep("S.house=[];", "S.house=bootList('house');")
rep_re(r"\(function seed\(\)\{.*?\n\}\)\(\);\nconst todays", "const todays")
rep("Object.entries(S.orders).forEach(([k,o])=>{ o.rounds=", "Object.entries(S.orders).forEach(([k,o])=>{ if(!o.lines) return; o.rounds=")
rep_re(r"\(function demoRounds\(\)\{.*?\n\}\)\(\);\n", '')
rep_re(r"\(function demoAccounts\(\)\{.*?\n\}\)\(\);\n", '')

# expenses, reminders, ledger, closings: from server
rep_re(r"const EXPKEY='nqender-expenses-v3';\nfunction saveExp\(\)\{.*?\nS\.exp=\(function\(\)\{.*?\n\}\)\(\);",
       "function saveExp(){ schedulePersist(); }\nS.exp=bootList('exp');")
rep_re(r"function saveRem\(\)\{.*?\n\(function loadRem\(\)\{.*?\n\}\)\(\);",
       "function saveRem(){ schedulePersist(); }\nS.rem=bootList('rem'); S.done=bootDoc('done')||{};")
rep("const REMKEY='nqender-reminders-v2';\n", '')
rep_re(r"const CLOSEKEY='nqender-closings-v1';\nfunction saveClose\(\)\{.*?\nfunction seedClosings\(\)\{.*?\n\}\nconst closings=",
       "function saveClose(){ schedulePersist(); }\nfunction seedClosings(){ return bootList('closings'); }\nconst closings=")
rep_re(r"function saveLedger\(\)\{.*?\nS\.ledger=\(function\(\)\{.*?\n\}\)\(\);",
       "function saveLedger(){ schedulePersist(); }\nS.ledger=bootList('ledger');")
s = s.replace("const LEDGER='nqender-ledger-v1';\n", '')

# stock: from the server
rep_re(r"/\*STOCK-STORE\*/.*?/\*/STOCK-STORE\*/", "function saveStock(){ schedulePersist(); }\nS.stock=bootList('stock');")

# Excel export library is bundled with the app
rep("const XLSX_SRC='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';", "const XLSX_SRC='/vendor/xlsx.full.min.js';")

# every render persists whatever changed
rep("  if(q&&S.q){ q.focus(); q.setSelectionRange(q.value.length,q.value.length); }\n}",
    "  if(q&&S.q){ q.focus(); q.setSelectionRange(q.value.length,q.value.length); }\n  schedulePersist();\n}")

# PIN from settings, no demo hint
rep("if(S.pin==='1234')", "if(S.pin===CFG.pin)")
rep('\n    <p class="hint">PIN për demo: 1234</p></div>`;', '</div>`;')

# printing
s = s.replace("setTimeout(()=>{ try{ window.print(); }catch(e){} },60);", "doPrint();")

# PDF download: normal browser/Electron download
rep_re(r"  const dl=window\.claude&&window\.claude\.use\?await window\.claude\.use\('downloads'\):null;\n.*?\n  catch\(e\)\{ if\(e&&e\.code==='declined'\) return; toast\('PDF nuk u ruajt'\); \}",
"""  const blob=new Blob([doc.output('arraybuffer')],{type:'application/pdf'}), a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`nQender-pasqyra-${D.mk}.pdf`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000); toast('PDF u shkarkua');""")

# staff switch is remembered on this device
rep("S.staff=st[(st.indexOf(S.staff)+1)%st.length]; render();", "S.staff=st[(st.indexOf(S.staff)+1)%st.length]; LS.set('nq-staff',S.staff); render();")

# Sistemi tab in the office
rep("const OFFICE=['close','cal','exp','pay','sum','admin'];", "const OFFICE=['close','cal','exp','pay','sum','admin','sys'];")
rep("['admin','Menaxhimi',I.gear]];", "['admin','Menaxhimi',I.gear],['sys','Sistemi',I.bolt]];")
rep("close:closeView})[S.view]()", "close:closeView,sys:sysView})[S.view]()")
# remote owner: closing the office means logging out is separate; keep lock behaviour for bar screen only
rep("if(d.act==='lock'){ S.admin=false;", "if(d.act==='lock'){ S.admin=BOOT.remote;")

# remove prototype-only wording
rep(" · të dhënat e mëparshme janë shembull", "")
rep('\n      <p class="dnote">Të dhënat e mëparshme në këtë prototip janë shembull.</p>', '')

# boot at the very end (replaces the prototype's final render)
rep_re(r"\nrender\(\);\n</script>", "\n" + sync_js + "\n</script>")

out = ROOT / 'app' / 'index.html'
out.write_text(s)
print('wrote', out, len(s), 'bytes')
