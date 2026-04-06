# Manuel PM Modu

Şu anki setup:

## Çalışan Servisler:
1. ✅ Backend Server: `http://localhost:3360`
2. ✅ PM Worker: Queue dinliyor
3. ✅ Dashboard: Bağlı

## Queue Yapısı:

**Görev Alınır**: `bridge/queue/tasks.json`
```json
[
  {
    "id": "123456789",
    "type": "agent:task",
    "agentId": "uuid",
    "agentName": "Ali",
    "agentRole": "frontend",
    "workspace": "D:/Github/360editor",
    "task": "Login sayfası yap",
    "status": "pending",
    "createdAt": "2026-04-06T..."
  }
]
```

**Sonuç Yazılır**: `bridge/queue/results.json`
```json
[
  {
    "taskId": "123456789",
    "result": {
      "success": true,
      "agentId": "uuid",
      "logs": [
        {
          "agentId": "uuid",
          "message": "Login component oluşturuldu",
          "timestamp": "..."
        }
      ],
      "pmMessages": [
        {
          "agentId": "uuid",
          "from": "PM",
          "message": "Aferin frontend, güzel iş!"
        }
      ]
    },
    "completedAt": "..."
  }
]
```

## Manuel Mod Kullanımı:

Bu conversation'da ben (Claude PM) queue'yu izleyip Agent tool kullanacağım:

1. Dashboard'dan görev at
2. Ben `tasks.json` dosyasını okuyacağım
3. Agent tool ile subagent spawn edeceğim
4. Sonuçları `results.json`'a yazacağım
5. Backend sonuçları alıp dashboard'a gönderecek

## Test Akışı:

```
Patron (Dashboard) → "Ali'ye görev ver: Login sayfası yap"
         ↓
Backend → tasks.json'a yaz
         ↓
BEN (Claude PM) → tasks.json oku
         ↓
BEN → Agent tool kullan (Frontend subagent spawn)
         ↓
BEN → "Dinle frontend! Login sayfası yap. Hızlı ol!"
         ↓
Subagent → İşi yapar
         ↓
BEN → results.json'a yaz
         ↓
Backend → results.json okur
         ↓
Dashboard → PM mesajlarını ve logları gösterir
```

Ready to rock! 🚀
