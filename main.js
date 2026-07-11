const { app, BrowserWindow, shell } = require('electron');
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
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));

  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: 'Stromplaner',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'Das Tool', 'Stromplaner.html'));

  // Show main window only after BOTH ready-to-show AND minimum splash time
  let appReady = false;
  let minTimeUp = false;

  const tryShow = () => {
    if (!appReady || !minTimeUp) return;
    splash.webContents.executeJavaScript(
      'document.body.style.opacity="0"'
    ).catch(() => {});
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.close();
      win.show();
    }, 300);
  };

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());
