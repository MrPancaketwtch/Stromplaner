const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = app.getAppPath();

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
      if (!splash.isDestroyed()) {
        splash.setAlwaysOnTop(false);
        splash.close();
      }
      win.show();
      win.focus();
      win.webContents.focus();
      if (app.isPackaged) setupAutoUpdater(win);
    }, 300);
  };

  let appReady = false;
  let minTimeUp = false;

  win.once('ready-to-show', () => { appReady = true; tryShow(); });
  setTimeout(() => { minTimeUp = true; tryShow(); }, 3000);

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

function setupAutoUpdater(win) {
  const send = (type, payload) => {
    if (!win.isDestroyed()) win.webContents.send('update-status', { type, ...payload });
  };

  let updateReady = false;

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
    send('available', { version: info.version })
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
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

ipcMain.handle('app-version', () => app.getVersion());

// ── Planungsstände: Verzeichnis + Recents ────────────────────────────────────
const getPlansDir  = () => path.join(app.getPath('userData'), 'Speicherstände', 'Gesamt');
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
    return filePath;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
