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
      if (!splash.isDestroyed()) splash.close();
      win.show();
      win.focus();
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
