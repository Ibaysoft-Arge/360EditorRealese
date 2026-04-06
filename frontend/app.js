// Monaco Editor Setup
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

let editor = null;
let socket = null;
let workspaces = [];
let agents = [];
let tasks = [];
let currentFile = null;
let claudeAuthenticated = false;
let selectedTaskId = null;

// Dashboard için global yap
window.workspaces = workspaces;
window.agents = agents;
window.tasks = tasks;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadSettings();
  setupEventListeners();

  // PM Chat'i global yap
  window.togglePMChat = togglePMChat;

  // Dashboard'ı başlat (dashboard.js'ten)
  if (typeof initDashboard === 'function') {
    setTimeout(initDashboard, 500);
  }
});

// Socket.IO
function initSocket() {
  socket = io('http://localhost:3360');
  window.socket = socket; // Dashboard için global yap

  socket.on('connect', () => {
    updateConnectionStatus(true);
    addActivity('system', 'Sunucuya bağlanıldı');
  });

  socket.on('disconnect', () => {
    updateConnectionStatus(false);
    addActivity('system', 'Bağlantı kesildi');
  });

  socket.on('initial:state', (state) => {
    workspaces = state.workspaces;
    agents = state.agents;
    tasks = state.tasks || [];

    // Dashboard için güncelle
    window.workspaces = workspaces;
    window.agents = agents;
    window.tasks = tasks;

    renderAll();
    initDashboard();
  });

  // API Key Status
  socket.on('claude:status', (data) => {
    claudeAuthenticated = data.authenticated;
    updateClaudeStatus(data);
  });

  socket.on('pm:api-key-set', () => {
    claudeAuthenticated = true;
    addActivity('system', '✅ Anthropic API key ayarlandı!');
  });

  socket.on('workspace:created', (ws) => {
    workspaces.push(ws);
    window.workspaces = workspaces; // Dashboard için güncelle
    renderWorkspaces();
    updateStats();
    addActivity('system', `📁 "${ws.name}" projesi eklendi`);
  });

  socket.on('workspace:deleted', ({ workspaceId }) => {
    workspaces = workspaces.filter(w => w.id !== workspaceId);
    renderWorkspaces();
    updateStats();
  });

  socket.on('agent:created', (agent) => {
    agents.push(agent);
    window.agents = agents; // Dashboard için güncelle
    renderAgents();
    updateStats();
    addActivity('system', `👤 ${agent.name} (${agent.role}) havuza eklendi`);
  });

  socket.on('agent:updated', (agent) => {
    const index = agents.findIndex(a => a.id === agent.id);
    if (index !== -1) {
      agents[index] = agent;
      window.agents = agents; // Dashboard için güncelle

      renderAgents();
      updateStats();

      // Dashboard'ı da güncelle
      if (typeof renderAgentStatus === 'function') {
        renderAgentStatus();
      }
    }
  });

  socket.on('agent:deleted', ({ agentId }) => {
    agents = agents.filter(a => a.id !== agentId);
    renderAgents();
    updateStats();
  });

  socket.on('task:created', (task) => {
    tasks.push(task);
    window.tasks = tasks;
    renderTasks();
    addActivity('system', `🎯 Yeni görev: "${task.title}"`);
  });

  socket.on('task:updated', (task) => {
    const index = tasks.findIndex(t => t.id === task.id);
    if (index !== -1) {
      tasks[index] = task;
      window.tasks = tasks;
      renderTasks();

      if (task.status === 'completed') {
        addActivity('system', `✅ Görev tamamlandı: "${task.title}"`);
      }
    }
  });

  socket.on('task:deleted', ({ taskId }) => {
    tasks = tasks.filter(t => t.id !== taskId);
    window.tasks = tasks;
    renderTasks();
  });

  socket.on('pm:task-received', (data) => {
    addActivity('pm', data.message);
  });

  socket.on('pm:message', (data) => {
    addActivity('pm', data.message, data.from);
  });

  socket.on('agent:log', (data) => {
    addActivity('agent', data.message);
  });

  socket.on('pm:error', (data) => {
    addActivity('system', `❌ ${data.message}`);
    alert(data.message);
  });
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('workspaceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('wsName').value,
      path: document.getElementById('wsPath').value,
      description: ''
    };
    socket.emit('workspace:create', data);
    e.target.reset();
    hideWorkspaceForm();
  });

  document.getElementById('agentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('agentName').value,
      role: document.getElementById('agentRole').value
    };
    socket.emit('agent:create', data);
    e.target.reset();
    hideAgentForm();
  });

  document.getElementById('pmTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();

    if (!claudeAuthenticated) {
      alert('Claude Code ile giriş yapılmamış!\n\nTerminalde: claude login');
      return;
    }

    const workspaceId = document.getElementById('pmWorkspace').value;
    const task = document.getElementById('pmTask').value;

    if (!workspaceId) {
      alert('Lütfen bir proje seç!');
      return;
    }

    const workspace = workspaces.find(w => w.id === workspaceId);
    socket.emit('pm:assign-task', {
      workspaceName: workspace.name,
      workspaceId: workspaceId,
      task: task
    });

    addActivity('system', `🎯 PM'e görev: "${task}"`);
    document.getElementById('pmTask').value = '';
  });
}

// Claude Status
function updateClaudeStatus(data) {
  const statusEl = document.getElementById('claudeStatus');
  if (!statusEl) return;

  const statusDot = statusEl.querySelector('.status-dot');
  const statusText = statusEl.querySelector('.status-text');

  // Settings modal içindeki durumu da güncelle
  const loginStatus = document.getElementById('claudeLoginStatus');
  if (loginStatus) {
    loginStatus.textContent = data.authenticated ? '✅ Giriş yapılmış' : '❌ Giriş gerekli';
    loginStatus.style.color = data.authenticated ? '#4caf50' : '#f44336';
  }

  if (data.authenticated) {
    statusDot.className = 'status-dot authenticated';
    statusText.textContent = 'Claude Code ✓';
  } else {
    statusDot.className = 'status-dot not-authenticated';
    statusText.textContent = 'claude login';
  }
}

// Monaco Editor
function initMonacoEditor() {
  require(['vs/editor/editor.main'], function () {
    const container = document.getElementById('editorContainer');

    editor = monaco.editor.create(container, {
      value: '// 360 Editor - AI Agent IDE\n// Powered by Claude Code\n\n// PM\'e görev ver, agentlar senin için kod yazsın!\n',
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
    });

    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('editorContainer').classList.remove('hidden');
  });
}

function openFileInEditor(filename, content, language = 'javascript') {
  if (!editor) {
    initMonacoEditor();
    setTimeout(() => openFileInEditor(filename, content, language), 100);
    return;
  }

  currentFile = filename;
  editor.setValue(content);
  monaco.editor.setModelLanguage(editor.getModel(), language);

  const tabs = document.getElementById('fileTabs');
  tabs.innerHTML = `
    <div class="tab active">
      <span>${filename}</span>
    </div>
  `;
}

// UI Rendering
function renderAll() {
  renderWorkspaces();
  renderAgents();
  renderTasks();
  updateStats();
  updateWorkspaceSelect();
}

function renderWorkspaces() {
  const container = document.getElementById('workspaceList');

  if (workspaces.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Henüz proje yok</div>';
    return;
  }

  const allTasks = window.tasks || tasks || [];

  container.innerHTML = workspaces.map(ws => {
    const workspaceTasks = allTasks.filter(t => t.workspaceId === ws.id);

    return `
      <div class="workspace-item-wrapper">
        <div class="workspace-item" onclick="openWorkspace('${ws.id}')">
          <div class="name">${ws.name} ${workspaceTasks.length > 0 ? `<span style="font-size: 0.75rem; opacity: 0.7;">(${workspaceTasks.length})</span>` : ''}</div>
          <div class="path">${ws.path}</div>
        </div>
        ${workspaceTasks.length > 0 ? `
          <div class="workspace-tasks">
            ${workspaceTasks.map(task => {
              const statusIcon = task.status === 'completed' ? '✅' : task.status === 'in-progress' ? '🔄' : '⏸️';
              return `
                <div class="workspace-task-item ${selectedTaskId === task.id ? 'selected' : ''}" onclick="event.stopPropagation(); selectTask('${task.id}')">
                  ${statusIcon} ${task.title.substring(0, 40)}${task.title.length > 40 ? '...' : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  updateWorkspaceSelect();
}

function renderAgents() {
  const container = document.getElementById('agentList');

  if (agents.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Henüz agent yok</div>';
    return;
  }

  container.innerHTML = agents.map(agent => {
    const workspace = workspaces.find(w => w.id === agent.currentWorkspace);
    return `
      <div class="agent-item">
        <div class="name">${agent.name}</div>
        <div class="role">${getRoleText(agent.role)}</div>
        <span class="status ${agent.status}">${agent.status}</span>
        ${workspace ? `<div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">📍 ${workspace.name}</div>` : ''}
        ${agent.currentTask ? `<div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">🎯 ${agent.currentTask}</div>` : ''}
      </div>
    `;
  }).join('');
}

function renderTasks() {
  const container = document.getElementById('taskList');

  if (tasks.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Henüz görev yok</div>';
    return;
  }

  container.innerHTML = tasks.map(task => {
    const workspace = workspaces.find(w => w.id === task.workspaceId);
    const statusIcon = task.status === 'completed' ? '✅' : task.status === 'in-progress' ? '🔄' : '⏸️';
    const statusText = task.status === 'completed' ? 'Tamamlandı' : task.status === 'in-progress' ? 'Devam ediyor' : 'Beklemede';

    let duration = '';
    if (task.duration) {
      const minutes = Math.floor(task.duration / 60);
      const seconds = task.duration % 60;
      duration = `${minutes}dk ${seconds}sn`;
    }

    return `
      <div class="task-item ${selectedTaskId === task.id ? 'selected' : ''}" onclick="selectTask('${task.id}')">
        <div class="name">${statusIcon} ${task.title}</div>
        <div class="status-badge ${task.status}">${statusText}</div>
        ${workspace ? `<div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">📍 ${workspace.name}</div>` : ''}
        ${duration ? `<div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">⏱️ ${duration}</div>` : ''}
        <div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">
          👥 ${task.assignedAgents ? task.assignedAgents.length : 0} agent
        </div>
      </div>
    `;
  }).join('');
}

function updateWorkspaceSelect() {
  const select = document.getElementById('pmWorkspace');

  if (workspaces.length === 0) {
    select.innerHTML = '<option value="">Önce proje oluştur...</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = '<option value="">Proje seç...</option>' +
    workspaces.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
}

function updateStats() {
  document.getElementById('statWorkspaces').textContent = workspaces.length;
  document.getElementById('statAgents').textContent = agents.length;

  const working = agents.filter(a => a.status === 'working').length;
  document.getElementById('statWorking').textContent = working;
}

function updateConnectionStatus(connected) {
  const el = document.getElementById('connectionStatus');
  el.classList.toggle('connected', connected);
  el.querySelector('.text').textContent = connected ? 'Bağlı' : 'Bağlantı Kesildi';
}

function addActivity(type, message, from = null) {
  const feed = document.getElementById('activityFeed');
  const time = new Date().toLocaleTimeString('tr-TR');

  const item = document.createElement('div');
  item.className = `activity-item ${type}`;
  item.innerHTML = `
    <span class="time">${time}</span>
    ${from ? `<strong>${from}:</strong> ` : ''}${message}
  `;

  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;

  while (feed.children.length > 50) {
    feed.removeChild(feed.firstChild);
  }
}

// UI Actions
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `tab-${tabName}`);
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `content-${tabName}`);
  });
}

function showWorkspaceForm() {
  document.getElementById('workspaceForm').classList.remove('hidden');
}

function hideWorkspaceForm() {
  document.getElementById('workspaceForm').classList.add('hidden');
  document.getElementById('workspaceForm').reset();
}

function showAgentForm() {
  document.getElementById('agentForm').classList.remove('hidden');
}

function hideAgentForm() {
  document.getElementById('agentForm').classList.add('hidden');
  document.getElementById('agentForm').reset();
}

function openWorkspace(id) {
  const ws = workspaces.find(w => w.id === id);
  if (ws) {
    addActivity('system', `📁 "${ws.name}" workspace'i açıldı`);
    initMonacoEditor();
  }
}

function selectTask(taskId) {
  selectedTaskId = taskId;
  renderTasks();

  // Dashboard'ı sadece bu görev için filtrele
  filterDashboardByTask(taskId);

  addActivity('system', `🎯 Görev seçildi: "${tasks.find(t => t.id === taskId)?.title}"`);
}

function filterDashboardByTask(taskId) {
  // Activity Dashboard'ı bu görev için filtrele
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Activity Timeline ve PM Conversations'ı filtrele
  if (typeof window.filterActivityByTask === 'function') {
    window.filterActivityByTask(taskId);
  }
}

function openPMPanel() {
  document.getElementById('rightSidebar').scrollIntoView({ behavior: 'smooth' });
}

function toggleRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
}

// Settings
function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveSettings() {
  const personality = document.getElementById('pmPersonality').value;
  localStorage.setItem('pmPersonality', personality);

  // Claude Code auth'u yenile
  socket.emit('claude:refresh-auth');

  addActivity('system', '⚙️ Ayarlar kaydedildi');
  closeSettings();
}

function loadSettings() {
  const personality = localStorage.getItem('pmPersonality') || 'sert';
  document.getElementById('pmPersonality').value = personality;
}

// Utilities
function getRoleText(role) {
  const roles = {
    frontend: 'Frontend Dev',
    backend: 'Backend Dev',
    fullstack: 'Fullstack Dev',
    ui: 'UI Designer',
    tester: 'Tester/QA',
    security: 'Security',
    devops: 'DevOps'
  };
  return roles[role] || role;
}
