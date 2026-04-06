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
      INSERT OR REPLACE INTO tasks (id, title, description, workspaceId, status, assignedAgents, startTime, endTime, duration, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  close() {
    this.db.close();
  }
}

module.exports = StorageDB;
