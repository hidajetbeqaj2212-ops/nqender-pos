// Desktop app for the bar PC: starts the local server, shows the POS full-screen,
// prints receipts silently, makes backups, and keeps itself up to date.
const { app, BrowserWindow, dialog, shell, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { startServer } = require('../server/server');

const PORT = 4848;
const APP_DIR = path.join(__dirname, '..', 'app');
let win = null;
let srv = null;
let updateState = { text: 'Kontrollohet automatikisht', ready: false };

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

const userData = () => app.getPath('userData');
const backupDir = () => path.join(userData(), 'backups');
function oneDriveDir() {
  const od = process.env.OneDriveConsumer || process.env.OneDrive || process.env.OneDriveCommercial;
  return od && fs.existsSync(od) ? path.join(od, 'nQender Backups') : null;
}
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
function prune(dir, keep) {
  try {
    const files = fs.readdirSync(dir).filter(f => /^nqender-.*\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(path.join(dir, f));
  } catch (e) { /* folder may not exist yet */ }
}

/* ---------- backups: this PC + OneDrive ---------- */
async function backup(db, reason) {
  const name = `nqender-${stamp()}${reason === 'close' ? '-mbyllja' : ''}.db`;
  const local = path.join(backupDir(), name);
  await db.backupTo(local);
  prune(backupDir(), 90);
  let onedrive = null;
  const od = oneDriveDir();
  if (od) {
    try { fs.mkdirSync(od, { recursive: true }); fs.copyFileSync(local, path.join(od, name)); prune(od, 90); onedrive = od; }
    catch (e) { console.error('[backup] OneDrive copy failed', e); }
  }
  return { file: local, onedrive };
}
function scheduleBackups() {
  const check = () => {
    const last = srv.db.meta('lastBackup', null);
    if (!last || Date.now() - last.at > 20 * 3600 * 1000) srv.runBackup('auto');
  };
  setTimeout(check, 60 * 1000);
  setInterval(check, 60 * 60 * 1000);
}
async function restore() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Zgjidh backup-in për ta rikthyer', defaultPath: backupDir(),
    filters: [{ name: 'Backup n\'Qender', extensions: ['db'] }], properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const ok = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Anulo', 'Po, rikthe'], defaultId: 0, cancelId: 0,
    message: 'Të rikthehen të dhënat nga ky backup?',
    detail: 'Të dhënat e tanishme zëvendësohen me ato të backup-it. Para kësaj ruhet një kopje e të dhënave të tanishme. Aplikacioni rindizet.',
  });
  if (ok.response !== 1) return { ok: false };
  await srv.runBackup('para-rikthimit');
  const dbFile = srv.db.file;
  await srv.close();
  for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(dbFile + ext); } catch (e) { /* none */ } }
  fs.copyFileSync(r.filePaths[0], dbFile);
  app.relaunch(); app.exit(0);
  return { ok: true };
}

/* ---------- silent receipt printing ---------- */
async function print(html, printer) {
  const tmp = path.join(os.tmpdir(), `nqender-print-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const pw = new BrowserWindow({ show: false, width: 302, height: 800, webPreferences: { sandbox: true } });
  try {
    await pw.loadFile(tmp);
    const h = await pw.webContents.executeJavaScript('document.documentElement.scrollHeight');
    const heightMicrons = Math.max(60000, Math.ceil(h * 264.583) + 8000); // px → µm, plus a little feed
    const result = await new Promise(resolve => {
      pw.webContents.print({
        silent: true, printBackground: false, deviceName: printer || '',
        margins: { marginType: 'none' }, pageSize: { width: 80000, height: heightMicrons },
      }, (success, failureReason) => resolve({ ok: success, error: success ? null : failureReason }));
    });
    return result;
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    pw.destroy();
    fs.unlink(tmp, () => {});
  }
}
async function printers() {
  if (!win) return [];
  const list = await win.webContents.getPrintersAsync();
  return list.map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}

/* ---------- Windows firewall: let the owner's phone reach the app over Tailscale ---------- */
function ensureFirewallRule() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const rule = 'nQender POS';
  execFile('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${rule}`], (err) => {
    if (!err) return; // rule exists
    const args = `advfirewall firewall add rule name="${rule}" dir=in action=allow protocol=TCP localport=${PORT} profile=any`;
    // One-time admin prompt (UAC) to add the rule.
    execFile('powershell', ['-NoProfile', '-Command', `Start-Process netsh -ArgumentList '${args}' -Verb RunAs -WindowStyle Hidden`], () => {});
  });
}

/* ---------- auto-update from GitHub Releases ---------- */
function setupUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const set = s => { updateState = s; if (srv) srv.broadcast({ info: srv.info() }); };
  autoUpdater.on('checking-for-update', () => set({ text: 'Po kontrollohet…', ready: false }));
  autoUpdater.on('update-not-available', () => set({ text: 'Je në versionin e fundit', ready: false }));
  autoUpdater.on('update-available', i => set({ text: `Po shkarkohet versioni ${i.version}…`, ready: false }));
  autoUpdater.on('update-downloaded', i => set({ text: `Versioni ${i.version} është gati. Instalohet kur rindizet aplikacioni.`, ready: true }));
  autoUpdater.on('error', e => set({ text: 'Nuk u kontrollua (pa internet?)', ready: false }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15 * 1000);
  setInterval(check, 4 * 3600 * 1000);
  return () => autoUpdater.quitAndInstall(true, true);
}

/* ---------- window ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#f4f5f7',
    // Starts locked full-screen (kiosk) so staff only see the POS. Ctrl+Shift+Q or F11 toggles it.
    kiosk: app.isPackaged,
    title: "n'Qender POS", icon: path.join(__dirname, '..', 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  // Links to other sites open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(`http://127.0.0.1:${PORT}`)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const kioskToggle = input.key === 'F11'
      || (input.control && input.shift && input.key.toLowerCase() === 'q');
    if (kioskToggle) {
      const on = !win.isKiosk();
      win.setKiosk(on);
      if (!on) win.maximize();
      e.preventDefault();
    }
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { win.webContents.reload(); e.preventDefault(); }
  });
  // PDF downloads: ask where to save, defaulting to Documents.
  win.webContents.session.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });
  win.on('close', (e) => {
    if (app.isQuitting) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Anulo', 'Mbyll'], defaultId: 0, cancelId: 0,
      message: 'Ta mbyll aplikacionin?', detail: 'Kur aplikacioni është i mbyllur, pronari nuk e sheh dot nga telefoni.',
    });
    if (r !== 1) e.preventDefault(); else app.isQuitting = true;
  });
}

app.whenReady().then(async () => {
  let installUpdate = null;
  try {
    srv = await startServer({
      dataDir: path.join(userData(), 'data'), appDir: APP_DIR, port: PORT, version: app.getVersion(),
      hooks: {
        print, printers, backup, restore,
        openBackups: () => { fs.mkdirSync(backupDir(), { recursive: true }); shell.openPath(backupDir()); },
        updateStatus: () => updateState,
        installUpdate: () => { if (installUpdate) { app.isQuitting = true; installUpdate(); } },
        onOps: (ops) => { if (ops.some(o => o.coll === 'closings' && o.data)) srv.runBackup('close'); },
      },
    });
  } catch (e) {
    dialog.showErrorBox("n'Qender POS", e.code === 'EADDRINUSE'
      ? `Porti ${PORT} është i zënë. Ndoshta aplikacioni është tashmë i hapur.`
      : `Aplikacioni nuk u nis: ${e.message}`);
    app.exit(1);
    return;
  }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  createWindow();
  scheduleBackups();
  ensureFirewallRule();
  installUpdate = setupUpdates();
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', async () => { if (srv) await srv.close(); app.quit(); });
