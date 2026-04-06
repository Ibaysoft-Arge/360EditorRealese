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
  populateRoleDropdown(); // Custom rolleri yükle

  // PM Chat'i global yap
  window.togglePMChat = togglePMChat;

  // Notification izni iste ve test et
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('🔔 Notification permission:', permission);
      if (permission === 'granted') {
        // Test notification
        setTimeout(() => {
          showNotification('🎉 360 Editor Başladı!', 'Bildirimler aktif');
        }, 1000);
      }
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    console.log('✅ Notification permission already granted');
    // Test notification
    setTimeout(() => {
      showNotification('🎉 360 Editor Başladı!', 'Bildirimler aktif');
    }, 1000);
  }

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

    console.log('✅ initial:state alındı:', {
      workspaces: workspaces.length,
      agents: agents.length,
      tasks: tasks.length
    });
    console.log('📋 Tasks:', tasks);

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
      const oldAgent = agents[index];

      // Agent çalışmaya başladıysa notification göster
      if (oldAgent.status === 'idle' && agent.status === 'working') {
        showNotification(`🚀 ${agent.name} Çalışmaya Başladı`, agent.currentTask || 'Görev üzerinde çalışıyor');
      }

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
    renderWorkspaces(); // Workspace'lerde görev sayısını güncelle
    addActivity('system', `🎯 Yeni görev: "${task.title}"`);
  });

  socket.on('task:updated', (task) => {
    const index = tasks.findIndex(t => t.id === task.id);
    if (index !== -1) {
      tasks[index] = task;
      window.tasks = tasks;
      renderTasks();
      renderWorkspaces(); // Workspace'lerde görev durumunu güncelle

      if (task.status === 'completed') {
        addActivity('system', `✅ Görev tamamlandı: "${task.title}"`);
        // Notification göster
        showNotification('🎉 Görev Tamamlandı!', task.title);
      }
    }
  });

  socket.on('task:deleted', ({ taskId }) => {
    tasks = tasks.filter(t => t.id !== taskId);
    window.tasks = tasks;
    renderTasks();
    renderWorkspaces(); // Workspace'lerde görev sayısını güncelle
    renderWorkspaces();
  });

  socket.on('task:stopped', ({ taskId }) => {
    addActivity('system', `⏸️ Görev durduruldu`);
  });

  socket.on('task:rollback-success', ({ taskId }) => {
    addActivity('system', `✅ Rollback başarılı! Değişiklikler geri alındı.`);
  });

  socket.on('task:rollback-error', ({ taskId, message }) => {
    addActivity('system', `❌ Rollback hatası: ${message}`);
    alert(`Rollback başarısız: ${message}`);
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

  // Agent memory event listeners
  socket.on('agent:memory-loaded', (data) => {
    const globalMemoryEl = document.getElementById('globalMemoryFull');
    const projectMemoryEl = document.getElementById('projectMemoryFull');

    if (globalMemoryEl) {
      globalMemoryEl.value = data.globalMemory || '';
    }
    if (projectMemoryEl) {
      projectMemoryEl.value = data.projectMemory || '';
    }
  });

  socket.on('agent:memory-added', (data) => {
    addActivity('system', data.message);
    // Hafızayı yeniden yükle
    if (currentMemoryWorkspaceId && currentMemoryAgentId) {
      socket.emit('agent:get-memory', {
        workspaceId: currentMemoryWorkspaceId,
        agentId: currentMemoryAgentId
      });
    }
  });

  socket.on('agent:memory-updated', (data) => {
    addActivity('system', data.message);
  });

  socket.on('agent:global-memory-added', (data) => {
    addActivity('system', data.message);
    // Global hafızayı yeniden yükle
    if (currentMemoryAgentId && currentMemoryWorkspaceId) {
      socket.emit('agent:get-memory', {
        workspaceId: currentMemoryWorkspaceId,
        agentId: currentMemoryAgentId
      });
    }
  });

  socket.on('agent:global-memory-updated', (data) => {
    addActivity('system', data.message);
  });

  // Task diff event listeners
  socket.on('task:diff-loaded', (data) => {
    const { diff, changedFiles } = data;

    let html = '';

    if (diff.totalFiles === 0) {
      html = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Değişiklik bulunamadı</div>';
    } else {
      // Özet
      html += `
        <div style="padding: 1rem; background: var(--bg-elevated); border-radius: 4px; margin-bottom: 1rem;">
          <strong>📊 Özet</strong>
          <div style="margin-top: 0.5rem; font-size: 0.9rem;">
            <div>📁 ${diff.totalFiles} dosya değişti</div>
            <div style="color: var(--success);">➕ ${diff.totalAdditions} ekleme</div>
            <div style="color: var(--error);">➖ ${diff.totalDeletions} silme</div>
          </div>
        </div>
      `;

      // Değişen dosyalar
      html += '<div style="margin-bottom: 1rem;"><strong>📄 Değişen Dosyalar:</strong></div>';

      diff.files.forEach(file => {
        html += `
          <div style="padding: 0.8rem; background: var(--bg-tertiary); border-radius: 4px; margin-bottom: 0.5rem;">
            <div style="font-weight: 600;">${file.path}</div>
            <div style="font-size: 0.8rem; margin-top: 0.3rem;">
              <span style="color: var(--success);">+${file.additions}</span>
              <span style="color: var(--error); margin-left: 1rem;">-${file.deletions}</span>
            </div>
          </div>
        `;
      });

      // Changed files (git status)
      if (changedFiles && changedFiles.length > 0) {
        html += '<div style="margin-top: 1.5rem; margin-bottom: 0.5rem;"><strong>🔄 Git Status:</strong></div>';

        changedFiles.forEach(file => {
          let statusColor = 'var(--warning)';
          if (file.status === 'added') statusColor = 'var(--success)';
          else if (file.status === 'deleted') statusColor = 'var(--error)';

          html += `
            <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; margin-bottom: 0.3rem; font-size: 0.85rem;">
              <span style="color: ${statusColor}; font-weight: 600;">${file.status.toUpperCase()}</span>
              <span style="margin-left: 0.5rem;">${file.path}</span>
            </div>
          `;
        });
      }

      // Raw diff (collapsed)
      if (diff.diff) {
        html += `
          <details style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 4px;">
            <summary style="cursor: pointer; font-weight: 600;">🔍 Detaylı Diff (Ham Çıktı)</summary>
            <pre style="margin-top: 1rem; padding: 1rem; background: var(--bg-primary); border-radius: 4px; overflow-x: auto; font-size: 0.75rem; white-space: pre-wrap;">${escapeHtml(diff.diff)}</pre>
          </details>
        `;
      }
    }

    const diffContentEl = document.getElementById('taskDiffContent');
    if (diffContentEl) {
      diffContentEl.innerHTML = html;
    }
  });

  socket.on('task:diff-error', (data) => {
    const diffContentEl = document.getElementById('taskDiffContent');
    if (diffContentEl) {
      diffContentEl.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--error);">
          ❌ Hata: ${data.message}
        </div>
      `;
    }
  });

  // Telegram event listeners
  socket.on('telegram:test-success', (data) => {
    addActivity('system', '✅ Telegram bağlantısı başarılı!');
    alert('✅ Telegram bağlantısı başarılı!\n\nTelegram\'dan test mesajı aldın mı?');
  });

  socket.on('telegram:test-error', (data) => {
    addActivity('system', `❌ Telegram bağlantı hatası: ${data.message}`);
    alert(`❌ Telegram bağlantı hatası:\n\n${data.message}`);
  });

  socket.on('telegram:configured', () => {
    addActivity('system', '📱 Telegram yapılandırıldı');
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

    let roleValue = document.getElementById('agentRole').value;
    const customRoleInput = document.getElementById('customRoleInput');

    // Eğer özel rol seçildiyse
    if (roleValue === '__custom__') {
      const customRole = customRoleInput.value.trim();
      if (!customRole) {
        alert('Lütfen özel rol adını girin!');
        return;
      }
      roleValue = customRole;
      saveCustomRole(customRole); // Özel rolü kaydet
      populateRoleDropdown(); // Dropdown'ı güncelle
    }

    const data = {
      name: document.getElementById('agentName').value,
      role: roleValue
    };
    socket.emit('agent:create', data);
    e.target.reset();
    customRoleInput.style.display = 'none'; // Custom input'u gizle
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

    // PM kişiliğini al
    const personality = localStorage.getItem('pmPersonality') || 'sert';

    socket.emit('pm:assign-task', {
      workspaceName: workspace.name,
      workspaceId: workspaceId,
      task: task,
      personality: personality
    });

    addActivity('system', `🎯 PM'e görev: "${task}"`);
    document.getElementById('pmTask').value = '';
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Modal açıksa bazı kısayolları devre dışı bırak
    const modalsOpen = !document.getElementById('settingsModal').classList.contains('hidden') ||
                      !document.getElementById('agentMemoryModal').classList.contains('hidden');

    // Esc - Modal kapat
    if (e.key === 'Escape') {
      if (!document.getElementById('settingsModal').classList.contains('hidden')) {
        closeSettings();
      }
      if (!document.getElementById('agentMemoryModal').classList.contains('hidden')) {
        closeAgentMemoryModal();
      }
      return;
    }

    // Ctrl/Cmd tuşu kontrolü
    const ctrlKey = e.ctrlKey || e.metaKey;

    if (!ctrlKey) return;

    // Textarea/input içindeyse bazı kısayolları engelle
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
      // Sadece Ctrl+S'ye izin ver
      if (e.key !== 's') return;
    }

    switch(e.key.toLowerCase()) {
      case 'n':
        e.preventDefault();
        if (!modalsOpen) {
          switchTab('workspaces');
          showWorkspaceForm();
        }
        break;

      case 'a':
        e.preventDefault();
        if (!modalsOpen) {
          switchTab('agents');
          showAgentForm();
        }
        break;

      case 't':
        e.preventDefault();
        if (!modalsOpen) {
          document.getElementById('pmTask').focus();
        }
        break;

      case 's':
        e.preventDefault();
        if (modalsOpen) {
          saveSettings();
        } else {
          openSettings();
        }
        break;

      case 'p':
        e.preventDefault();
        if (!modalsOpen) {
          togglePMChat();
        }
        break;

      case '/':
        e.preventDefault();
        if (!modalsOpen) {
          // Task filtreleme (gelecek özellik)
          console.log('Task filtreleme açılacak...');
        }
        break;
    }
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
  updateUITexts(); // Tüm statik metinleri güncelle
  renderWorkspaces();
  renderAgents();
  renderTasks();
  updateStats();
  updateWorkspaceSelect();
}

// Tüm UI metinlerini güncelle (dil değişiminde)
function updateUITexts() {
  // Tab butonları
  const tabWorkspaces = document.getElementById('tab-workspaces');
  const tabAgents = document.getElementById('tab-agents');
  const tabTasks = document.getElementById('tab-tasks');

  if (tabWorkspaces) tabWorkspaces.textContent = `📁 ${t('workspaces')}`;
  if (tabAgents) tabAgents.textContent = `👥 ${t('agents')}`;
  if (tabTasks) tabTasks.textContent = `🎯 ${t('tasks')}`;

  // Placeholder'lar
  const wsName = document.getElementById('wsName');
  const wsPath = document.getElementById('wsPath');
  const agentName = document.getElementById('agentName');
  const pmTaskInput = document.getElementById('pmTask');

  if (wsName) wsName.placeholder = t('workspace_name');
  if (wsPath) wsPath.placeholder = t('workspace_path');
  if (agentName) agentName.placeholder = t('agent_name');
  if (pmTaskInput) pmTaskInput.placeholder = t('task_description');
}

function renderWorkspaces() {
  const container = document.getElementById('workspaceList');

  if (workspaces.length === 0) {
    container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${t('no_workspaces')}</div>`;
    return;
  }

  const allTasks = window.tasks || tasks || [];
  console.log('🔍 renderWorkspaces - allTasks:', allTasks.length, allTasks);
  console.log('🔍 expandedWorkspaces:', window.expandedWorkspaces);

  container.innerHTML = workspaces.map(ws => {
    const workspaceTasks = allTasks.filter(t => t.workspaceId === ws.id);
    const isExpanded = window.expandedWorkspaces && window.expandedWorkspaces[ws.id];

    console.log(`🔍 Workspace ${ws.name}:`, {
      id: ws.id,
      tasksCount: workspaceTasks.length,
      isExpanded: isExpanded,
      tasks: workspaceTasks
    });

    return `
      <div class="workspace-item-wrapper">
        <div class="workspace-item" onclick="${workspaceTasks.length > 0 ? `toggleWorkspaceTasks('${ws.id}')` : `openWorkspace('${ws.id}')`}">
          <div class="name">
            ${workspaceTasks.length > 0 ? `<span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>` : ''}
            ${ws.name}
            ${workspaceTasks.length > 0 ? `<span style="font-size: 0.75rem; opacity: 0.7;">(${workspaceTasks.length})</span>` : ''}
          </div>
          <div class="path">${ws.path}</div>
        </div>
        ${workspaceTasks.length > 0 && isExpanded ? `
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

// Workspace görevlerini aç/kapa
if (!window.expandedWorkspaces) {
  window.expandedWorkspaces = {};
}

function toggleWorkspaceTasks(workspaceId) {
  window.expandedWorkspaces[workspaceId] = !window.expandedWorkspaces[workspaceId];

  console.log('🔄 Toggle:', workspaceId, '→', window.expandedWorkspaces[workspaceId]);

  const allWorkspaces = window.workspaces || workspaces || [];
  const ws = allWorkspaces.find(w => w.id === workspaceId);
  if (ws) {
    const action = window.expandedWorkspaces[workspaceId] ? t('workspace_opened') : t('workspace_closed');
    addActivity('system', `📁 "${ws.name}" ${t('workspace_tasks')} ${action}`);
  }

  // Force reload tasks
  const allTasks = window.tasks || tasks || [];
  console.log('📋 Rendering with tasks:', allTasks.length);

  renderWorkspaces();
}

function renderAgents() {
  const container = document.getElementById('agentList');

  if (agents.length === 0) {
    container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${t('no_agents')}</div>`;
    return;
  }

  container.innerHTML = agents.map(agent => {
    const workspace = workspaces.find(w => w.id === agent.currentWorkspace);

    // Performance metrics
    const completedTasks = agent.completedTasks || 0;
    const totalDuration = agent.totalDuration || 0;
    const avgDuration = completedTasks > 0 ? Math.floor(totalDuration / completedTasks) : 0;
    const avgMinutes = Math.floor(avgDuration / 60);
    const avgSeconds = avgDuration % 60;

    let lastActivity = '';
    if (agent.lastActivity) {
      const lastDate = new Date(agent.lastActivity);
      const now = new Date();
      const diffMs = now - lastDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays > 0) {
        lastActivity = `${diffDays} gün önce`;
      } else if (diffHours > 0) {
        lastActivity = `${diffHours} saat önce`;
      } else if (diffMins > 0) {
        lastActivity = `${diffMins} dk önce`;
      } else {
        lastActivity = 'Az önce';
      }
    }

    return `
      <div class="agent-item">
        <div class="name">${agent.name}</div>
        <div class="role">${getRoleText(agent.role)}</div>
        <span class="status ${agent.status}">${agent.status}</span>
        ${workspace ? `<div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">📍 ${workspace.name}</div>` : ''}
        ${agent.currentTask ? `<div style="font-size: 0.75rem; margin-top: 0.3rem; color: var(--text-secondary);">🎯 ${agent.currentTask}</div>` : ''}

        <!-- Performance Metrics -->
        ${completedTasks > 0 ? `
          <div style="font-size: 0.7rem; margin-top: 0.5rem; padding: 0.4rem; background: var(--bg-elevated); border-radius: 3px; color: var(--text-secondary);">
            <div>📊 ${completedTasks} görev tamamlandı</div>
            <div>⏱️ Ort: ${avgMinutes}dk ${avgSeconds}sn</div>
            ${lastActivity ? `<div>🕐 ${lastActivity}</div>` : ''}
          </div>
        ` : ''}

        <button class="btn-sm" onclick="openAgentMemoryModal('${agent.id}')" style="margin-top: 0.5rem; width: 100%;" title="Agent'a bilgi öğret">
          🧠 Öğret
        </button>
      </div>
    `;
  }).join('');
}

function renderTasks() {
  const container = document.getElementById('taskList');

  // Workspace filter dropdown'unu güncelle
  updateTaskWorkspaceFilter();

  // Filtreleri uygula
  let filteredTasks = [...tasks];

  // Arama filtresi
  const searchTerm = document.getElementById('taskSearchInput')?.value.toLowerCase() || '';
  if (searchTerm) {
    filteredTasks = filteredTasks.filter(task =>
      task.title.toLowerCase().includes(searchTerm) ||
      (task.description && task.description.toLowerCase().includes(searchTerm))
    );
  }

  // Status filtresi
  const statusFilter = document.getElementById('taskStatusFilter')?.value || 'all';
  if (statusFilter !== 'all') {
    filteredTasks = filteredTasks.filter(task => task.status === statusFilter);
  }

  // Workspace filtresi
  const workspaceFilter = document.getElementById('taskWorkspaceFilter')?.value || 'all';
  if (workspaceFilter !== 'all') {
    filteredTasks = filteredTasks.filter(task => task.workspaceId === workspaceFilter);
  }

  // Sıralama
  const sortOrder = document.getElementById('taskSortOrder')?.value || 'newest';
  filteredTasks.sort((a, b) => {
    const dateA = new Date(a.createdAt || a.startTime);
    const dateB = new Date(b.createdAt || b.startTime);
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  if (filteredTasks.length === 0) {
    container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Filtre ile eşleşen görev yok</div>`;
    return;
  }

  container.innerHTML = filteredTasks.map(task => {
    const workspace = workspaces.find(w => w.id === task.workspaceId);
    const statusIcon = task.status === 'completed' ? '✅' : task.status === 'in-progress' ? '🔄' : task.status === 'stopped' ? '⏸️' : '⏸️';
    const statusText = task.status === 'completed' ? t('status_completed') : task.status === 'in-progress' ? t('status_in_progress') : task.status === 'stopped' ? t('status_stopped') : t('status_pending');

    let duration = '';
    if (task.duration) {
      const minutes = Math.floor(task.duration / 60);
      const seconds = task.duration % 60;
      duration = `${minutes}dk ${seconds}sn`;
    }

    // Butonlar
    let actions = '';
    if (task.status === 'in-progress') {
      actions = `<button class="task-action-btn stop" onclick="event.stopPropagation(); stopTask('${task.id}')" title="${t('stop_task')}">⏸️</button>`;
    } else if (task.status === 'stopped' || task.status === 'completed') {
      actions = `
        <button class="task-action-btn" onclick="event.stopPropagation(); showTaskDiff('${task.id}')" title="Kod değişikliklerini gör">📊</button>
        <button class="task-action-btn rollback" onclick="event.stopPropagation(); rollbackTask('${task.id}')" title="${t('rollback_task')}">↩️</button>
        <button class="task-action-btn delete" onclick="event.stopPropagation(); deleteTask('${task.id}')" title="${t('delete_task')}">🗑️</button>
      `;
    }

    return `
      <div class="task-item ${selectedTaskId === task.id ? 'selected' : ''}" onclick="selectTask('${task.id}')">
        <div class="task-header">
          <div class="name">${statusIcon} ${task.title}</div>
          <div class="task-actions">${actions}</div>
        </div>
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

// Task filtreleme
function filterTasks() {
  renderTasks();
}

// Task arama (typing sırasında)
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('taskSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(window.taskSearchTimeout);
      window.taskSearchTimeout = setTimeout(() => {
        filterTasks();
      }, 300); // 300ms debounce
    });
  }
});

// Workspace filter dropdown'unu güncelle
function updateTaskWorkspaceFilter() {
  const select = document.getElementById('taskWorkspaceFilter');
  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = '<option value="all">Tüm Projeler</option>' +
    workspaces.map(w => `<option value="${w.id}">${w.name}</option>`).join('');

  // Önceki seçimi koru
  if (currentValue) {
    select.value = currentValue;
  }
}

// Görevi durdur
function stopTask(taskId) {
  if (confirm(t('confirm_stop'))) {
    socket.emit('task:stop', { taskId });
    addActivity('system', `⏸️ ${t('task_stopped')}`);
  }
}

// Görevi sil
function deleteTask(taskId) {
  if (confirm(t('confirm_delete'))) {
    socket.emit('task:delete', { taskId });
    addActivity('system', `🗑️ ${t('task_deleted')}`);
  }
}

// Rollback (değişiklikleri geri al)
function rollbackTask(taskId) {
  if (confirm(t('confirm_rollback'))) {
    socket.emit('task:rollback', { taskId });
    addActivity('system', '↩️ Rollback...');
  }
}

function updateWorkspaceSelect() {
  const select = document.getElementById('pmWorkspace');

  if (workspaces.length === 0) {
    select.innerHTML = `<option value="">${t('error_no_workspace')}</option>`;
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = `<option value="">${t('select_workspace')}</option>` +
    workspaces.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
}

function updateStats() {
  const statWorkspaces = document.getElementById('statWorkspaces');
  const statAgents = document.getElementById('statAgents');
  const statWorking = document.getElementById('statWorking');

  if (statWorkspaces) statWorkspaces.textContent = workspaces.length;
  if (statAgents) statAgents.textContent = agents.length;

  if (statWorking) {
    const working = agents.filter(a => a.status === 'working').length;
    statWorking.textContent = working;
  }
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

  // Mevcut dil seçimini göster
  const currentLang = getCurrentLanguage();
  if (document.getElementById('languageSelect')) {
    document.getElementById('languageSelect').value = currentLang;
  }

  // Mevcut temayı göster
  const currentThemeValue = getCurrentTheme();
  if (document.getElementById('themeSelect')) {
    document.getElementById('themeSelect').value = currentThemeValue;
  }
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveSettings() {
  const personality = document.getElementById('pmPersonality').value;
  localStorage.setItem('pmPersonality', personality);

  // Telegram ayarları
  const telegramBotToken = document.getElementById('telegramBotToken').value;
  const telegramChatId = document.getElementById('telegramChatId').value;
  localStorage.setItem('telegramBotToken', telegramBotToken);
  localStorage.setItem('telegramChatId', telegramChatId);

  // Backend'e telegram ayarlarını gönder
  if (telegramBotToken && telegramChatId) {
    socket.emit('telegram:config', {
      botToken: telegramBotToken,
      chatId: telegramChatId
    });
  }

  // Claude Code auth'u yenile
  socket.emit('claude:refresh-auth');

  addActivity('system', '⚙️ Ayarlar kaydedildi');
  closeSettings();
}

function loadSettings() {
  const personality = localStorage.getItem('pmPersonality') || 'sert';
  if (document.getElementById('pmPersonality')) {
    document.getElementById('pmPersonality').value = personality;
  }

  // Telegram ayarlarını yükle
  const telegramBotToken = localStorage.getItem('telegramBotToken') || '';
  const telegramChatId = localStorage.getItem('telegramChatId') || '';
  if (document.getElementById('telegramBotToken')) {
    document.getElementById('telegramBotToken').value = telegramBotToken;
  }
  if (document.getElementById('telegramChatId')) {
    document.getElementById('telegramChatId').value = telegramChatId;
  }

  // Dil ayarını yükle
  const lang = localStorage.getItem('360editor-language') || 'tr';
  if (document.getElementById('languageSelect')) {
    document.getElementById('languageSelect').value = lang;
  }
  if (document.getElementById('topLanguageSelect')) {
    document.getElementById('topLanguageSelect').value = lang;
  }

  // Tema ayarını yükle
  const theme = localStorage.getItem('360editor-theme') || 'dark';
  if (document.getElementById('themeSelect')) {
    document.getElementById('themeSelect').value = theme;
  }
  if (document.getElementById('topThemeSelect')) {
    document.getElementById('topThemeSelect').value = theme;
  }
}

// Agent Memory Modal
let currentMemoryAgentId = null;
let currentMemoryWorkspaceId = null;

function openAgentMemoryModal(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  if (workspaces.length === 0) {
    alert('Lütfen önce bir workspace oluştur!');
    return;
  }

  currentMemoryAgentId = agentId;

  // Workspace dropdown'unu doldur
  const workspaceSelect = document.getElementById('memoryWorkspaceSelect');
  workspaceSelect.innerHTML = workspaces.map(w =>
    `<option value="${w.id}">${w.name}</option>`
  ).join('');

  // Agent şu an çalışıyorsa o workspace'i seç, yoksa ilkini
  const defaultWorkspace = workspaces.find(w => w.id === agent.currentWorkspace) || workspaces[0];
  workspaceSelect.value = defaultWorkspace.id;
  currentMemoryWorkspaceId = defaultWorkspace.id;

  document.getElementById('agentMemoryTitle').textContent = `Agent: ${agent.name} (${getRoleText(agent.role)})`;
  document.getElementById('agentMemoryModal').classList.remove('hidden');

  // Hafızayı yükle
  loadAgentMemoryData();
}

// Workspace değiştiğinde hafızayı yeniden yükle
function changeMemoryWorkspace() {
  const workspaceSelect = document.getElementById('memoryWorkspaceSelect');
  currentMemoryWorkspaceId = workspaceSelect.value;

  if (currentMemoryWorkspaceId && currentMemoryAgentId) {
    loadAgentMemoryData();
  }
}

// Agent hafıza verilerini yükle
function loadAgentMemoryData() {
  socket.emit('agent:get-memory', {
    workspaceId: currentMemoryWorkspaceId,
    agentId: currentMemoryAgentId
  });
}

function closeAgentMemoryModal() {
  document.getElementById('agentMemoryModal').classList.add('hidden');
  document.getElementById('globalMemoryNote').value = '';
  document.getElementById('projectMemoryNote').value = '';
  currentMemoryAgentId = null;
  currentMemoryWorkspaceId = null;
}

// Tab switching
function switchMemoryTab(tab) {
  // Update tabs
  document.getElementById('globalMemoryTab').classList.toggle('active', tab === 'global');
  document.getElementById('projectMemoryTab').classList.toggle('active', tab === 'project');

  // Update tab styles
  if (tab === 'global') {
    document.getElementById('globalMemoryTab').style.borderBottom = '2px solid var(--accent-primary)';
    document.getElementById('globalMemoryTab').style.color = 'var(--text-primary)';
    document.getElementById('globalMemoryTab').style.fontWeight = '600';
    document.getElementById('projectMemoryTab').style.borderBottom = '2px solid transparent';
    document.getElementById('projectMemoryTab').style.color = 'var(--text-secondary)';
    document.getElementById('projectMemoryTab').style.fontWeight = 'normal';
  } else {
    document.getElementById('projectMemoryTab').style.borderBottom = '2px solid var(--accent-primary)';
    document.getElementById('projectMemoryTab').style.color = 'var(--text-primary)';
    document.getElementById('projectMemoryTab').style.fontWeight = '600';
    document.getElementById('globalMemoryTab').style.borderBottom = '2px solid transparent';
    document.getElementById('globalMemoryTab').style.color = 'var(--text-secondary)';
    document.getElementById('globalMemoryTab').style.fontWeight = 'normal';
  }

  // Show/hide content
  document.getElementById('globalMemoryContent').style.display = tab === 'global' ? 'block' : 'none';
  document.getElementById('projectMemoryContent').style.display = tab === 'project' ? 'block' : 'none';
}

// Global memory functions
function addGlobalMemoryNote() {
  const note = document.getElementById('globalMemoryNote').value.trim();
  if (!note) {
    alert('Lütfen bir not gir!');
    return;
  }

  socket.emit('agent:add-global-memory', {
    agentId: currentMemoryAgentId,
    note: note
  });

  document.getElementById('globalMemoryNote').value = '';
}

function saveGlobalMemoryFull() {
  const content = document.getElementById('globalMemoryFull').value;

  socket.emit('agent:update-global-memory', {
    agentId: currentMemoryAgentId,
    content: content
  });
}

// Project memory functions
function addProjectMemoryNote() {
  const note = document.getElementById('projectMemoryNote').value.trim();
  if (!note) {
    alert('Lütfen bir not gir!');
    return;
  }

  socket.emit('agent:add-memory', {
    workspaceId: currentMemoryWorkspaceId,
    agentId: currentMemoryAgentId,
    note: note
  });

  document.getElementById('projectMemoryNote').value = '';
}

function saveProjectMemoryFull() {
  const content = document.getElementById('projectMemoryFull').value;

  socket.emit('agent:update-memory', {
    workspaceId: currentMemoryWorkspaceId,
    agentId: currentMemoryAgentId,
    content: content
  });
}

// Notification Helper
function showNotification(title, body) {
  console.log('🔔 Notification:', title, body);

  // Electron notification
  if (window.electron && window.electron.showNotification) {
    console.log('📱 Using Electron notification');
    window.electron.showNotification(title, body);
  }
  // Fallback: Browser notification
  else if ('Notification' in window && Notification.permission === 'granted') {
    console.log('🌐 Using Browser notification (granted)');
    new Notification(title, { body });
  }
  // İzin iste
  else if ('Notification' in window && Notification.permission !== 'denied') {
    console.log('❓ Requesting notification permission...');
    Notification.requestPermission().then(permission => {
      console.log('📋 Permission result:', permission);
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    });
  } else {
    console.log('❌ Notifications not supported or denied');
  }
}

// Export/Import Workspace Settings
function exportWorkspaceSettings() {
  const exportData = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    workspaces: workspaces.map(ws => ({
      name: ws.name,
      path: ws.path,
      description: ws.description || ''
    })),
    agents: agents.map(agent => ({
      name: agent.name,
      role: agent.role
    })),
    settings: {
      pmPersonality: localStorage.getItem('pmPersonality') || 'sert',
      language: localStorage.getItem('360editor-language') || 'tr',
      theme: localStorage.getItem('360editor-theme') || 'dark'
    }
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `360editor-settings-${Date.now()}.json`;
  link.click();

  URL.revokeObjectURL(url);
  addActivity('system', '📤 Ayarlar dışa aktarıldı');
  showNotification('📤 Export Başarılı', 'Ayarlar dosyaya kaydedildi');
}

function importWorkspaceSettings(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importData = JSON.parse(e.target.result);

      if (!importData.version || !importData.workspaces || !importData.agents) {
        alert('Geçersiz dosya formatı!');
        return;
      }

      let importedCount = 0;

      // Workspace'leri import et
      importData.workspaces.forEach(ws => {
        socket.emit('workspace:create', ws);
        importedCount++;
      });

      // Agent'ları import et (biraz gecikmeli, workspace'ler oluşsun)
      setTimeout(() => {
        importData.agents.forEach(agent => {
          socket.emit('agent:create', agent);
          importedCount++;
        });

        // Ayarları uygula
        if (importData.settings) {
          if (importData.settings.pmPersonality) {
            localStorage.setItem('pmPersonality', importData.settings.pmPersonality);
          }
          if (importData.settings.language) {
            changeLanguage(importData.settings.language);
          }
          if (importData.settings.theme) {
            changeTheme(importData.settings.theme);
          }
        }

        addActivity('system', `📥 ${importedCount} öğe içe aktarıldı`);
        showNotification('📥 Import Başarılı', `${importedCount} öğe eklendi`);
      }, 500);

    } catch (error) {
      alert('Dosya okunamadı: ' + error.message);
    }
  };

  reader.readAsText(file);
  event.target.value = ''; // Reset input
}

// Task Diff Modal
function showTaskDiff(taskId) {
  document.getElementById('taskDiffModal').classList.remove('hidden');
  document.getElementById('taskDiffContent').innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Yükleniyor...</div>';

  // Backend'den diff al
  socket.emit('task:get-diff', { taskId });
}

function closeTaskDiffModal() {
  document.getElementById('taskDiffModal').classList.add('hidden');
}

// HTML escape helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

// Custom Role Management
function loadCustomRoles() {
  const stored = localStorage.getItem('customAgentRoles');
  return stored ? JSON.parse(stored) : [];
}

function saveCustomRole(roleName) {
  const customRoles = loadCustomRoles();
  if (!customRoles.includes(roleName)) {
    customRoles.push(roleName);
    localStorage.setItem('customAgentRoles', JSON.stringify(customRoles));
    console.log('✅ Özel rol kaydedildi:', roleName);
  }
}

function populateRoleDropdown() {
  const roleSelect = document.getElementById('agentRole');
  if (!roleSelect) return;

  const defaultRoles = [
    { value: 'frontend', text: 'Frontend' },
    { value: 'backend', text: 'Backend' },
    { value: 'fullstack', text: 'Fullstack' },
    { value: 'ui', text: 'UI Designer' },
    { value: 'tester', text: 'Tester' },
    { value: 'security', text: 'Security' },
    { value: 'devops', text: 'DevOps' }
  ];

  // Mevcut seçimi koru
  const currentValue = roleSelect.value;

  // Temizle
  roleSelect.innerHTML = '';

  // Varsayılan rolleri ekle
  defaultRoles.forEach(role => {
    const option = document.createElement('option');
    option.value = role.value;
    option.textContent = role.text;
    roleSelect.appendChild(option);
  });

  // Custom rolleri ekle
  const customRoles = loadCustomRoles();
  if (customRoles.length > 0) {
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '───────────────';
    roleSelect.appendChild(separator);

    customRoles.forEach(role => {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      roleSelect.appendChild(option);
    });
  }

  // "Özel Rol Ekle" seçeneği
  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = '➕ Özel Rol Ekle';
  roleSelect.appendChild(customOption);

  // Eski seçimi geri yükle
  if (currentValue) {
    roleSelect.value = currentValue;
  }
}

function handleRoleChange() {
  const roleSelect = document.getElementById('agentRole');
  const customRoleInput = document.getElementById('customRoleInput');

  if (roleSelect.value === '__custom__') {
    customRoleInput.style.display = 'block';
    customRoleInput.required = true;
    customRoleInput.focus();
  } else {
    customRoleInput.style.display = 'none';
    customRoleInput.required = false;
    customRoleInput.value = '';
  }
}

// Global fonksiyon olarak expose et
window.handleRoleChange = handleRoleChange;

// Telegram Test
function testTelegramConnection() {
  const botToken = document.getElementById('telegramBotToken').value;
  const chatId = document.getElementById('telegramChatId').value;

  if (!botToken || !chatId) {
    alert('❌ Lütfen Bot Token ve Chat ID girin!');
    return;
  }

  addActivity('system', '🧪 Telegram bağlantısı test ediliyor...');
  socket.emit('telegram:test', { botToken, chatId });
}

window.testTelegramConnection = testTelegramConnection;
