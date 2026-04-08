const TelegramBot = require('node-telegram-bot-api');

class TelegramManager {
  constructor(io) {
    this.io = io;
    this.bot = null;
    this.chatId = null;
    this.isConfigured = false;
  }

  configure(botToken, chatId) {
    try {
      // Eski bot varsa durdur
      if (this.bot) {
        this.bot.stopPolling();
      }

      // Yeni bot oluştur
      this.bot = new TelegramBot(botToken, { polling: true });
      this.chatId = chatId;
      this.isConfigured = true;

      console.log('📱 Telegram Bot yapılandırıldı');

      // Mesaj dinleyicisi
      this.bot.on('message', (msg) => {
        // Sadece belirtilen chat ID'den gelen mesajları işle
        if (msg.chat.id.toString() === this.chatId.toString()) {
          console.log('📨 Telegram mesajı:', msg.text);

          // Frontend'e mesajı ilet (PM'e cevap olabilir)
          this.io.emit('pm:chat-message', {
            message: msg.text,
            from: 'telegram'
          });
        }
      });

      this.bot.on('polling_error', (error) => {
        console.error('❌ Telegram polling error:', error.message);
      });

      return true;
    } catch (error) {
      console.error('❌ Telegram yapılandırma hatası:', error.message);
      this.isConfigured = false;
      return false;
    }
  }

  async sendMessage(message) {
    if (!this.isConfigured || !this.bot || !this.chatId) {
      console.warn('⚠️ Telegram yapılandırılmamış, mesaj gönderilemiyor');
      return false;
    }

    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      console.log('✅ Telegram mesajı gönderildi');
      return true;
    } catch (error) {
      console.error('❌ Telegram mesaj gönderme hatası:', error.message);
      return false;
    }
  }

  async testConnection(botToken, chatId) {
    try {
      const testBot = new TelegramBot(botToken, { polling: false });
      await testBot.sendMessage(chatId, '🎉 <b>360 Editor Telegram Bağlantısı Test Edildi!</b>\n\n✅ Artık görev bildirimleri alacaksın!', { parse_mode: 'HTML' });
      return { success: true };
    } catch (error) {
      console.error('❌ Telegram test hatası:', error.message);
      return { success: false, message: error.message };
    }
  }

  // Görev bildirimleri
  async notifyTaskStarted(taskTitle, workspaceName) {
    const message = `
🚀 <b>Görev Başladı</b>

📋 <b>Görev:</b> ${taskTitle}
📁 <b>Workspace:</b> ${workspaceName}
⏰ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim();

    return await this.sendMessage(message);
  }

  async notifyTaskCompleted(taskTitle, workspaceName, duration, report = null) {
    const durationText = duration ? `⏱️ <b>Süre:</b> ${Math.floor(duration / 1000)}s\n` : '';
    const reportText = report ? `\n\n📄 <b>DETAYLI RAPOR:</b>${report}` : '';

    const message = `
✅ <b>Görev Tamamlandı!</b>

📋 <b>Görev:</b> ${taskTitle}
📁 <b>Workspace:</b> ${workspaceName}
${durationText}⏰ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}${reportText}
    `.trim();

    return await this.sendMessage(message);
  }

  async notifyTaskFailed(taskTitle, workspaceName, error) {
    const message = `
❌ <b>Görev Başarısız!</b>

📋 <b>Görev:</b> ${taskTitle}
📁 <b>Workspace:</b> ${workspaceName}
⚠️ <b>Hata:</b> ${error}
⏰ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim();

    return await this.sendMessage(message);
  }

  async notifyPMQuestion(question, workspaceName) {
    const message = `
❓ <b>PM'den Soru!</b>

📁 <b>Workspace:</b> ${workspaceName}
💬 <b>Soru:</b> ${question}

<i>Telegram'dan cevap verebilirsin!</i>
    `.trim();

    return await this.sendMessage(message);
  }

  async notifyAgentAssigned(agentName, taskTitle) {
    const message = `
👤 <b>Agent Atandı</b>

👨‍💻 <b>Agent:</b> ${agentName}
📋 <b>Görev:</b> ${taskTitle}
    `.trim();

    return await this.sendMessage(message);
  }
}

module.exports = TelegramManager;
