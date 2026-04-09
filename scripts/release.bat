@echo off
REM 360 Editor Release Script for Windows
REM Bu script yeni bir sürüm oluşturur ve GitHub'a yükler

echo.
echo ========================================
echo 360 Editor Release Script
echo ========================================
echo.

REM Mevcut sürümü oku
for /f "tokens=2 delims=:" %%a in ('findstr /c:"\"version\"" package.json') do (
    set VERSION=%%a
)
set VERSION=%VERSION: =%
set VERSION=%VERSION:"=%
set VERSION=%VERSION:,=%

echo Mevcut versiyon: %VERSION%
echo.

REM Yeni versiyon sor
set /p NEW_VERSION="Yeni versiyon numarasi (ornek: 2.0.1): "

if "%NEW_VERSION%"=="" (
    echo Hata: Versiyon numarasi bos olamaz!
    pause
    exit /b 1
)

echo.
echo Yeni versiyon: %NEW_VERSION%
echo.

REM Release notları sor
set /p RELEASE_NOTES="Release notlari (kisa aciklama): "

if "%RELEASE_NOTES%"=="" (
    set RELEASE_NOTES=Bug fixes and improvements
)

echo.
echo ========================================
echo Adim 1: package.json guncelleniyor...
echo ========================================

REM package.json'da versiyonu güncelle
powershell -Command "(Get-Content package.json) -replace '\"version\": \".*\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content package.json"

echo OK - Versiyon guncellendi: %NEW_VERSION%
echo.

echo ========================================
echo Adim 2: Git commit olusturuluyor...
echo ========================================

git add package.json
git commit -m "chore: bump version to %NEW_VERSION%"
git tag -a "v%NEW_VERSION%" -m "Release v%NEW_VERSION%: %RELEASE_NOTES%"

echo OK - Git tag olusturuldu: v%NEW_VERSION%
echo.

echo ========================================
echo Adim 3: GitHub'a push ediliyor...
echo ========================================

git push origin main
git push origin "v%NEW_VERSION%"

echo OK - GitHub'a push edildi
echo.

echo ========================================
echo Adim 4: Build baslatiliyor...
echo ========================================

call npm run publish

echo.
echo ========================================
echo BASARILI!
echo ========================================
echo.
echo Versiyon %NEW_VERSION% GitHub'a yuklendi!
echo GitHub Releases: https://github.com/Ibaysoft-Arge/360EditorRealese/releases
echo.
echo Not: GitHub Actions build'i tamamladiktan sonra
echo kullanicilar otomatik guncelleme alacak.
echo.

pause
