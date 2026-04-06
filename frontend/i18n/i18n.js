// i18n (internationalization) sistemi
let currentLanguage = localStorage.getItem('360editor-language') || 'tr';
let translations = {};

// Dil dosyalarını yükle
function loadTranslations() {
  if (currentLanguage === 'tr' && typeof tr !== 'undefined') {
    translations = tr;
  } else if (currentLanguage === 'en' && typeof en !== 'undefined') {
    translations = en;
  } else {
    // Fallback to Turkish
    translations = tr;
  }
}

// Çeviri fonksiyonu
function t(key, fallback = key) {
  return translations[key] || fallback;
}

// Dil değiştir
function changeLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('360editor-language', lang);
  loadTranslations();

  // Tüm selector'ları senkronize et
  if (document.getElementById('languageSelect')) {
    document.getElementById('languageSelect').value = lang;
  }
  if (document.getElementById('topLanguageSelect')) {
    document.getElementById('topLanguageSelect').value = lang;
  }

  // Tüm UI'ı güncelle
  setTimeout(() => {
    if (typeof renderAll === 'function') {
      renderAll();
    }

    // Dashboard'ı güncelle
    if (typeof initDashboard === 'function') {
      initDashboard();
    }
  }, 100);

  console.log('🌍 Dil değiştirildi:', lang);
}

// Şu anki dili al
function getCurrentLanguage() {
  return currentLanguage;
}

// Sayfa yüklendiğinde çevirileri yükle
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    loadTranslations();
  });

  // Global olarak erişilebilir yap
  window.t = t;
  window.changeLanguage = changeLanguage;
  window.getCurrentLanguage = getCurrentLanguage;
}

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { t, changeLanguage, getCurrentLanguage };
}
