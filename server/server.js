// The local server. It runs inside the desktop app on the bar PC.
// - The bar screen talks to it on 127.0.0.1 (no login needed).
// - The owner's phone/laptop reach it over Tailscale and must log in with the owner PIN.
// - Every change is pushed live to all open screens (Server-Sent Events).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { openDb } = require('./db');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const DEFAULT_PIN = '1234';

function startServer({ dataDir, appDir, port = 4848, host = '0.0.0.0', hooks = {}, version = 'dev' }) {
  const db = openDb(path.join(dataDir, 'nqender.db'));
  const clients = new Set();            // open SSE connections
  const fails = new Map();              // ip -> {n, until} for PIN brute-force protection
  let tokens = db.meta('tokens', []);   // remote login sessions

  const isLocal = req => LOCAL.has(req.socket.remoteAddress);
  const cookieToken = req => {
    const m = /(?:^|;\s*)nq=([a-f0-9]{48})/.exec(req.headers.cookie || '');
    return m ? m[1] : null;
  };
  const authed = req => isLocal(req) || (cookieToken(req) && tokens.some(t => t.t === cookieToken(req)));
  const ownerPin = () => { const c = db.all('cfg').find(d => d.id === 'main'); return (c && c.data.pin) || DEFAULT_PIN; };

  function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra });
    res.end(buf);
  }
  function readJson(req, limit = 8 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
      req.on('error', reject);
    });
  }
  function broadcast(msg, except) {
    const line = `data: ${JSON.stringify(msg)}\n\n`;
    for (const c of clients) if (c.id !== except) c.res.write(line);
  }
  function addresses() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        out.push({ name, ip: a.address, tailscale: a.address.startsWith('100.') || /tailscale/i.test(name) });
      }
    }
    return out;
  }
  function info() {
    return {
      version, hostname: os.hostname(), port, addresses: addresses(),
      backup: db.meta('lastBackup', null), printer: db.meta('printer', ''),
      update: hooks.updateStatus ? hooks.updateStatus() : null,
    };
  }
  function serveIndex(req, res) {
    const local = isLocal(req);
    const boot = { ...db.snapshot(), local, remote: !local, info: info() };
    const json = JSON.stringify(boot).replace(/</g, '\\u003c');
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8')
      .replace('<!--BOOT-->', `<script>window.__BOOT=${json};</script>`);
    send(res, 200, html, MIME['.html']);
  }
  function serveStatic(req, res, rel) {
    const file = path.normalize(path.join(appDir, rel));
    if (!file.startsWith(appDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'not found' });
    const ext = path.extname(file);
    send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream', { 'Cache-Control': 'public, max-age=3600' });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      const ip = req.socket.remoteAddress;

      // Public: login page, its assets, and the login call itself.
      if (p === '/login' || p === '/manifest.webmanifest' || p.startsWith('/fonts/') || p.startsWith('/icons/')) {
        return serveStatic(req, res, p === '/login' ? 'login.html' : p.slice(1));
      }
      if (p === '/api/login' && req.method === 'POST') {
        const f = fails.get(ip) || { n: 0, until: 0 };
        if (Date.now() < f.until) return send(res, 429, { error: 'Shumë tentime. Provo pas një minute.' });
        const { pin } = await readJson(req);
        if (String(pin || '') !== ownerPin()) {
          f.n += 1; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60_000; }
          fails.set(ip, f);
          return send(res, 401, { error: 'PIN i gabuar' });
        }
        fails.delete(ip);
        const t = crypto.randomBytes(24).toString('hex');
        tokens = [...tokens.filter(x => Date.now() - x.at < 90 * 864e5), { t, at: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 120) }].slice(-20);
        db.setMeta('tokens', tokens);
        return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': `nq=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}` });
      }

      if (!authed(req)) {
        if (p.startsWith('/api/')) return send(res, 401, { error: 'login' });
        res.writeHead(302, { Location: '/login' }); return res.end();
      }

      if (p === '/' || p === '/index.html') return serveIndex(req, res);

      if (p === '/api/logout' && req.method === 'POST') {
        const t = cookieToken(req); tokens = tokens.filter(x => x.t !== t); db.setMeta('tokens', tokens);
        return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': 'nq=; Path=/; Max-Age=0' });
      }
      if (p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        const c = { id: url.searchParams.get('client') || crypto.randomUUID(), res };
        clients.add(c);
        res.write(`data: ${JSON.stringify({ hello: true, info: info() })}\n\n`);
        const hb = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => { clearInterval(hb); clients.delete(c); });
        return;
      }
      if (p === '/api/sync' && req.method === 'POST') {
        const { client, ops } = await readJson(req);
        if (!Array.isArray(ops)) return send(res, 400, { error: 'ops' });
        db.applyOps(ops);
        broadcast({ ops }, client);
        if (hooks.onOps) hooks.onOps(ops);
        return send(res, 200, { ok: true });
      }
      if (p === '/api/state') return send(res, 200, db.snapshot());
      if (p === '/api/info') return send(res, 200, info());

      // Bar-PC-only actions (printing, printer setup, backups on this machine).
      if (p.startsWith('/api/local/')) {
        if (!isLocal(req)) return send(res, 403, { error: 'Vetëm nga kompjuteri i barit' });
        const body = req.method === 'POST' ? await readJson(req) : {};
        if (p === '/api/local/print') {
          if (!hooks.print) return send(res, 200, { ok: false, error: 'Printimi s’është i disponueshëm' });
          return send(res, 200, await hooks.print(String(body.html || ''), db.meta('printer', '')));
        }
        if (p === '/api/local/printers') return send(res, 200, hooks.printers ? await hooks.printers() : []);
        if (p === '/api/local/printer') { db.setMeta('printer', String(body.name || '')); broadcast({ info: info() }); return send(res, 200, { ok: true }); }
        if (p === '/api/local/backup') return send(res, 200, await runBackup('manual'));
        if (p === '/api/local/open-backups') { if (hooks.openBackups) hooks.openBackups(); return send(res, 200, { ok: true }); }
        if (p === '/api/local/restore') { if (hooks.restore) return send(res, 200, await hooks.restore()); return send(res, 200, { ok: false }); }
        if (p === '/api/local/install-update') { if (hooks.installUpdate) hooks.installUpdate(); return send(res, 200, { ok: true }); }
        return send(res, 404, { error: 'not found' });
      }

      if (req.method === 'GET') return serveStatic(req, res, p.slice(1));
      send(res, 404, { error: 'not found' });
    } catch (e) {
      console.error('[server]', e);
      if (!res.headersSent) send(res, 500, { error: String(e.message || e) });
    }
  });

  async function runBackup(reason) {
    if (!hooks.backup) return { ok: false, error: 'no backup hook' };
    try {
      const r = await hooks.backup(db, reason);
      db.setMeta('lastBackup', { at: Date.now(), reason, ...r });
      broadcast({ info: info() });
      return { ok: true, ...r };
    } catch (e) {
      console.error('[backup]', e);
      return { ok: false, error: String(e.message || e) };
    }
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ server, db, port, runBackup, broadcast, info, close: () => new Promise(r => { for (const c of clients) c.res.end(); server.close(() => { db.close(); r(); }); if (server.closeAllConnections) server.closeAllConnections(); }) }));
  });
}

module.exports = { startServer };
