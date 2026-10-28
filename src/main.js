const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = app.getAppPath();
let mainWindow = null;
let btAuswahl = null; // Rückruf der laufenden Bluetooth-Geräteauswahl

ipcMain.on('bt-waehlen', (_event, id) => {
  const cb = btAuswahl;
  btAuswahl = null;
  cb?.(id || '');
});

// Native Dialoge (Speichern/Öffnen/MessageBox) geben unter Windows den Tastatur-Fokus
// nicht zuverlässig an den Renderer zurück (electron#35872, #41602) → Textfelder
// reagieren nicht mehr. Blur + Focus erzwingt, dass Chromium den Fokus neu vergibt.
function restoreFocus(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  setTimeout(() => {
    if (win.isDestroyed()) return;
    if (win.isFocused()) win.blur();
    win.focus();
    win.webContents.focus();
  }, 50);
}

async function withDialog(win, fn) {
  try { return await fn(); }
  finally { restoreFocus(win); }
}

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

  // Web Bluetooth: Electron hat keine eigene Geräteauswahl – die gefundenen Handys gehen an die App,
  // die Auswahl kommt über 'bt-waehlen' zurück (leere Id = abbrechen)
  win.webContents.on('select-bluetooth-device', (event, geraete, callback) => {
    event.preventDefault();
    btAuswahl = callback;
    win.webContents.send('bt-geraete', geraete.map(g => ({ id: g.deviceId, name: g.deviceName || '' })));
  });
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
  // Schließt das Druck-/PDF-Vorschaufenster, bekommt das Hauptfenster den Fokus zurück
  win.webContents.on('did-create-window', (child) => {
    child.on('closed', () => restoreFocus(win));
  });

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
const RELEASES_URL = 'https://github.com/MrPancaketwtch/Stromplaner/releases';

// Update-Kanal: „stabil“ = nur fertige Versionen, „beta“ = auch Betas. Die Wahl bleibt gespeichert;
// ohne gespeicherte Wahl sucht eine installierte Beta weiter nach Betas.
const istVorabversion = (v) => String(v || '').includes('-');
const updateSettingsFile = () => path.join(app.getPath('userData'), 'update-settings.json');
let updateKanal = null;
let kanalWechsel = null; // wird gesetzt, sobald der Updater läuft (nur in der installierten App)

function ladeUpdateKanal() {
  try {
    const k = JSON.parse(fs.readFileSync(updateSettingsFile(), 'utf8')).kanal;
    if (k === 'beta' || k === 'stabil') return k;
  } catch {}
  return istVorabversion(app.getVersion()) ? 'beta' : 'stabil';
}
const aktuellerKanal = () => updateKanal || (updateKanal = ladeUpdateKanal());

function kanalAnwenden(kanal) {
  autoUpdater.channel = kanal === 'beta' ? 'beta' : 'latest';
  autoUpdater.allowPrerelease = kanal === 'beta';
  autoUpdater.allowDowngrade = false; // der channel-Setter erlaubt Downgrades – nie auf eine ältere Version zurückstufen
}

ipcMain.handle('get-update-channel', () => aktuellerKanal());
ipcMain.handle('set-update-channel', (_event, kanal) => {
  if (kanal !== 'beta' && kanal !== 'stabil') return { kanal: aktuellerKanal(), geprueft: false };
  updateKanal = kanal;
  try { fs.writeFileSync(updateSettingsFile(), JSON.stringify({ kanal }, null, 2), 'utf8'); } catch {}
  if (!kanalWechsel) return { kanal, geprueft: false };
  kanalWechsel(kanal);
  return { kanal, geprueft: true };
});

function setupAutoUpdater(win) {
  const send = (type, payload) => {
    if (!win.isDestroyed()) win.webContents.send('update-status', { type, ...payload });
  };

  let updateReady = false;
  let geladeneVersion = null;
  let gefundeneVersion = null;
  if (MANUAL_UPDATE) autoUpdater.autoDownload = false;
  kanalAnwenden(aktuellerKanal());

  const pruefen = () => {
    if (updateReady) { send('downloaded', { version: geladeneVersion }); return; }
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('checkForUpdates error:', err?.message || err);
      send('error', { message: err?.message || String(err) });
    });
  };

  kanalWechsel = (kanal) => {
    // Eine schon geladene Beta soll nach dem Wechsel auf „Stabil“ nicht mehr installiert werden
    if (kanal === 'stabil' && istVorabversion(geladeneVersion)) {
      autoUpdater.autoInstallOnAppQuit = false;
      updateReady = false;
      geladeneVersion = null;
    }
    kanalAnwenden(kanal);
    pruefen();
  };

  autoUpdater.on('checking-for-update',  () => send('checking'));
  autoUpdater.on('update-not-available', () => send('up-to-date'));
  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err?.message || err);
    send('error', { message: err?.message || String(err) });
  });
  autoUpdater.on('download-progress', (p) =>
    send('downloading', { percent: Math.round(p.percent) })
  );
  autoUpdater.on('update-available', (info) => {
    gefundeneVersion = info.version;
    send('available', { version: info.version, manual: MANUAL_UPDATE, beta: istVorabversion(info.version) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    geladeneVersion = info.version;
    autoUpdater.autoInstallOnAppQuit = true;
    send('downloaded', { version: info.version, beta: istVorabversion(info.version) });
  });

  ipcMain.handle('check-for-updates', () => pruefen());

  ipcMain.handle('install-update', () => {
    // „latest“ zeigt auf GitHub nie Betas – daher direkt die gefundene Version öffnen
    if (MANUAL_UPDATE) { shell.openExternal(gefundeneVersion ? `${RELEASES_URL}/tag/v${gefundeneVersion}` : `${RELEASES_URL}/latest`); return; }
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
  const { filePath, canceled } = await withDialog(parent, () => dialog.showSaveDialog(parent, {
    title: 'Stromplan speichern',
    defaultPath: path.join(getPlansDir(), `${suggestedName}.json`),
    filters: [{ name: 'Stromplaner-Datei', extensions: ['json'] }],
  }));
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, json, 'utf8');
  const name = path.basename(filePath, '.json');
  return { filePath, name, recents: addRecent(filePath, name) };
});

ipcMain.handle('open-plan', async () => {
  ensurePlansDir();
  const parent = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible());
  const { filePaths, canceled } = await withDialog(parent, () => dialog.showOpenDialog(parent, {
    title: 'Stromplan öffnen',
    defaultPath: getPlansDir(),
    filters: [{ name: 'Stromplaner-Datei', extensions: ['json'] }],
    properties: ['openFile'],
  }));
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
    const { filePath, canceled } = await withDialog(parent, () => dialog.showSaveDialog(parent, {
      title: 'Prüfprotokoll speichern',
      defaultPath: 'Errichtungspruefung.pdf',
      filters: [{ name: 'PDF-Datei', extensions: ['pdf'] }],
    }));
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
    return filePath;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    restoreFocus();
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
