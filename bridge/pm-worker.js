/**
 * Claude PM Worker
 *
 * Bu script Claude PM (Product Manager) olarak çalışır.
 * Queue'dan görevleri alır, Agent tool ile subagentlar spawn eder,
 * sonuçları tekrar queue'ya yazar.
 *
 * NOT: Bu script'in çalışması için Claude Code instance'ına erişim gerekir.
 * Şu an için manual mode'da çalışıyor - otomasyonu için Claude API key gerekir.
 */

const QueueManager = require('./queue-manager');
const queueManager = new QueueManager();

console.log('🎯 Claude PM Worker başlatıldı...');
console.log('📋 Queue dizini:', require('path').join(__dirname, 'queue'));

// PM kişiliği mesajları
const pmMessages = {
  frontend: "Eee frontend! Hoş geldin. Hemen işe koyul, UI'lar kendini yazmıyor. Responsive olacak, pixel-perfect olacak, anladın mı?",
  backend: "Backend! API'ların hazır olsun. Database optimize et, cache'leri ayarla. Yavaşlık istemiyorum ha!",
  tester: "Tester! Her şeyi test edeceksin, bug'sız iş istiyorum. CI/CD pipeline'ı da kontrol et.",
  security: "Security! Zafiyet aramaya başla. Penetrasyon testleri, auth kontrolleri. Patron güvenlik istiyor.",
  ui: "UI designer! Tasarımlar şık olacak. Renk paleti, tipografi, spacing - her şey yerli yerinde olsun."
};

function processQueue() {
  const tasks = queueManager.getTasks();

  if (tasks.length === 0) {
    return;
  }

  console.log(`\n📬 ${tasks.length} yeni görev bulundu!`);

  tasks.forEach(task => {
    console.log(`\n🎯 Görev ID: ${task.id}`);
    console.log(`   Tip: ${task.type}`);

    if (task.type === 'agent:create') {
      const welcomeMsg = pmMessages[task.config.role] || "Yeni agent! İşe koyul.";
      console.log(`   PM: "${welcomeMsg}"`);

      // Mesajı queue'ya ekle
      queueManager.addMessage({
        agentId: task.agentId,
        from: 'PM',
        to: task.config.name,
        message: welcomeMsg
      });

      // Görevi tamamla
      queueManager.completeTask(task.id, {
        success: true,
        pmMessages: [{
          agentId: task.agentId,
          from: 'PM',
          message: welcomeMsg
        }]
      });
    }

    if (task.type === 'agent:task') {
      const taskMsg = `Dinle ${task.agentRole}! Yeni görev: "${task.task}". Hızlı ol, patron bekliyor. Düzgün yap yoksa başın belada!`;
      console.log(`   PM: "${taskMsg}"`);

      // BURADA GERÇEK AGENT TOOL ÇAĞRILACAK
      console.log(`   ⚠️  [Manuel Mod] Claude PM bu görevi Agent tool ile işleyecek...`);

      // Mesajı queue'ya ekle
      queueManager.addMessage({
        agentId: task.agentId,
        from: 'PM',
        to: task.agentName,
        message: taskMsg
      });

      // Simülasyon: 5 saniye sonra tamamla
      setTimeout(() => {
        queueManager.completeTask(task.id, {
          success: true,
          agentId: task.agentId,
          logs: [{
            agentId: task.agentId,
            message: `✅ Görev tamamlandı: ${task.task}`,
            timestamp: new Date().toISOString()
          }],
          pmMessages: [{
            agentId: task.agentId,
            from: 'PM',
            message: `Aferin ${task.agentRole}, iyi iş çıkardın!`
          }]
        });
      }, 5000);
    }
  });
}

// Her 2 saniyede kontrol et
setInterval(processQueue, 2000);

console.log('\n✅ Worker hazır! Queue bekleniyor...\n');
