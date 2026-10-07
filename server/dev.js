// Run the server without Electron (for development and tests): node server/dev.js [dataDir] [port]
const path = require('path');
const { startServer } = require('./server');
const dataDir = process.argv[2] || path.join(__dirname, '..', '.devdata');
const port = Number(process.argv[3] || 4848);
startServer({
  dataDir, port, appDir: path.join(__dirname, '..', 'app'), version: require('../package.json').version,
  hooks: {
    print: async (html, printer) => { console.log('[print]', printer || '(default)', html.length, 'bytes'); return { ok: true }; },
    printers: async () => [{ name: 'POS-80', displayName: 'POS-80', isDefault: true }],
    backup: async (db) => { const f = path.join(dataDir, 'backups', `nqender-${Date.now()}.db`); await db.backupTo(f); return { file: f }; },
  },
}).then(s => console.log(`dev server on http://127.0.0.1:${s.port}`));
