const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const WorkspaceManager = require('./managers/WorkspaceManager');
const AgentPoolManager = require('./managers/AgentPoolManager');
const PMManager = require('./managers/PMManager');
const TaskManager = require('./managers/TaskManager');
const AgentMemoryManager = require('./managers/AgentMemoryManager');
const TelegramManager = require('./managers/TelegramManager');
const GitDiffHelper = require('./utils/GitDiffHelper');
const StorageDB = require('./storage/Database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Database
const db = new StorageDB();

// Managers
const workspaceManager = new WorkspaceManager(io, db);
const agentPoolManager = new AgentPoolManager(io, db);
const taskManager = new TaskManager(io, db);
const memoryManager = new AgentMemoryManager();
const gitDiffHelper = new GitDiffHelper();
const telegramManager = new TelegramManager(io);
const pmManager = new PMManager(io, workspaceManager, agentPoolManager, taskManager, telegramManager);

// Socket.IO bağlantıları
io.on('connection', (socket) => {
  console.log('🔌 Dashboard bağlandı:', socket.id);

  // İlk bağlantıda mevcut state'i gönder
  socket.emit('initial:state', {
    workspaces: workspaceManager.getAllWorkspaces(),
    agents: agentPoolManager.getAllAgents(),
    tasks: taskManager.getAllTasks()
  });

  // Claude Code auth durumunu hemen gönder
  setTimeout(() => {
    pmManager.checkClaudeAuth();
  }, 500);

  // WORKSPACE OLAYLARI
  socket.on('workspace:create', (data) => {
    const workspace = workspaceManager.createWorkspace(data);
    console.log('📁 Workspace oluşturuldu:', workspace.name);
  });

  socket.on('workspace:delete', (workspaceId) => {
    workspaceManager.deleteWorkspace(workspaceId);
  });

  // AGENT OLAYLARI
  socket.on('agent:create', (data) => {
    const agent = agentPoolManager.createAgent(data);
    console.log('👤 Agent oluşturuldu:', agent.name, '-', agent.role);
  });

  socket.on('agent:delete', (agentId) => {
    agentPoolManager.deleteAgent(agentId);
  });

  // PM'E GÖREV VER (TEK NOKTA!)
  socket.on('pm:assign-task', async (data) => {
    console.log('🎯 PM\'e görev geldi:', data.task);
    const taskId = await pmManager.assignTaskToPM(data);
    if (taskId) {
      socket.emit('pm:task-queued', { taskId });
    }
  });

  // Claude Code auth yenile
  socket.on('claude:refresh-auth', async () => {
    await pmManager.checkClaudeAuth();
  });

  // Claude Model ayarla
  socket.on('claude:set-model', (data) => {
    const { model } = data;
    if (pmManager.claudeHandler.setModel(model)) {
      console.log(`✅ Claude model ayarlandı: ${model}`);
    } else {
      console.warn(`❌ Geçersiz model: ${model}`);
    }
  });

  // Task Durdur
  socket.on('task:stop', (data) => {
    const { taskId } = data;
    const task = taskManager.stopTask(taskId);

    if (task) {
      console.log('⏸️ Görev durduruldu:', taskId);

      // Görevdeki tüm agent'ları serbest bırak
      const agents = agentPoolManager.getAllAgents();
      agents.forEach(agent => {
        if (agent.status === 'working' && agent.currentWorkspace === task.workspaceId) {
          agentPoolManager.freeAgent(agent.id);
        }
      });

      socket.emit('task:stopped', { taskId });
    }
  });

  // Task Sil
  socket.on('task:delete', (data) => {
    const { taskId } = data;
    taskManager.deleteTask(taskId);
    console.log('🗑️ Görev silindi:', taskId);
  });

  // Task Rollback (Git restore)
  socket.on('task:rollback', async (data) => {
    const { taskId } = data;
    const task = taskManager.getTask(taskId);

    if (task) {
      const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === task.workspaceId);

      if (workspace) {
        try {
          // Git ile değişiklikleri geri al
          const { spawn } = require('child_process');
          const git = spawn('git', ['restore', '.'], {
            cwd: workspace.path,
            shell: true
          });

          git.on('close', (code) => {
            if (code === 0) {
              console.log('↩️ Rollback başarılı:', taskId);
              socket.emit('task:rollback-success', { taskId });
            } else {
              socket.emit('task:rollback-error', { taskId, message: 'Git restore başarısız' });
            }
          });
        } catch (error) {
          socket.emit('task:rollback-error', { taskId, message: error.message });
        }
      }
    }
  });

  // PM Chat - Kullanıcıdan cevap
  socket.on('pm:chat-message', async (data) => {
    console.log('💬 PM Chat mesajı geldi:', data.message);

    // Bekleyen görev var mı kontrol et
    const waitingTasks = Array.from(pmManager.activeTasks.entries())
      .filter(([id, task]) => task.waitingForAnswer);

    if (waitingTasks.length > 0) {
      const [taskId, taskData] = waitingTasks[0];

      // PM'e cevabı gönder ve görevi yeniden başlat
      io.emit('pm:chat-response', {
        message: 'Cevabını aldım, göreve devam ediyorum!'
      });

      console.log('✅ Patron cevabı: ', data.message);

      // Görevi cevapla birlikte yeniden işle
      taskData.taskRequest.additionalInfo = data.message;
      taskData.waitingForAnswer = false;

      // Aktif görevden kaldır
      pmManager.activeTasks.delete(taskId);

      // Yeni taskId ile devam et
      await pmManager.assignTaskToPM(taskData.taskRequest);
    } else {
      // Serbest sohbet - PM'den cevap al
      const response = await pmManager.chatWithPM(data.message, taskManager.getAllTasks(), agentPoolManager.getAllAgents());
      io.emit('pm:chat-response', {
        message: response
      });
    }
  });

  // AGENT HAFIZA OLAYLARI
  socket.on('agent:get-memory', (data) => {
    const { workspaceId, agentId } = data;
    const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === workspaceId);
    const agent = agentPoolManager.getAgent(agentId);

    if (workspace && agent) {
      const memoryData = memoryManager.getCombinedAgentMemory(workspace.path, agent.id, agent.name);
      const workspaceContext = memoryManager.getWorkspaceContext(workspace.path);

      socket.emit('agent:memory-loaded', {
        agentId,
        globalMemory: memoryData.global,
        projectMemory: memoryData.project,
        workspaceContext
      });
    }
  });

  socket.on('agent:get-global-memory', (data) => {
    const { agentId } = data;
    const agent = agentPoolManager.getAgent(agentId);

    if (agent) {
      const globalMemory = memoryManager.getGlobalAgentMemory(agent.id, agent.name);

      socket.emit('agent:global-memory-loaded', {
        agentId,
        globalMemory
      });
    }
  });

  socket.on('agent:add-global-memory', (data) => {
    const { agentId, note } = data;
    const agent = agentPoolManager.getAgent(agentId);

    if (agent) {
      const success = memoryManager.addToGlobalAgentMemory(agent.id, agent.name, note);

      if (success) {
        socket.emit('agent:global-memory-added', {
          agentId,
          message: '✅ Genel hafızaya eklendi!'
        });
        console.log(`🌍 ${agent.name} genel hafızasına not eklendi`);
      }
    }
  });

  socket.on('agent:update-global-memory', (data) => {
    const { agentId, content } = data;
    const agent = agentPoolManager.getAgent(agentId);

    if (agent) {
      const success = memoryManager.updateGlobalAgentMemory(agent.id, agent.name, content);

      if (success) {
        socket.emit('agent:global-memory-updated', {
          agentId,
          message: '✅ Genel hafıza güncellendi!'
        });
        console.log(`🌍 ${agent.name} genel hafızası güncellendi`);
      }
    }
  });

  socket.on('agent:add-memory', (data) => {
    const { workspaceId, agentId, note } = data;
    const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === workspaceId);
    const agent = agentPoolManager.getAgent(agentId);

    if (workspace && agent) {
      const success = memoryManager.addToAgentMemory(workspace.path, agent.id, agent.name, note);

      if (success) {
        socket.emit('agent:memory-added', {
          agentId,
          message: '✅ Hafızaya eklendi!'
        });
        console.log(`🧠 ${agent.name} hafızasına not eklendi`);
      }
    }
  });

  socket.on('agent:update-memory', (data) => {
    const { workspaceId, agentId, content } = data;
    const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === workspaceId);
    const agent = agentPoolManager.getAgent(agentId);

    if (workspace && agent) {
      const success = memoryManager.updateAgentMemory(workspace.path, agent.id, agent.name, content);

      if (success) {
        socket.emit('agent:memory-updated', {
          agentId,
          message: '✅ Hafıza güncellendi!'
        });
        console.log(`🧠 ${agent.name} hafızası güncellendi`);
      }
    }
  });

  socket.on('workspace:update-context', (data) => {
    const { workspaceId, content } = data;
    const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === workspaceId);

    if (workspace) {
      const success = memoryManager.updateWorkspaceContext(workspace.path, content);

      if (success) {
        socket.emit('workspace:context-updated', {
          workspaceId,
          message: '✅ Workspace context güncellendi!'
        });
        console.log(`📋 ${workspace.name} context güncellendi`);
      }
    }
  });

  // GIT DIFF OLAYLARI
  socket.on('task:get-diff', async (data) => {
    const { taskId } = data;
    const task = taskManager.getTask(taskId);

    if (task) {
      const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === task.workspaceId);

      if (workspace) {
        try {
          const diff = await gitDiffHelper.getWorkspaceDiff(workspace.path);
          const changedFiles = await gitDiffHelper.getChangedFiles(workspace.path);

          socket.emit('task:diff-loaded', {
            taskId,
            diff,
            changedFiles
          });

          console.log(`📊 ${workspace.name} diff loaded: ${diff.totalFiles} files`);
        } catch (error) {
          socket.emit('task:diff-error', {
            taskId,
            message: error.message
          });
        }
      }
    }
  });

  socket.on('task:get-file-diff', async (data) => {
    const { taskId, filePath } = data;
    const task = taskManager.getTask(taskId);

    if (task) {
      const workspace = workspaceManager.getAllWorkspaces().find(w => w.id === task.workspaceId);

      if (workspace) {
        try {
          const fileDiff = await gitDiffHelper.getFileDiff(workspace.path, filePath);

          socket.emit('task:file-diff-loaded', {
            taskId,
            filePath,
            diff: fileDiff
          });
        } catch (error) {
          socket.emit('task:diff-error', {
            taskId,
            message: error.message
          });
        }
      }
    }
  });

  // TELEGRAM OLAYLARI
  socket.on('telegram:config', (data) => {
    const { botToken, chatId } = data;
    const success = telegramManager.configure(botToken, chatId);

    if (success) {
      socket.emit('telegram:configured');
      console.log('✅ Telegram yapılandırıldı:', chatId);
    } else {
      socket.emit('telegram:test-error', {
        message: 'Telegram bot yapılandırılamadı'
      });
    }
  });

  socket.on('telegram:test', async (data) => {
    const { botToken, chatId } = data;
    const result = await telegramManager.testConnection(botToken, chatId);

    if (result.success) {
      socket.emit('telegram:test-success');
    } else {
      socket.emit('telegram:test-error', {
        message: result.message
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard bağlantısı kesildi:', socket.id);
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    workspaces: workspaceManager.getAllWorkspaces().length,
    agents: agentPoolManager.getAllAgents().length
  });
});

app.get('/api/workspaces', (req, res) => {
  res.json(workspaceManager.getAllWorkspaces());
});

app.get('/api/agents', (req, res) => {
  res.json(agentPoolManager.getAllAgents());
});

app.get('/api/tasks', (req, res) => {
  res.json(taskManager.getAllTasks());
});

const PORT = process.env.PORT || 3360;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🏢 360 EDITOR v2.0                 ║
║   Product Manager: Claude PM         ║
║   Dashboard: http://localhost:${PORT}  ║
║                                        ║
║   ✅ Workspace Yönetimi              ║
║   ✅ Agent Pool                      ║
║   ✅ PM Merkezi Görev Sistemi        ║
╚════════════════════════════════════════╝
  `);
});
