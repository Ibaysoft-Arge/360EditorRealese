// Tema yönetimi
let currentTheme = localStorage.getItem('360editor-theme') || 'dark';

// Tema yükle
function loadTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  console.log('🎨 Tema yüklendi:', currentTheme);
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

  console.log('🎨 Tema değiştirildi:', theme);
}

// Şu anki temayı al
function getCurrentTheme() {
  return currentTheme;
}

// Sayfa yüklendiğinde temayı yükle
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    loadTheme();
  });

  // Global olarak erişilebilir yap
  window.changeTheme = changeTheme;
  window.getCurrentTheme = getCurrentTheme;
}

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { changeTheme, getCurrentTheme };
}
