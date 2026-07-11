const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
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

  win.once('ready-to-show', () => win.show());

  // PDF-Export (window.open('', '_blank')) erlauben; echte URLs im Systembrowser öffnen
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
