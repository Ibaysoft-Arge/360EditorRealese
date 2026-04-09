const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class StorageDB {
  constructor() {
    // App data dizinini kullan
    const appData = process.env.APPDATA || process.env.HOME;
    const dbDir = path.join(appData, '360Editor');

    // Klasörü oluştur
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, '360editor.db');
    console.log('📁 Database:', dbPath);

    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    // Workspaces tablosu
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    // Agents tablosu
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        currentWorkspace TEXT,
        currentTask TEXT,
        createdAt TEXT NOT NULL,
        startTime TEXT
      )
    `);

    // Tasks tablosu
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        workspaceId TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        assignedAgents TEXT,
        startTime TEXT NOT NULL,
        endTime TEXT,
        duration INTEGER,
        createdAt TEXT NOT NULL
      )
    `);

    // Mevcut tabloya startTime kolonu ekle (eğer yoksa)
    try {
      this.db.exec(`ALTER TABLE agents ADD COLUMN startTime TEXT`);
      console.log('✅ startTime kolonu eklendi');
    } catch (e) {
      // Kolon zaten varsa hata verir, ignore et
    }

    // Performance metrics kolonları ekle
    try {
      this.db.exec(`ALTER TABLE agents ADD COLUMN completedTasks INTEGER DEFAULT 0`);
      this.db.exec(`ALTER TABLE agents ADD COLUMN totalDuration INTEGER DEFAULT 0`);
      this.db.exec(`ALTER TABLE agents ADD COLUMN lastActivity TEXT`);
      console.log('✅ Performance metrics kolonları eklendi');
    } catch (e) {
      // Kolonlar zaten varsa hata verir, ignore et
    }

    // Tasks tablosuna result kolonu ekle (görev raporu için)
    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN result TEXT`);
      console.log('✅ result kolonu eklendi');
    } catch (e) {
      // Kolon zaten varsa hata verir, ignore et
    }

    // Activity Log tablosu (kalıcı aktivite kaydı)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        from_user TEXT,
        timestamp TEXT NOT NULL,
        data TEXT
      )
    `);

    // PM Conversations tablosu (task bazında konuşmalar)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pm_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId TEXT NOT NULL,
        taskName TEXT NOT NULL,
        from_user TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);

    console.log('✅ Database tables hazır');
  }

  // WORKSPACES
  saveWorkspace(workspace) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspaces (id, name, path, description, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(workspace.id, workspace.name, workspace.path, workspace.description || '', workspace.createdAt);
  }

  getAllWorkspaces() {
    const stmt = this.db.prepare('SELECT * FROM workspaces ORDER BY createdAt DESC');
    return stmt.all();
  }

  deleteWorkspace(id) {
    const stmt = this.db.prepare('DELETE FROM workspaces WHERE id = ?');
    stmt.run(id);
  }

  // AGENTS
  saveAgent(agent) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (id, name, role, status, currentWorkspace, currentTask, createdAt, startTime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      agent.id,
      agent.name,
      agent.role,
      agent.status,
      agent.currentWorkspace,
      agent.currentTask,
      agent.createdAt,
      agent.startTime || null
    );
  }

  getAllAgents() {
    const stmt = this.db.prepare('SELECT * FROM agents ORDER BY createdAt DESC');
    return stmt.all();
  }

  updateAgent(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    const stmt = this.db.prepare(`UPDATE agents SET ${fields} WHERE id = ?`);
    stmt.run(...values, id);
  }

  deleteAgent(id) {
    const stmt = this.db.prepare('DELETE FROM agents WHERE id = ?');
    stmt.run(id);
  }

  // TASKS
  saveTask(task) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (id, title, description, workspaceId, status, assignedAgents, startTime, endTime, duration, result, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      task.id,
      task.title,
      task.description || '',
      task.workspaceId,
      task.status,
      JSON.stringify(task.assignedAgents || []),
      task.startTime,
      task.endTime || null,
      task.duration || null,
      task.result || null,
      task.createdAt
    );
  }

  getAllTasks() {
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY startTime DESC');
    const tasks = stmt.all();
    return tasks.map(task => ({
      ...task,
      assignedAgents: JSON.parse(task.assignedAgents || '[]')
    }));
  }

  getTaskById(id) {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(id);
    if (task) {
      task.assignedAgents = JSON.parse(task.assignedAgents || '[]');
    }
    return task;
  }

  updateTask(id, updates) {
    if (updates.assignedAgents) {
      updates.assignedAgents = JSON.stringify(updates.assignedAgents);
    }
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    const stmt = this.db.prepare(`UPDATE tasks SET ${fields} WHERE id = ?`);
    stmt.run(...values, id);
  }

  deleteTask(id) {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(id);
  }

  // ACTIVITY LOG
  saveActivityLog(activity) {
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (type, message, from_user, timestamp, data)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      activity.type,
      activity.message,
      activity.from || null,
      activity.timestamp,
      JSON.stringify(activity.data || {})
    );
  }

  getAllActivityLogs(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM activity_log
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const logs = stmt.all(limit);
    return logs.map(log => ({
      ...log,
      data: JSON.parse(log.data || '{}'),
      from: log.from_user
    }));
  }

  clearOldActivityLogs(keepDays = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const stmt = this.db.prepare(`
      DELETE FROM activity_log
      WHERE timestamp < ?
    `);
    stmt.run(cutoffDate.toISOString());
  }

  // PM CONVERSATIONS
  savePMConversation(conversation) {
    const stmt = this.db.prepare(`
      INSERT INTO pm_conversations (taskId, taskName, from_user, message, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      conversation.taskId,
      conversation.taskName,
      conversation.from,
      conversation.message,
      conversation.timestamp
    );
  }

  getPMConversationsByTask(taskId) {
    const stmt = this.db.prepare(`
      SELECT * FROM pm_conversations
      WHERE taskId = ?
      ORDER BY timestamp ASC
    `);
    const messages = stmt.all(taskId);
    return messages.map(msg => ({
      from: msg.from_user,
      message: msg.message,
      timestamp: msg.timestamp
    }));
  }

  getAllPMConversations() {
    const stmt = this.db.prepare(`
      SELECT * FROM pm_conversations
      ORDER BY timestamp DESC
    `);
    const conversations = stmt.all();

    // Task ID'ye göre grupla
    const grouped = {};
    conversations.forEach(conv => {
      if (!grouped[conv.taskId]) {
        grouped[conv.taskId] = {
          taskName: conv.taskName,
          messages: []
        };
      }
      grouped[conv.taskId].messages.push({
        from: conv.from_user,
        message: conv.message,
        timestamp: conv.timestamp
      });
    });

    return grouped;
  }

  deletePMConversationsByTask(taskId) {
    const stmt = this.db.prepare('DELETE FROM pm_conversations WHERE taskId = ?');
    stmt.run(taskId);
  }

  close() {
    this.db.close();
  }
}

module.exports = StorageDB;
