// Tema yönetimi
let currentTheme = localStorage.getItem('360editor-theme') || 'dark';

// HEMEN tema uygula (sayfa yüklenmeden ÖNCE)
document.documentElement.setAttribute('data-theme', currentTheme);
console.log('🎨 İlk tema yüklendi:', currentTheme);

// Tema yükle
function loadTheme() {
  const savedTheme = localStorage.getItem('360editor-theme') || 'dark';
  currentTheme = savedTheme;
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Tüm selector'ları senkronize et
  if (document.getElementById('themeSelect')) {
    document.getElementById('themeSelect').value = currentTheme;
  }
  if (document.getElementById('topThemeSelect')) {
    document.getElementById('topThemeSelect').value = currentTheme;
  }

  console.log('🎨 Tema yüklendi ve senkronize edildi:', currentTheme);
}

// Tema değiştir
function changeTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('360editor-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);

  // Tüm selector'ları senkronize et
  if (document.getElementById('themeSelect')) {
    document.getElementById('themeSelect').value = theme;
  }
  if (document.getElementById('topThemeSelect')) {
    document.getElementById('topThemeSelect').value = theme;
  }

  // Monaco Editor temasını da değiştir
  if (window.editor && typeof monaco !== 'undefined') {
    const monacoTheme = theme === 'light' ? 'vs' : theme === 'monokai' ? 'vs-dark' : 'vs-dark';
    monaco.editor.setTheme(monacoTheme);
  }

  // Database'e kaydet (eğer socket varsa)
  if (window.socket) {
    window.socket.emit('settings:save', { key: 'theme', value: theme });
  }

  console.log('🎨 Tema değiştirildi ve kaydedildi:', theme);
}

// Şu anki temayı al
function getCurrentTheme() {
  return currentTheme;
}

// Sayfa yüklendiğinde temayı tekrar yükle ve senkronize et
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    loadTheme();
  });

  // Global olarak erişilebilir yap
  window.changeTheme = changeTheme;
  window.getCurrentTheme = getCurrentTheme;
  window.loadTheme = loadTheme;
}

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { changeTheme, getCurrentTheme };
}
