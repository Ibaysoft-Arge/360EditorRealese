class TaskManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.tasks = new Map();

    // DB'den yükle
    this.loadFromDB();
  }

  loadFromDB() {
    const tasks = this.db.getAllTasks();
    tasks.forEach(task => {
      this.tasks.set(task.id, task);
    });
    console.log(`🎯 ${tasks.length} görev yüklendi`);
  }

  createTask(taskData) {
    const task = {
      id: taskData.id || Date.now().toString(),
      title: taskData.title,
      description: taskData.description || '',
      workspaceId: taskData.workspaceId,
      status: 'in-progress',
      assignedAgents: taskData.assignedAgents || [],
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      result: null, // Agent'ların raporu buraya
      createdAt: new Date().toISOString()
    };

    this.tasks.set(task.id, task);

    // DB'ye kaydet
    this.db.saveTask(task);

    this.io.emit('task:created', task);

    return task;
  }

  updateTaskStatus(taskId, status, result = null) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;

      if (status === 'completed') {
        task.endTime = new Date().toISOString();
        const start = new Date(task.startTime);
        const end = new Date(task.endTime);
        task.duration = Math.floor((end - start) / 1000); // saniye
      }

      if (result) {
        task.result = result;
      }

      // DB'ye kaydet
      this.db.updateTask(taskId, {
        status: task.status,
        endTime: task.endTime,
        duration: task.duration,
        result: task.result
      });

      this.io.emit('task:updated', task);
    }
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  getTasksByWorkspace(workspaceId) {
    return Array.from(this.tasks.values()).filter(t => t.workspaceId === workspaceId);
  }

  stopTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'in-progress') {
      task.status = 'stopped';
      task.endTime = new Date().toISOString();
      const start = new Date(task.startTime);
      const end = new Date(task.endTime);
      task.duration = Math.floor((end - start) / 1000);

      // DB'ye kaydet
      this.db.updateTask(taskId, {
        status: 'stopped',
        endTime: task.endTime,
        duration: task.duration
      });

      this.io.emit('task:updated', task);
      return task;
    }
    return null;
  }

  deleteTask(taskId) {
    this.tasks.delete(taskId);

    // DB'den sil
    this.db.deleteTask(taskId);

    this.io.emit('task:deleted', { taskId });
  }
}

module.exports = TaskManager;
