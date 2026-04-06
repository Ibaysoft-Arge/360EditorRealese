# 🏢 360 Editor v2.0 - Doğru Mimari

AI Agent yönetim platformu. **Workspace → Agent Pool → PM → Task** akışı.

## 🎯 Doğru Kullanım Akışı

### 1️⃣ WORKSPACE/PROJE OLUŞTUR
```
Sol panel → "➕ Yeni Proje"
  ├─ Proje Adı: E-ticaret Sitesi
  ├─ Proje Yolu: D:\Github\ecommerce
  └─ Açıklama: Online mağaza projesi
```

### 2️⃣ AGENT HAVUZU OLUŞTUR
```
Orta panel → "➕ Yeni Agent"
  ├─ Ahmet - Frontend Developer
  ├─ Mehmet - Backend Developer
  ├─ Ayşe - Tester
  └─ Hasan - Security Expert
```

### 3️⃣ PM'E GÖREV VER (TEK NOKTA!)
```
Sağ panel → PM'e Görev Ver
  ├─ Hangi Projede?: E-ticaret Sitesi seç
  └─ Görev: "Login sistemi yap, JWT auth kullan, 
             kullanıcı profil sayfası olsun"
```

### 4️⃣ PM KARAR VERİR VE DAĞITIR
```
PM otomatik:
  ├─ Ahmet'i E-ticaret projesine atar → Login UI
  ├─ Mehmet'i E-ticaret projesine atar → Login API
  └─ Sağ panelde canlı konuşmaları görürsün
```

### 5️⃣ CANLI İZLE
```
Dashboard:
  ├─ Workspace listesi: Hangi projede kaç agent çalışıyor
  ├─ Agent havuzu: Hangi agent nerede ne yapıyor
  └─ Activity feed: PM-Agent konuşmaları CANLI
```

## 🚀 Kurulum

```bash
npm install
npm start
```

**Dashboard**: http://localhost:3360

## 📊 Dashboard Yapısı

```
┌─────────────────────────────────────────────────────────┐
│  🏢 360 EDITOR v2.0          👔 PATRON     🟢 Bağlı    │
├─────────────┬─────────────────┬─────────────────────────┤
│             │                 │                         │
│ 📁 WORKSPACE│  👥 AGENT POOL │  🎯 PM'E GÖREV VER     │
│             │                 │                         │
│ ➕ Yeni     │  ➕ Yeni Agent  │  Hangi Projede?         │
│             │                 │  [Proje Seç ▼]          │
│ • E-ticaret │  • Ahmet        │                         │
│   3 agent   │    Frontend     │  Görev:                 │
│             │    🟢 idle      │  [________________]     │
│ • Blog      │                 │                         │
│   1 agent   │  • Mehmet       │  [🚀 PM'E GÖREV VER]   │
│             │    Backend      │                         │
│             │    🔴 working   │  📡 Canlı Aktivite      │
│             │    📍 E-ticaret │  ┌──────────────────┐  │
│             │    🎯 Login API │  │ PM: Tamam patron!│  │
│             │                 │  │ Mehmet'i işe    │  │
│             │  • Ayşe         │  │ koydum...       │  │
│             │    Tester       │  └──────────────────┘  │
│             │    🟢 idle      │                         │
│             │                 │                         │
└─────────────┴─────────────────┴─────────────────────────┘
│ Projeler: 2  │ Agentlar: 3  │ Boşta: 2  │ Çalışıyor: 1 │
└──────────────────────────────────────────────────────────┘
```

## 🔄 Akış

1. **Sen (Patron)**: PM'e tek görev verirsin
2. **PM (Ben)**: Kararı alırım, agentları seçerim
3. **PM**: Agentlara görev dağıtırım (sert konuşurum 😄)
4. **Agentlar**: İşi yaparlar
5. **Sen**: Her şeyi canlı izlersin

## 🎯 PM Kişiliği

PM sert ama etkili konuşur:
- "Eee Ahmet! İşe koyul, frontend kendini yazmıyor!"
- "Mehmet! API'lar hazır olsun, patron bekliyor!"
- "Ayşe! Test et şu sistemi, bug istemiyorum!"

## 🔧 Teknolojiler

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JS, Socket.io Client
- **AI**: Claude Code + Agent Tool
- **Queue**: JSON-based message queue

## 📝 Sonraki Adım

PM Worker'da gerçek Claude Agent Tool entegrasyonu yapılacak.
Şu an simülasyon modunda çalışıyor.

---

**Workspace → Agent → PM → Done!** 🚀
