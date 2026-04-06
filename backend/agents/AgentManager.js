const { v4: uuidv4 } = require('uuid');
const Agent = require('./Agent');
const QueueManager = require('../../bridge/queue-manager');

class AgentManager {
  constructor(io) {
    this.io = io;
    this.agents = new Map();
    this.pmPersonality = 'sert'; // Product Manager kişiliği
    this.queueManager = new QueueManager();

    // Queue'dan sonuçları periyodik oku
    this.startQueueListener();
  }

  createAgent(config) {
    const agentId = uuidv4();
    const agent = new Agent({
      id: agentId,
      name: config.name,
      role: config.role,
      workspace: config.workspace,
      description: config.description,
      io: this.io
    });

    this.agents.set(agentId, agent);

    // Claude PM'e bildir (queue'ya ekle)
    this.queueManager.addTask({
      type: 'agent:create',
      agentId: agentId,
      config: config
    });

    return agent.getInfo();
  }

  assignTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = 'working';
    agent.currentTask = task;

    // Claude PM'e görev ver (queue'ya ekle)
    this.queueManager.addTask({
      type: 'agent:task',
      agentId: agentId,
      agentName: agent.name,
      agentRole: agent.role,
      workspace: agent.workspace,
      task: task
    });

    this.io.emit('agent:updated', agent.getInfo());
  }

  sendPMMessage(agentId, message) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.broadcastPMMessage(agentId, message);
  }

  broadcastPMMessage(agentId, message) {
    this.io.emit('pm:message', {
      agentId,
      from: 'PM',
      message,
      timestamp: new Date().toISOString()
    });
  }

  stopAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.stop();
      this.agents.delete(agentId);
      this.io.emit('agent:stopped', { agentId });
    }
  }

  getAllAgents() {
    return Array.from(this.agents.values()).map(a => a.getInfo());
  }

  // PM kişilik mesajları
  getWelcomeMessage(role) {
    const messages = {
      frontend: "Eee frontend! Hoş geldin. Hemen işe koyul, UI'lar kendini yazmıyor. Responsive olacak, pixel-perfect olacak, anladın mı?",
      backend: "Backend! API'ların hazır olsun. Database optimize et, cache'leri ayarla. Yavaşlık istemiyorum ha!",
      tester: "Tester! Her şeyi test edeceksin, bug'sız iş istiyorum. CI/CD pipeline'ı da kontrol et.",
      security: "Security! Zafiyet aramaya başla. Penetrasyon testleri, auth kontrolleri. Patron güvenlik istiyor.",
      ui: "UI designer! Tasarımlar şık olacak. Renk paleti, tipografi, spacing - her şey yerli yerinde olsun."
    };
    return messages[role] || "Yeni agent! İşe koyul, zaman kaybetme.";
  }

  getTaskAssignmentMessage(role, task) {
    return `Dinle ${role}! Yeni görev: "${task}". Hızlı ol, patron bekliyor. Düzgün yap yoksa başın belada!`;
  }

  // Queue listener - Claude PM'den gelen sonuçları al
  startQueueListener() {
    setInterval(() => {
      const results = this.queueManager.getResults();

      if (results.length > 0) {
        results.forEach(result => {
          // PM mesajlarını dashboard'a ilet
          if (result.result.pmMessages) {
            result.result.pmMessages.forEach(msg => {
              this.io.emit('pm:message', msg);
            });
          }

          // Agent loglarını ilet
          if (result.result.logs) {
            result.result.logs.forEach(log => {
              this.io.emit('agent:log', log);
            });
          }

          // Agent durumunu güncelle
          if (result.result.agentId) {
            const agent = this.agents.get(result.result.agentId);
            if (agent) {
              agent.status = 'idle';
              agent.currentTask = null;
              this.io.emit('agent:updated', agent.getInfo());
            }
          }
        });

        // Okunan sonuçları temizle
        this.queueManager.clearResults();
      }

      // PM mesajlarını kontrol et
      const messages = this.queueManager.getMessages();
      if (messages.length > 0) {
        messages.forEach(msg => {
          this.io.emit('pm:message', msg);
        });
        this.queueManager.clearMessages();
      }
    }, 1000); // Her 1 saniyede kontrol et
  }
}

module.exports = AgentManager;
