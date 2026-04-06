const { v4: uuidv4 } = require('uuid');

class WorkspaceManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.workspaces = new Map();

    // DB'den yükle
    this.loadFromDB();
  }

  loadFromDB() {
    const workspaces = this.db.getAllWorkspaces();
    workspaces.forEach(ws => {
      this.workspaces.set(ws.id, ws);
    });
    console.log(`📁 ${workspaces.length} workspace yüklendi`);
  }

  createWorkspace(config) {
    const workspaceId = uuidv4();
    const workspace = {
      id: workspaceId,
      name: config.name,
      path: config.path,
      description: config.description,
      assignedAgents: [],
      createdAt: new Date().toISOString()
    };

    this.workspaces.set(workspaceId, workspace);

    // DB'ye kaydet
    this.db.saveWorkspace(workspace);

    this.io.emit('workspace:created', workspace);

    return workspace;
  }

  assignAgent(workspaceId, agentId) {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace && !workspace.assignedAgents.includes(agentId)) {
      workspace.assignedAgents.push(agentId);
      this.io.emit('workspace:updated', workspace);
    }
  }

  removeAgent(workspaceId, agentId) {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.assignedAgents = workspace.assignedAgents.filter(id => id !== agentId);
      this.io.emit('workspace:updated', workspace);
    }
  }

  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  getAllWorkspaces() {
    return Array.from(this.workspaces.values());
  }

  deleteWorkspace(workspaceId) {
    this.workspaces.delete(workspaceId);

    // DB'den sil
    this.db.deleteWorkspace(workspaceId);

    this.io.emit('workspace:deleted', { workspaceId });
  }
}

module.exports = WorkspaceManager;
