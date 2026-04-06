const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

// Backend server'ı başlat
function startBackend() {
  backendProcess = spawn('node', ['backend/server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  backendProcess.on('error', (error) => {
    console.error('Backend başlatılamadı:', error);
  });

  backendProcess.on('exit', (code) => {
    console.log('Backend kapandı, kod:', code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1e1e1e',
    title: '360 Editor - AI Agent IDE',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    },
    autoHideMenuBar: true,
    frame: true
  });

  // Backend hazır olana kadar bekle
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3360');
  }, 2000);

  // DevTools (development için)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App hazır
app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Tüm pencereler kapandı
app.on('window-all-closed', () => {
  // Backend'i kapat
  if (backendProcess) {
    backendProcess.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App kapanıyor
app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

// IPC handlers
ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});
