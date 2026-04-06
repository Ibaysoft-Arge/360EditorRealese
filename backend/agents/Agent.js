class Agent {
  constructor({ id, name, role, workspace, description, io }) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.workspace = workspace;
    this.description = description;
    this.io = io;
    this.status = 'idle';
    this.currentTask = null;
    this.logs = [];
    this.createdAt = new Date().toISOString();
  }

  assignTask(task) {
    this.currentTask = task;
    this.status = 'working';
    this.log(`🎯 Görev alındı: ${task}`);

    // Simüle edilmiş agent çalışması
    // Gerçek implementasyonda burada Claude Agent tool kullanılacak
    this.simulateWork(task);
  }

  simulateWork(task) {
    this.log(`⚙️ İş başladı: ${task}`);

    // Gerçek agent çalışması için placeholder
    setTimeout(() => {
      this.log(`✅ Görev tamamlandı: ${task}`);
      this.status = 'idle';
      this.currentTask = null;
      this.io.emit('agent:task-completed', {
        agentId: this.id,
        task
      });
    }, 5000);
  }

  log(message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message
    };
    this.logs.push(logEntry);

    this.io.emit('agent:log', {
      agentId: this.id,
      ...logEntry
    });
  }

  stop() {
    this.status = 'stopped';
    this.log('🛑 Agent durduruldu');
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      workspace: this.workspace,
      description: this.description,
      status: this.status,
      currentTask: this.currentTask,
      createdAt: this.createdAt,
      logsCount: this.logs.length
    };
  }
}

module.exports = Agent;
