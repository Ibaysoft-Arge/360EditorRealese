const { v4: uuidv4 } = require('uuid');

class AgentPoolManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.agents = new Map();

    // DB'den yükle
    this.loadFromDB();
  }

  loadFromDB() {
    const agents = this.db.getAllAgents();
    agents.forEach(agent => {
      this.agents.set(agent.id, agent);
    });
    console.log(`👥 ${agents.length} agent yüklendi`);
  }

  createAgent(config) {
    const agentId = uuidv4();
    const agent = {
      id: agentId,
      name: config.name,
      role: config.role,
      status: 'idle',
      currentWorkspace: null,
      currentTask: null,
      createdAt: new Date().toISOString()
    };

    this.agents.set(agentId, agent);

    // DB'ye kaydet
    this.db.saveAgent(agent);

    this.io.emit('agent:created', agent);

    return agent;
  }

  assignToWorkspace(agentId, workspaceId, task) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'working';
      agent.currentWorkspace = workspaceId;
      agent.currentTask = task;
      agent.startTime = new Date().toISOString();

      // DB'ye kaydet
      this.db.updateAgent(agentId, {
        status: 'working',
        currentWorkspace: workspaceId,
        currentTask: task,
        startTime: agent.startTime
      });

      this.io.emit('agent:updated', agent);
    }
  }

  freeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'idle';
      agent.currentWorkspace = null;
      agent.currentTask = null;
      agent.startTime = null;

      // DB'ye kaydet
      this.db.updateAgent(agentId, {
        status: 'idle',
        currentWorkspace: null,
        currentTask: null,
        startTime: null
      });

      this.io.emit('agent:updated', agent);
    }
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getIdleAgents() {
    return Array.from(this.agents.values()).filter(a => a.status === 'idle');
  }

  getAgentsByRole(role) {
    return Array.from(this.agents.values()).filter(a => a.role === role);
  }

  renameAgent(agentId, newName) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.name = newName;

      // DB'ye kaydet
      this.db.updateAgent(agentId, {
        name: newName
      });

      this.io.emit('agent:updated', agent);
    }
  }

  deleteAgent(agentId) {
    this.agents.delete(agentId);

    // DB'den sil
    this.db.deleteAgent(agentId);

    this.io.emit('agent:deleted', { agentId });
  }

  // Performance metrics güncelle
  updateAgentMetrics(agentId, taskDuration) {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Metrics başlat (yoksa)
      if (!agent.completedTasks) agent.completedTasks = 0;
      if (!agent.totalDuration) agent.totalDuration = 0;

      // Metrics güncelle
      agent.completedTasks += 1;
      agent.totalDuration += taskDuration;
      agent.lastActivity = new Date().toISOString();

      // DB'ye kaydet
      this.db.updateAgent(agentId, {
        completedTasks: agent.completedTasks,
        totalDuration: agent.totalDuration,
        lastActivity: agent.lastActivity
      });

      this.io.emit('agent:updated', agent);
    }
  }
}

module.exports = AgentPoolManager;
