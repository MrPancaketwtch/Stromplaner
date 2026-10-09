const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates:     () => ipcRenderer.invoke('check-for-updates'),
  installUpdate:       () => ipcRenderer.invoke('install-update'),
  getUpdateChannel:    () => ipcRenderer.invoke('get-update-channel'),
  setUpdateChannel:    (kanal) => ipcRenderer.invoke('set-update-channel', kanal),
  onUpdateStatus:      (cb) => ipcRenderer.on('update-status', (_, msg) => cb(msg)),
  appVersion:          () => ipcRenderer.invoke('app-version'),
  exportInspectionPdf: (html) => ipcRenderer.invoke('export-inspection-pdf', html),
  savePlan:            (args) => ipcRenderer.invoke('save-plan', args),
  openPlan:            () => ipcRenderer.invoke('open-plan'),
  openRecent:          (filePath) => ipcRenderer.invoke('open-recent', filePath),
  getRecents:          () => ipcRenderer.invoke('get-recents'),
  loadLibrary:         () => ipcRenderer.invoke('load-library'),
  saveLibrary:         (data) => ipcRenderer.invoke('save-library', data),
  startLocalShare:     (args) => ipcRenderer.invoke('start-local-share', args),
  stopLocalShare:      () => ipcRenderer.invoke('stop-local-share'),
  updateLocalShare:    (json) => ipcRenderer.invoke('update-local-share', json),
  onLocalShareReceived: (cb) => {
    const handler = (_, payload) => cb(payload);
    ipcRenderer.on('local-share-received', handler);
    return () => ipcRenderer.removeListener('local-share-received', handler);
  },
  makeQr:              (url) => ipcRenderer.invoke('make-qr', url),
});
