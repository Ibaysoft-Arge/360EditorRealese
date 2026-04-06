const { contextBridge, ipcRenderer } = require('electron');

// Renderer'a güvenli API sağla
contextBridge.exposeInMainWorld('electron', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  platform: process.platform,
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body })
});
