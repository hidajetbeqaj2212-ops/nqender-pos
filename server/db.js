// SQLite storage. Every record is a JSON document in one table, keyed by (collection, id).
// The café's data volume is small (a busy year is ~40k sales), so this stays fast and simple.
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const COLLS = ['cfg', 'orders', 'sales', 'house', 'exp', 'ledger', 'rem', 'done', 'closings'];

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL,
      PRIMARY KEY (coll, id)
    );
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
  `);
  const q = {
    all: db.prepare('SELECT id, data FROM docs WHERE coll = ?'),
    put: db.prepare('INSERT INTO docs (coll, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated = excluded.updated'),
    del: db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?'),
    getMeta: db.prepare('SELECT v FROM meta WHERE k = ?'),
    setMeta: db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  };

  const api = {
    raw: db,
    file,
    all(coll) { return q.all.all(coll).map(r => ({ id: r.id, data: JSON.parse(r.data) })); },
    snapshot() {
      const out = {};
      for (const c of COLLS) out[c] = api.all(c);
      return out;
    },
    applyOps: db.transaction((ops) => {
      const t = Date.now();
      for (const op of ops) {
        if (!COLLS.includes(op.coll) || typeof op.id !== 'string' || !op.id) continue;
        if (op.data == null) q.del.run(op.coll, op.id);
        else q.put.run(op.coll, op.id, JSON.stringify(op.data), t);
      }
    }),
    meta(k, fallback = null) { const r = q.getMeta.get(k); return r ? JSON.parse(r.v) : fallback; },
    setMeta(k, v) { q.setMeta.run(k, JSON.stringify(v)); },
    async backupTo(dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); await db.backup(dest); return dest; },
    close() { db.close(); },
  };
  return api;
}

module.exports = { openDb, COLLS };
