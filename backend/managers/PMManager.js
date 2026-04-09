const QueueManager = require('../../bridge/queue-manager');
const ClaudeChannelsHandler = require('../claude/ClaudeChannelsHandler');

class PMManager {
  constructor(io, workspaceManager, agentPoolManager, taskManager, telegramManager = null, db = null) {
    this.io = io;
    this.workspaceManager = workspaceManager;
    this.agentPoolManager = agentPoolManager;
    this.taskManager = taskManager;
    this.telegramManager = telegramManager;
    this.db = db; // Database referansı
    this.queueManager = new QueueManager();
    this.claudeHandler = new ClaudeChannelsHandler(io); // io parametresini geç
    this.taskHistory = [];
    this.activeTasks = new Map();

    // Claude Code auth durumunu bildir
    this.checkClaudeAuth();

    // Queue listener başlat
    this.startQueueListener();
  }

  // Claude Code auth durumunu kontrol et
  async checkClaudeAuth() {
    await this.claudeHandler.checkAuth();
    this.io.emit('claude:status', {
      authenticated: this.claudeHandler.hasAuth(),
      message: this.claudeHandler.hasAuth() ? 'Claude Code ✓' : 'Terminal: claude login'
    });
  }

  // Helper: PM mesajını hem emit et hem database'e kaydet
  emitAndSavePMMessage(taskId, from, message, to = null) {
    const messageData = {
      taskId,
      from,
      message,
      to,
      timestamp: new Date().toISOString()
    };

    this.io.emit('pm:message', messageData);

    // Database'e kaydet
    if (this.db) {
      const task = this.taskManager.getTask(taskId);
      this.db.savePMConversation({
        taskId,
        taskName: task ? task.title : 'Görev',
        from,
        message,
        timestamp: messageData.timestamp
      });

      this.db.saveActivityLog({
        type: 'pm',
        message: `${from}: ${message}`,
        from,
        timestamp: messageData.timestamp,
        data: { taskId, to }
      });
    }
  }

  // Helper: Agent log hem emit et hem database'e kaydet
  emitAndSaveAgentLog(agentId, taskId, message) {
    const logData = {
      agentId,
      taskId,
      message,
      timestamp: new Date().toISOString()
    };

    this.io.emit('agent:log', logData);

    // Database'e kaydet
    if (this.db) {
      const agent = this.agentPoolManager.getAgent(agentId);
      const agentName = agent ? agent.name : 'Agent';

      this.db.saveActivityLog({
        type: 'agent',
        message,
        from: agentName,
        timestamp: logData.timestamp,
        data: { agentId, taskId }
      });
    }
  }

  // Patron'dan PM'e görev gelir
  async assignTaskToPM(taskRequest) {
    const taskId = Date.now().toString();

    // Claude Code auth kontrolü
    if (!this.claudeHandler.hasAuth()) {
      this.io.emit('pm:error', {
        message: 'Claude Code ile giriş yapılmamış!\n\nTerminal: claude login'
      });
      return null;
    }

    // Patron'a bilgi ver
    const receivedMessage = `PM: "Anladım patron! '${taskRequest.task}' görevi için ekibi topluyorum. Hemen işe koyuluyoruz!"`;
    this.io.emit('pm:task-received', {
      taskId,
      message: receivedMessage,
      timestamp: new Date().toISOString()
    });

    // Database'e kaydet
    if (this.db) {
      this.db.saveActivityLog({
        type: 'pm',
        message: receivedMessage,
        from: 'PM',
        timestamp: new Date().toISOString(),
        data: { taskId }
      });
    }

    // Gerçek Claude PM çağrısı yap
    try {
      const workspaces = this.workspaceManager.getAllWorkspaces();
      const agents = this.agentPoolManager.getAllAgents();

      this.emitAndSavePMMessage(taskId, 'PM', '🤔 Görevi analiz ediyorum, hangi agentları kullanayım...');

      // Eğer kullanıcıdan ek bilgi geldiyse, task'a ekle
      if (taskRequest.additionalInfo) {
        taskRequest.task += `\n\nPatron'un cevabı: ${taskRequest.additionalInfo}`;
      }

      // PM kişiliğini al (frontend'den gelecek, yoksa sert olsun)
      const personality = taskRequest.personality || 'sert';

      const pmPlan = await this.claudeHandler.processPMTask(
        taskRequest,
        workspaces,
        agents,
        personality,
        taskId
      );

      // Task oluştur
      const task = this.taskManager.createTask({
        id: taskId,
        title: taskRequest.task,
        description: pmPlan.summary,
        workspaceId: taskRequest.workspaceId,
        assignedAgents: pmPlan.selectedAgents.map(a => ({
          id: a.agentId,
          name: a.agentName,
          subTask: a.subTask
        }))
      });

      // Telegram bildirimi: Görev başladı
      if (this.telegramManager && this.telegramManager.isConfigured) {
        const workspace = workspaces.find(w => w.id === taskRequest.workspaceId);
        await this.telegramManager.notifyTaskStarted(taskRequest.task, workspace?.name || 'Unknown');
      }

      // PM planını uygula
      await this.executePMPlan(taskId, pmPlan, taskRequest);

      return taskId;
    } catch (error) {
      this.io.emit('pm:error', {
        message: `PM Hatası: ${error.message}`
      });
      return null;
    }
  }

  // PM planını uygula
  async executePMPlan(taskId, pmPlan, taskRequest) {
    // PM sorusu varsa
    if (pmPlan.needsInfo && pmPlan.question) {
      this.io.emit('pm:question', {
        taskId: taskId,
        question: pmPlan.question,
        timestamp: new Date().toISOString()
      });

      this.emitAndSavePMMessage(taskId, 'PM', `🤔 Bir sorum var: ${pmPlan.question}`);

      // Telegram bildirimi: PM soru sordu
      if (this.telegramManager && this.telegramManager.isConfigured) {
        const workspace = this.workspaceManager.getAllWorkspaces()
          .find(w => w.id === taskRequest.workspaceId);
        await this.telegramManager.notifyPMQuestion(pmPlan.question, workspace?.name || 'Unknown');
      }

      // Cevap beklemeye al
      this.activeTasks.set(taskId, { taskRequest, waitingForAnswer: true });
      return;
    }

    // PM mesajlarını gönder
    pmPlan.pmMessages.forEach(msg => {
      this.emitAndSavePMMessage(taskId, 'PM', msg.message, msg.to);
    });

    // Agentları ata ve çalıştır
    const workspace = this.workspaceManager.getAllWorkspaces()
      .find(w => w.id === taskRequest.workspaceId);

    for (const agentAssignment of pmPlan.selectedAgents) {
      const agent = this.agentPoolManager.getAgent(agentAssignment.agentId);

      if (agent) {
        // Agent durumunu güncelle
        this.agentPoolManager.assignToWorkspace(
          agentAssignment.agentId,
          workspace.id,
          agentAssignment.subTask
        );

        this.emitAndSaveAgentLog(agentAssignment.agentId, taskId, `🚀 Göreve başladı: ${agentAssignment.subTask}`);

        // Telegram bildirimi: Agent atandı
        if (this.telegramManager && this.telegramManager.isConfigured) {
          await this.telegramManager.notifyAgentAssigned(agent.name, agentAssignment.subTask);
        }

        // Agent'ı asenkron çalıştır
        this.runAgentTask(agentAssignment, workspace, taskId).catch(err => {
          this.io.emit('agent:log', {
            agentId: agentAssignment.agentId,
            taskId: taskId,
            message: `❌ Hata: ${err.message}`,
            timestamp: new Date().toISOString()
          });
        });
      }
    }

    // Özet mesajı
    this.emitAndSavePMMessage(taskId, 'PM', `✅ ${pmPlan.selectedAgents.length} agent işe koyuldu. ${pmPlan.summary}`);
  }

  // Agent görevi çalıştır
  async runAgentTask(agentAssignment, workspace, taskId) {
    try {
      const agent = this.agentPoolManager.getAgent(agentAssignment.agentId);

      this.emitAndSaveAgentLog(agentAssignment.agentId, taskId, '⚙️ Agent çalışıyor...');

      // Agent PM'e başladığını bildirir
      this.emitAndSavePMMessage(taskId, agent.name, `🚀 Göreve başladım PM! ${agentAssignment.subTask.substring(0, 80)}...`, 'PM');

      // Claude API ile agent çalıştır
      const result = await this.claudeHandler.runAgent(
        agent,
        agentAssignment.subTask,
        workspace,
        taskId
      );

      this.emitAndSaveAgentLog(agentAssignment.agentId, taskId, `📝 Rapor:\n${result.substring(0, 200)}...`);

      // Agent sonucunu task'a ekle
      const task = this.taskManager.getTask(taskId);
      if (task) {
        const agentReport = `\n\n🤖 <b>${agent.name}:</b>\n${result.substring(0, 800)}`;
        const currentResult = task.result || '';
        task.result = currentResult + agentReport;
      }

      // Agent'ı serbest bırak
      this.agentPoolManager.freeAgent(agentAssignment.agentId);

      // Performance metrics güncelle (eğer task var ve duration hesaplanabiliyorsa)
      if (task && agent.startTime) {
        const startTime = new Date(agent.startTime);
        const endTime = new Date();
        const duration = Math.floor((endTime - startTime) / 1000); // saniye
        this.agentPoolManager.updateAgentMetrics(agentAssignment.agentId, duration);
      }

      // PM agent'a geri bildirim verir
      this.emitAndSavePMMessage(taskId, 'PM', `Aferin ${agent.name}! İyi iş çıkardın.`, agent.name);

      // Agent cevap verir
      this.emitAndSavePMMessage(taskId, agent.name, `✅ Görev tamamlandı PM! ${agentAssignment.subTask.substring(0, 80)}...`, 'PM');

      // Diğer çalışan agent'lara bildir
      const activeAgents = this.agentPoolManager.getAllAgents()
        .filter(a => a.status === 'working' && a.id !== agentAssignment.agentId);

      if (activeAgents.length > 0) {
        this.emitAndSavePMMessage(taskId, 'PM', `📢 ${agent.name} işini bitirdi. Sıra sizde, hızlı olun!`, 'Takım');
      } else {
        // Tüm agent'lar bitti, task'ı tamamla
        const task = this.taskManager.getTask(taskId);
        this.taskManager.updateTaskStatus(taskId, 'completed', task?.result);

        this.emitAndSavePMMessage(taskId, 'PM', `🎉 Patron, görev tamamlandı! Tüm agent'lar işini bitirdi. Kontrol et!`, 'Patron');

        // Telegram bildirimi: Görev tamamlandı
        if (this.telegramManager && this.telegramManager.isConfigured) {
          const workspace = this.workspaceManager.getAllWorkspaces()
            .find(w => w.id === task.workspaceId);

          const duration = task.startTime ? Date.now() - new Date(task.startTime).getTime() : null;
          await this.telegramManager.notifyTaskCompleted(
            task.title,
            workspace?.name || 'Unknown',
            duration,
            task?.result || 'Rapor bulunamadı'
          );
        }
      }

    } catch (error) {
      this.emitAndSaveAgentLog(agentAssignment.agentId, taskId, `❌ Görev başarısız: ${error.message}`);

      // Telegram bildirimi: Görev başarısız
      if (this.telegramManager && this.telegramManager.isConfigured) {
        const task = this.taskManager.getTask(taskId);
        const workspace = this.workspaceManager.getAllWorkspaces()
          .find(w => w.id === task.workspaceId);

        await this.telegramManager.notifyTaskFailed(task.title, workspace?.name || 'Unknown', error.message);
      }

      this.agentPoolManager.freeAgent(agentAssignment.agentId);
    }
  }

  // PM'den gelen mesajları dinle
  startQueueListener() {
    setInterval(() => {
      // PM'den gelen sonuçları al
      const results = this.queueManager.getResults();

      if (results.length > 0) {
        results.forEach(result => {
          // PM mesajlarını ilet
          if (result.result.pmMessages) {
            result.result.pmMessages.forEach(msg => {
              this.io.emit('pm:message', {
                ...msg,
                timestamp: new Date().toISOString()
              });
            });
          }

          // Agent atamaları
          if (result.result.agentAssignments) {
            result.result.agentAssignments.forEach(assignment => {
              this.agentPoolManager.assignToWorkspace(
                assignment.agentId,
                assignment.workspaceId,
                assignment.task
              );
            });
          }

          // Agent logları
          if (result.result.logs) {
            result.result.logs.forEach(log => {
              this.io.emit('agent:log', {
                ...log,
                timestamp: new Date().toISOString()
              });
            });
          }

          // Görev tamamlandı
          if (result.result.completed) {
            result.result.completed.forEach(agentId => {
              this.agentPoolManager.freeAgent(agentId);
            });
          }
        });

        this.queueManager.clearResults();
      }

      // PM mesajları
      const messages = this.queueManager.getMessages();
      if (messages.length > 0) {
        messages.forEach(msg => {
          this.io.emit('pm:message', {
            ...msg,
            timestamp: new Date().toISOString()
          });
        });
        this.queueManager.clearMessages();
      }
    }, 1000);
  }

  getTaskHistory() {
    return this.taskHistory;
  }

  // PM ile serbest sohbet (görev çalışırken "ne yaptın?" gibi sorular)
  async chatWithPM(userMessage, allTasks, allAgents) {
    try {
      // Çalışan görevler
      const activeTasks = allTasks.filter(t => t.status === 'in-progress');
      const workingAgents = allAgents.filter(a => a.status === 'working');

      // PM'e görev durumunu anlatan prompt
      const prompt = `Sen bir Product Manager'sın. Patron seninle konuşuyor.

PATRON'UN MESAJI: "${userMessage}"

AKTİF GÖREVLER (${activeTasks.length} tane):
${activeTasks.map(t => `- "${t.title}" (Durum: ${t.status}, Atanan: ${t.assignedAgents?.map(a => a.name).join(', ') || 'yok'})`).join('\n') || 'Şu an aktif görev yok.'}

ÇALIŞAN AGENTLAR (${workingAgents.length} tane):
${workingAgents.map(a => `- ${a.name} (${a.role}) - ${a.currentTask || 'çalışıyor'}`).join('\n') || 'Şu an çalışan agent yok.'}

GÖREVIN:
- Patron'un sorusuna PM olarak cevap ver
- Eğer durum sorusu ise (ne yaptın, nerede, vs) görev/agent durumunu açıkla
- Kısa, net ve profesyonel konuş
- Maksimum 2-3 cümle

CEVAP:`;

      const response = await this.claudeHandler.runClaudeCommand(prompt, process.cwd());

      // Claude'un cevabını temizle
      const cleanResponse = response.trim();

      return cleanResponse || 'Şu an bir şey yapamıyorum. Görev ver ki çalışayım!';
    } catch (error) {
      console.error('❌ PM chat hatası:', error.message);
      return 'Şu an cevap veremiyorum, bir sorun var gibi.';
    }
  }
}

module.exports = PMManager;
