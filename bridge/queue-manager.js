const fs = require('fs');
const path = require('path');

const QUEUE_DIR = path.join(__dirname, 'queue');
const TASKS_FILE = path.join(QUEUE_DIR, 'tasks.json');
const RESULTS_FILE = path.join(QUEUE_DIR, 'results.json');
const MESSAGES_FILE = path.join(QUEUE_DIR, 'messages.json');

class QueueManager {
  constructor() {
    this.ensureQueueDir();
  }

  ensureQueueDir() {
    if (!fs.existsSync(QUEUE_DIR)) {
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
    }
    if (!fs.existsSync(TASKS_FILE)) {
      fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(RESULTS_FILE)) {
      fs.writeFileSync(RESULTS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(MESSAGES_FILE)) {
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2));
    }
  }

  // Backend'den görev ekle
  addTask(task) {
    const tasks = this.getTasks();
    const taskWithId = {
      ...task,
      id: Date.now().toString(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    tasks.push(taskWithId);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    return taskWithId;
  }

  // Claude PM görevleri okur
  getTasks() {
    try {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    } catch {
      return [];
    }
  }

  // Claude PM görev tamamlar
  completeTask(taskId, result) {
    // Task'ı tasks.json'dan kaldır
    let tasks = this.getTasks();
    tasks = tasks.filter(t => t.id !== taskId);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));

    // Sonucu results.json'a ekle
    const results = this.getResults();
    results.push({
      taskId,
      result,
      completedAt: new Date().toISOString()
    });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  }

  // Backend sonuçları okur ve temizler
  getResults() {
    try {
      return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    } catch {
      return [];
    }
  }

  clearResults() {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify([], null, 2));
  }

  // PM mesajları
  addMessage(message) {
    const messages = this.getMessages();
    messages.push({
      ...message,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  }

  getMessages() {
    try {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    } catch {
      return [];
    }
  }

  clearMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2));
  }
}

module.exports = QueueManager;
