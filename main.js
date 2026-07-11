const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

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

  // Cache-Buster verhindert wiederverwendeten Renderer-Zustand
  splash.loadFile(path.join(__dirname, 'splash.html'), {
    query: { t: String(Date.now()) },
  });

  const iconPath = path.join(__dirname, 'build', 'icon.png');

  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: 'Stromplaner',
    show: false,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'Das Tool', 'Stromplaner.html'));

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
      if (app.isPackaged) checkForUpdates(win);
    }, 300);
  };

  let appReady = false;
  let minTimeUp = false;

  win.once('ready-to-show', () => { appReady = true; tryShow(); });
  setTimeout(() => { minTimeUp = true; tryShow(); }, 900);

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

function checkForUpdates(win) {
  autoUpdater.checkForUpdates().catch(() => {});

  autoUpdater.once('update-downloaded', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update verfügbar',
      message: `Stromplaner ${info.version} wurde heruntergeladen.`,
      detail: 'Die neue Version wird nach dem Neustart installiert.',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());
