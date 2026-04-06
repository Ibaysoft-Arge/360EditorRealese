const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const WorkspaceManager = require('./managers/WorkspaceManager');
const AgentPoolManager = require('./managers/AgentPoolManager');
const PMManager = require('./managers/PMManager');
const TaskManager = require('./managers/TaskManager');
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

// Database
const db = new StorageDB();

// Managers
const workspaceManager = new WorkspaceManager(io, db);
const agentPoolManager = new AgentPoolManager(io, db);
const taskManager = new TaskManager(io, db);
const pmManager = new PMManager(io, workspaceManager, agentPoolManager, taskManager);

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
      // Normal sohbet
      io.emit('pm:chat-response', {
        message: 'Merhaba! Görev verdiğinde soruları burada sorarım.'
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
