const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const QRCode = require('qrcode');

const root = app.getAppPath();
let mainWindow = null;

function createWindow() {
  const splash = new BrowserWindow({
    width: 360,
    height: 240,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#1b2026',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));

  const iconPath = path.join(root, 'build', 'icon.png');
  const icon = fs.existsSync(iconPath) ? iconPath : undefined;

  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: 'Stromplaner',
    show: false,
    icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(root, 'app', 'Stromplaner.html'));

  let shown = false;
  const tryShow = () => {
    if (shown || !appReady || !minTimeUp) return;
    shown = true;
    splash.webContents.executeJavaScript(
      'document.body.style.opacity="0"'
    ).catch(() => {});
    setTimeout(() => {
      win.show();
      win.focus();
      win.webContents.focus();
      if (!splash.isDestroyed()) {
        splash.setAlwaysOnTop(false);
        splash.close();
      }
      if (app.isPackaged) setupAutoUpdater(win);
    }, 300);
  };

  let appReady = false;
  let minTimeUp = false;

  win.once('ready-to-show', () => { appReady = true; tryShow(); });
  setTimeout(() => { minTimeUp = true; tryShow(); }, 3000);

  win.on('focus', () => { if (!win.isDestroyed()) win.webContents.focus(); });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 900,
          title: 'Stromplaner – PDF-Vorschau',
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// macOS tauscht die App nur aus, wenn sie mit Apple-Developer-ID signiert ist – das ist sie nicht.
// Dort daher nur auf neue Versionen hinweisen und die Download-Seite öffnen.
const MANUAL_UPDATE = process.platform === 'darwin';
const RELEASES_URL = 'https://github.com/MrPancaketwtch/Stromplaner/releases/latest';

function setupAutoUpdater(win) {
  const send = (type, payload) => {
    if (!win.isDestroyed()) win.webContents.send('update-status', { type, ...payload });
  };

  let updateReady = false;
  if (MANUAL_UPDATE) autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update',  () => send('checking'));
  autoUpdater.on('update-not-available', () => send('up-to-date'));
  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err?.message || err);
    send('error', { message: err?.message || String(err) });
  });
  autoUpdater.on('download-progress', (p) =>
    send('downloading', { percent: Math.round(p.percent) })
  );
  autoUpdater.on('update-available', (info) =>
    send('available', { version: info.version, manual: MANUAL_UPDATE })
  );
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    send('downloaded', { version: info.version });
  });

  ipcMain.handle('check-for-updates', () => {
    if (updateReady) { send('downloaded'); return; }
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('checkForUpdates error:', err?.message || err);
      send('error', { message: err?.message || String(err) });
    });
  });

  ipcMain.handle('install-update', () => {
    if (MANUAL_UPDATE) { shell.openExternal(RELEASES_URL); return; }
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

ipcMain.handle('app-version', () => app.getVersion());

// ── Planungsstände: Verzeichnis + Recents ────────────────────────────────────
const getPlansDir    = () => path.join(app.getPath('userData'), 'Speicherstände', 'Gesamt');
const getLibraryFile = () => path.join(app.getPath('userData'), 'Speicherstände', 'Bibliothek.json');
const getRecentsFile = () => path.join(app.getPath('userData'), 'recents.json');

function ensurePlansDir() {
  const d = getPlansDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
function loadRecents() {
  try { if (fs.existsSync(getRecentsFile())) return JSON.parse(fs.readFileSync(getRecentsFile(), 'utf8')); } catch {}
  return [];
}
function addRecent(filePath, name) {
  let list = loadRecents().filter(r => r.filePath !== filePath);
  list.unshift({ filePath, name, date: new Date().toISOString() });
  if (list.length > 10) list = list.slice(0, 10);
  try { fs.writeFileSync(getRecentsFile(), JSON.stringify(list, null, 2), 'utf8'); } catch {}
  return list;
}

ipcMain.handle('get-recents', () => loadRecents());

ipcMain.handle('load-library', () => {
  try {
    const f = getLibraryFile();
    if(fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch(e) { console.error('load-library error:', e); }
  return null;
});

ipcMain.handle('save-library', (_event, data) => {
  try {
    const f = getLibraryFile();
    const dir = path.dirname(f);
    if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) { console.error('save-library error:', e); }
});

ipcMain.handle('save-plan', async (_event, { json, suggestedName }) => {
  ensurePlansDir();
  const parent = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible());
  const { filePath, canceled } = await dialog.showSaveDialog(parent, {
    title: 'Stromplan speichern',
    defaultPath: path.join(getPlansDir(), `${suggestedName}.json`),
    filters: [{ name: 'Stromplaner-Datei', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, json, 'utf8');
  const name = path.basename(filePath, '.json');
  return { filePath, name, recents: addRecent(filePath, name) };
});

ipcMain.handle('open-plan', async () => {
  ensurePlansDir();
  const parent = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible());
  const { filePaths, canceled } = await dialog.showOpenDialog(parent, {
    title: 'Stromplan öffnen',
    defaultPath: getPlansDir(),
    filters: [{ name: 'Stromplaner-Datei', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  const name = path.basename(filePath, '.json');
  return { data: fs.readFileSync(filePath, 'utf8'), filePath, name, recents: addRecent(filePath, name) };
});

ipcMain.handle('open-recent', async (_event, filePath) => {
  if (!fs.existsSync(filePath)) {
    const list = loadRecents().filter(r => r.filePath !== filePath);
    try { fs.writeFileSync(getRecentsFile(), JSON.stringify(list, null, 2), 'utf8'); } catch {}
    return { error: 'not-found', recents: list };
  }
  const name = path.basename(filePath, '.json');
  return { data: fs.readFileSync(filePath, 'utf8'), filePath, name, recents: addRecent(filePath, name) };
});

ipcMain.handle('export-inspection-pdf', async (_event, html) => {
  const tmpPath = path.join(os.tmpdir(), `ep-${Date.now()}.html`);
  let win;
  try {
    const parent = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible());
    const { filePath, canceled } = await dialog.showSaveDialog(parent, {
      title: 'Prüfprotokoll speichern',
      defaultPath: 'Errichtungspruefung.pdf',
      filters: [{ name: 'PDF-Datei', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;

    fs.writeFileSync(tmpPath, html, 'utf8');

    win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    await win.loadFile(tmpPath);

    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    });

    fs.writeFileSync(filePath, pdfBuffer);
    shell.showItemInFolder(filePath);
    const mainWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible());
    if (mainWin) { mainWin.focus(); mainWin.webContents.focus(); }
    return filePath;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// ── Lokales Teilen per QR-Code ────────────────────────────────────────────────
let localShareServer = null;
let sharedPlanJson = '';
let sharedPlanName = 'plan';
let receiveDialogOpen = false;

const MAX_UPLOAD = 25 * 1024 * 1024;
// VPN-/virtuelle Adapter sind vom Handy aus meist nicht erreichbar → ans Ende der Auswahl
const VIRTUAL_IFACE = /vpn|virtual|vethernet|hyper-v|vmware|virtualbox|vbox|docker|wsl|wireguard|nordlynx|tailscale|zerotier|hamachi|openvpn|\btap\b|\btun\b/i;

const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) { reject(new Error('too-large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

async function receivePlanFromPhone(req, res) {
  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, e.message === 'too-large' ? 413 : 400, { ok: false, error: e.message === 'too-large' ? 'Plan zu groß' : 'Ungültige Daten' });
  }
  if (data?._format !== 'stromplaner') return sendJson(res, 400, { ok: false, error: 'Keine Stromplaner-Datei' });
  if (!mainWindow || mainWindow.isDestroyed()) return sendJson(res, 503, { ok: false, error: 'Stromplaner ist am PC nicht geöffnet' });
  if (receiveDialogOpen) return sendJson(res, 409, { ok: false, error: 'Am PC ist bereits eine Abfrage offen' });

  receiveDialogOpen = true;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    const count = Object.keys(data.inspResults || {}).length;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Plan vom Handy',
      message: `Plan „${data.meta?.production || 'ohne Namen'}“ vom Handy empfangen`,
      detail: `Enthält Prüfergebnisse für ${count} Verteiler.\n\n„Nur Prüfergebnisse“ übernimmt Prüfungsdetails und Messwerte, die Planung am PC bleibt unverändert.\n„Ganzen Plan“ ersetzt den kompletten Plan am PC.`,
      buttons: ['Nur Prüfergebnisse übernehmen', 'Ganzen Plan übernehmen', 'Abbrechen'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 2) return sendJson(res, 409, { ok: false, error: 'Am PC abgelehnt' });
    const mode = response === 0 ? 'insp' : 'full';
    mainWindow.webContents.send('local-share-received', { data, mode });
    sendJson(res, 200, { ok: true, mode });
  } finally {
    receiveDialogOpen = false;
  }
}

ipcMain.handle('start-local-share', async (_event, { planJson, planName }) => {
  if (localShareServer) { localShareServer.close(); localShareServer = null; }
  sharedPlanJson = planJson;
  sharedPlanName = planName || 'plan';
  const port = 4747;
  localShareServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204); res.end(); return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      receivePlanFromPhone(req, res).catch(() => { if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Interner Fehler' }); });
      return;
    }
    const safe = sharedPlanName.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'plan';
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${safe}.json"`,
    });
    res.end(sharedPlanJson);
  });
  await new Promise((resolve, reject) => {
    localShareServer.once('error', (e) => {
      localShareServer = null;
      reject(new Error(e.code === 'EADDRINUSE' ? `Port ${port} ist belegt – läuft Stromplaner schon ein zweites Mal?` : e.message));
    });
    localShareServer.listen(port, '0.0.0.0', resolve);
  });

  const ifaces = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const alias of list) {
      if (alias.family === 'IPv4' && !alias.internal) ifaces.push({ ip: alias.address, name, virtual: VIRTUAL_IFACE.test(name) });
    }
  }
  ifaces.sort((a, b) => a.virtual - b.virtual);
  if (!ifaces.length) ifaces.push({ ip: '127.0.0.1', name: 'localhost', virtual: false });
  const ips = ifaces.map(i => i.ip);

  // QR für die erste IP; Renderer kann bei mehreren IPs umschalten
  const makeQR = async (ip) => QRCode.toDataURL(`http://${ip}:${port}/plan.json`,
    { width: 180, margin: 1, color: { dark: '#e8eaed', light: '#1b2026' } });

  const qrDataUrl = await makeQR(ips[0]);
  return { ips, ifaces, port, activeIp: ips[0], url: `http://${ips[0]}:${port}/plan.json`, qrDataUrl };
});

ipcMain.handle('update-local-share', (_event, planJson) => { sharedPlanJson = planJson; });

ipcMain.handle('stop-local-share', () => {
  if (localShareServer) { localShareServer.close(); localShareServer = null; }
});

ipcMain.handle('make-qr', async (_event, url) =>
  QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: '#e8eaed', light: '#1b2026' } })
);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
