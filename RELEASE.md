# 🚀 360 Editor - Release Rehberi

Bu dokümanda yeni sürüm çıkarma (release) sürecini bulabilirsiniz.

## 📋 Ön Hazırlık

### 1. GitHub Token Ayarla

Release yapmak için GitHub Personal Access Token gereklidir:

1. GitHub hesabınıza girin
2. Settings > Developer settings > Personal access tokens > Tokens (classic)
3. "Generate new token (classic)" tıklayın
4. Scope olarak **repo** (tüm repo yetkileri) seçin
5. Token'ı kopyalayın

### 2. Token'ı Environment Variable Olarak Ekle

**Windows:**
```cmd
setx GH_TOKEN "github_pat_YOUR_TOKEN_HERE"
```

Veya System Properties > Environment Variables'dan `GH_TOKEN` adında yeni bir variable oluşturun.

**Önemli:** Token'ı asla git'e commit etmeyin!

## 🔄 Release Süreci

### Otomatik Release (Önerilen)

1. `scripts/release.bat` dosyasını çalıştırın:
   ```cmd
   cd D:\Github\360editor
   scripts\release.bat
   ```

2. Yeni versiyon numarasını girin (örn: `2.0.1`)

3. Release notlarını girin (kısa açıklama)

4. Script otomatik olarak:
   - ✅ package.json'da versiyonu günceller
   - ✅ Git commit ve tag oluşturur
   - ✅ GitHub'a push eder
   - ✅ Build yapar ve GitHub Releases'a yükler

### Manuel Release

```cmd
# 1. Versiyonu güncelle (package.json)
# "version": "2.0.1" olarak düzenle

# 2. Git commit ve tag
git add package.json
git commit -m "chore: bump version to 2.0.1"
git tag -a "v2.0.1" -m "Release v2.0.1: Bug fixes"

# 3. GitHub'a push
git push origin main
git push origin v2.0.1

# 4. Build ve publish
npm run publish
```

## 📦 Build Çıktıları

Build tamamlandığında `dist/` klasöründe şunlar oluşur:

- `360 Editor Setup 2.0.1.exe` - NSIS installer (Windows)
- `latest.yml` - Auto-update metadata
- `*.blockmap` - Delta update dosyaları

## 🔔 Auto-Update Nasıl Çalışır?

1. **Kullanıcı uygulamayı açar**
   - Uygulama başlangıçta GitHub Releases'ı kontrol eder
   - Yeni sürüm varsa bildirim gösterir

2. **Periyodik kontrol**
   - Her 1 saatte bir otomatik kontrol
   - Arkaplanda çalışır

3. **Manuel kontrol**
   - Settings > Hakkında > "Güncellemeleri Kontrol Et" butonu

4. **Güncelleme süreci**
   - Yeni sürüm bulundu → Dialog gösterir
   - Kullanıcı "İndir" derse → Arkaplanda indirir
   - İndirme tamamlandı → "Yeniden Başlat ve Güncelle" butonu
   - Kullanıcı kabul ederse → Otomatik kurulum

## 🎯 Versiyon Numaralandırma (Semantic Versioning)

`MAJOR.MINOR.PATCH` formatı:

- **MAJOR** (2.x.x): Breaking changes, büyük değişiklikler
- **MINOR** (x.1.x): Yeni özellikler, geriye uyumlu
- **PATCH** (x.x.1): Bug fixes, küçük düzeltmeler

Örnekler:
- `2.0.0` → `2.0.1`: Bug fix
- `2.0.1` → `2.1.0`: Yeni özellik
- `2.1.0` → `3.0.0`: Breaking change

## ⚠️ Önemli Notlar

1. **Token Güvenliği:**
   - Token'ı asla git'e commit etmeyin
   - `.env` dosyası `.gitignore`'da olmalı
   - Environment variable kullanın

2. **Test:**
   - Release yapmadan önce `npm run build:win` ile test edin
   - Oluşan installer'ı test makinede deneyin

3. **Rollback:**
   - Sorunlu release varsa GitHub'dan release'i silin
   - Önceki tag'e geri dönün:
     ```cmd
     git tag -d v2.0.1
     git push origin :refs/tags/v2.0.1
     ```

4. **Auto-update sadece production build'de çalışır:**
   - `npm run electron-dev` ile development modda çalıştırırken auto-update devre dışı

## 📚 Daha Fazla Bilgi

- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

## 🆘 Sorun Giderme

**"GH_TOKEN bulunamadı" hatası:**
- Environment variable doğru ayarlandığından emin olun
- CMD'yi yeniden açın (environment variable değişiklikleri için)

**"Build failed" hatası:**
- `node_modules` klasörünü silin ve `npm install` çalıştırın
- `dist` klasörünü temizleyin

**Auto-update çalışmıyor:**
- Uygulama production build mi? (`npm run build:win` ile build edilmeli)
- GitHub release public mi?
- `latest.yml` dosyası doğru yüklenmiş mi?
