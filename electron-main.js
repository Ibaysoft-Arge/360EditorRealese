const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

let mainWindow;
let backendProcess;

// Auto-updater logging
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // Manuel download
autoUpdater.autoInstallOnAppQuit = true;

// ============================================
// AUTO-UPDATER
// ============================================

// Güncelleme kontrolü
function checkForUpdates() {
  log.info('🔍 Güncelleme kontrol ediliyor...');
  autoUpdater.checkForUpdates();
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('🔍 Güncelleme kontrol ediliyor...');
  sendStatusToWindow('checking-for-update');
});

autoUpdater.on('update-available', (info) => {
  log.info('✅ Yeni sürüm bulundu!', info.version);
  sendStatusToWindow('update-available', info);

  // Kullanıcıya sor
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '🎉 Yeni Sürüm Mevcut!',
    message: `360 Editor ${info.version} sürümü yayınlandı!`,
    detail: `Şu anki sürüm: ${app.getVersion()}\nYeni sürüm: ${info.version}\n\nGüncellemeleri indirmek ister misiniz?`,
    buttons: ['İndir', 'Daha Sonra'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      log.info('📥 Güncelleme indiriliyor...');
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('✅ Güncel sürüm kullanılıyor:', info.version);
  sendStatusToWindow('update-not-available', info);
});

autoUpdater.on('error', (err) => {
  log.error('❌ Güncelleme hatası:', err);
  sendStatusToWindow('error', { message: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  let logMessage = `📥 İndiriliyor: ${Math.round(progressObj.percent)}%`;
  log.info(logMessage);
  sendStatusToWindow('download-progress', progressObj);

  // Progress bar göster
  if (mainWindow) {
    mainWindow.setProgressBar(progressObj.percent / 100);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('✅ Güncelleme indirildi!', info.version);
  sendStatusToWindow('update-downloaded', info);

  // Progress bar temizle
  if (mainWindow) {
    mainWindow.setProgressBar(-1);
  }

  // Kullanıcıya sor
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '✅ Güncelleme Hazır!',
    message: `360 Editor ${info.version} indirildi!`,
    detail: 'Güncellemeyi kurmak için uygulamayı yeniden başlatmak gerekiyor.',
    buttons: ['Yeniden Başlat', 'Daha Sonra'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      log.info('🔄 Güncelleme kuruluyor...');
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    }
  });
});

// Frontend'e mesaj gönder
function sendStatusToWindow(event, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-status', { event, data });
  }
}

// IPC - Manuel güncelleme kontrolü
ipcMain.handle('check-for-updates', () => {
  checkForUpdates();
  return true;
});

// IPC - Güncellemeyi yükle
ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
  return true;
});

// IPC - Güncellemeyi kur
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
  return true;
});

// IPC - Mevcut sürümü al
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ============================================
// BACKEND SERVER
// ============================================

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
      preload: path.join(__dirname, 'electron-preload.js'),
      webSecurity: true
    },
    autoHideMenuBar: true,
    frame: true
  });

  // Backend hazır olana kadar bekle (health check)
  const checkBackend = async () => {
    try {
      const response = await fetch('http://localhost:3360/api/health');
      if (response.ok) {
        console.log('✅ Backend hazır, UI yükleniyor...');
        mainWindow.loadURL('http://localhost:3360');
      } else {
        throw new Error('Backend not ready');
      }
    } catch (error) {
      console.log('⏳ Backend bekleniyor...');
      setTimeout(checkBackend, 500);
    }
  };

  setTimeout(checkBackend, 1000);

  // DevTools (development için)
  mainWindow.webContents.openDevTools();

  // Keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Ctrl+Shift+I veya F12 - DevTools toggle
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App hazır
app.whenReady().then(() => {
  startBackend();
  createWindow();

  // Auto-updater: Başlangıçta kontrol et (5 saniye sonra)
  setTimeout(() => {
    if (!app.isPackaged) {
      log.info('⚠️ Development modunda auto-updater devre dışı');
    } else {
      checkForUpdates();
    }
  }, 5000);

  // Auto-updater: Her 1 saatte bir kontrol et
  setInterval(() => {
    if (app.isPackaged) {
      checkForUpdates();
    }
  }, 60 * 60 * 1000); // 1 saat

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

// Notification handler
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title,
      body: body,
      icon: path.join(__dirname, 'assets/images/logoicon.png')
    }).show();
    return true;
  }
  return false;
});
