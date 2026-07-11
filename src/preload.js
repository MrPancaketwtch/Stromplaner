const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate:   () => ipcRenderer.invoke('install-update'),
  onUpdateStatus:  (cb) => ipcRenderer.on('update-status', (_, msg) => cb(msg)),
});
