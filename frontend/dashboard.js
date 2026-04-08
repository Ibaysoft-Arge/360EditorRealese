// Activity Dashboard
let activityLog = [];
let pmConversations = {};
let currentFilter = 'all';
let currentTaskFilter = null;

// LocalStorage'dan yükle
function loadDashboardData() {
  const savedLogs = localStorage.getItem('activityLog');
  const savedConversations = localStorage.getItem('pmConversations');

  if (savedLogs) {
    try {
      activityLog = JSON.parse(savedLogs);
      console.log('✅ Dashboard yüklendi:', activityLog.length, 'aktivite,', Object.keys(pmConversations).length, 'konuşma');
    } catch (e) {
      console.error('❌ Activity log parse hatası:', e);
    }
  }

  if (savedConversations) {
    try {
      pmConversations = JSON.parse(savedConversations);
    } catch (e) {
      console.error('❌ PM conversations parse hatası:', e);
    }
  }
}

// LocalStorage'a kaydet
function saveDashboardData() {
  try {
    localStorage.setItem('activityLog', JSON.stringify(activityLog));
    localStorage.setItem('pmConversations', JSON.stringify(pmConversations));
  } catch (e) {
    console.error('❌ localStorage kaydetme hatası:', e);
  }
}

function initDashboard() {
  loadDashboardData(); // İlk yüklemede veriyi al

  renderAgentStatus();
  renderActivityTimeline();
  renderPMConversations();

  // Agent durumunu her saniye güncelle (çalışma süresi için)
  setInterval(() => {
    renderAgentStatus();
  }, 1000);
}

function addActivityLog(type, message, data = {}) {
  const logEntry = {
    type,
    message,
    timestamp: new Date().toISOString(),
    data
  };

  activityLog.unshift(logEntry);

  // Son 100 kayıt tut
  if (activityLog.length > 100) {
    activityLog = activityLog.slice(0, 100);
  }

  saveDashboardData(); // LocalStorage'a kaydet
  renderActivityTimeline();
}

function addPMConversation(taskId, taskName, from, message) {
  if (!pmConversations[taskId]) {
    pmConversations[taskId] = {
      taskName: taskName,
      messages: []
    };
  }

  pmConversations[taskId].messages.push({
    from,
    message,
    timestamp: new Date().toISOString()
  });

  saveDashboardData(); // LocalStorage'a kaydet
  renderPMConversations();
}

// Agent aktivitesi simüle et
function getAgentActivity(agent) {
  if (!agent.startTime) return '📊 Analiz ediyor...';

  const elapsed = Math.floor((Date.now() - new Date(agent.startTime).getTime()) / 1000);

  if (elapsed < 10) return '📊 Görevi analiz ediyor...';
  if (elapsed < 30) return '🔍 Kod tabanını inceliyor...';
  if (elapsed < 60) return '⚙️ Çözüm geliştiriyor...';
  if (elapsed < 90) return '💻 Kod yazıyor...';
  if (elapsed < 120) return '🧪 Test ediyor...';
  if (elapsed < 150) return '📝 Rapor hazırlıyor...';
  return '✅ Neredeyse bitti...';
}

// Tahmini kalan süre
function getEstimatedTime(agent) {
  if (!agent.startTime) return '~3dk';

  const elapsed = Math.floor((Date.now() - new Date(agent.startTime).getTime()) / 1000);
  const remaining = Math.max(0, 180 - elapsed); // 3 dakika varsayalım

  if (remaining === 0) return 'Tamamlanıyor...';

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  if (minutes > 0) {
    return `~${minutes}dk ${seconds}sn`;
  }
  return `~${seconds}sn`;
}

function renderAgentStatus() {
  const container = document.getElementById('agentStatusCards');
  if (!container) return;

  const agents = window.agents || [];
  const workspaces = window.workspaces || [];

  if (agents.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Henüz agent yok</div>';
    return;
  }

  container.innerHTML = agents.map(agent => {
    const workspace = workspaces.find(w => w.id === agent.currentWorkspace);

    // Çalışma süresi hesapla
    let workingTime = '';
    if (agent.status === 'working' && agent.startTime) {
      const elapsed = Math.floor((Date.now() - new Date(agent.startTime).getTime()) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      workingTime = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    return `
      <div class="agent-status-card ${agent.status}">
        <div class="name">${agent.name}</div>
        <div class="role">${getRoleText(agent.role)}</div>
        <div class="status">
          ${agent.status === 'working' ? '🔴 Çalışıyor' : '🟢 Boşta'}
          ${workingTime ? `<span style="margin-left: 0.5rem; font-size: 0.75rem;">${workingTime}</span>` : ''}
        </div>
        ${agent.currentTask ? `
          <div class="current-task">
            📍 ${workspace?.name || 'Bilinmeyen'}<br>
            🎯 ${agent.currentTask.substring(0, 100)}${agent.currentTask.length > 100 ? '...' : ''}
          </div>
        ` : ''}
        ${agent.status === 'working' ? `
          <div style="margin-top: 0.5rem;">
            <div class="agent-progress-container">
              <div class="agent-progress-bar"></div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.3rem; display: flex; justify-content: space-between; min-height: 20px;">
              <span class="agent-activity" style="flex: 1;">${getAgentActivity(agent)}</span>
              <span class="agent-progress-text" style="white-space: nowrap;">~${getEstimatedTime(agent)}</span>
            </div>
          </div>
        ` : '<div style="min-height: 60px;"></div>'}
      </div>
    `;
  }).join('');
}

function renderActivityTimeline() {
  const container = document.getElementById('activityTimeline');
  if (!container) return;

  let filteredLogs = activityLog;

  if (currentFilter === 'today') {
    const today = new Date().toDateString();
    filteredLogs = activityLog.filter(log => {
      return new Date(log.timestamp).toDateString() === today;
    });
  } else if (currentFilter === 'task' && currentTaskFilter) {
    // Göreve göre filtrele (taskId içeren logları göster)
    const task = window.tasks?.find(t => t.id === currentTaskFilter);
    const assignedAgentNames = task?.assignedAgents?.map(a => a.name) || [];

    filteredLogs = activityLog.filter(log => {
      // Direkt taskId match
      if (log.data && log.data.taskId === currentTaskFilter) return true;

      // Görevdeki agent'larla ilgili tüm loglar
      if (assignedAgentNames.length > 0) {
        for (const agentName of assignedAgentNames) {
          if (log.message.includes(agentName)) return true;
        }
      }

      return false;
    });
  }

  if (filteredLogs.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">Bu görev için aktivite yok</div>';
    return;
  }

  container.innerHTML = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('tr-TR');
    return `
      <div class="timeline-item">
        <div class="time">${time}</div>
        <div class="event">${log.message}</div>
      </div>
    `;
  }).join('');
}

function renderPMConversations() {
  const container = document.getElementById('pmConversations');
  if (!container) return;

  let taskIds = Object.keys(pmConversations);

  // Task filtresine göre filtrele
  if (currentFilter === 'task' && currentTaskFilter) {
    taskIds = taskIds.filter(id => id === currentTaskFilter);
  }

  if (taskIds.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">Bu görev için konuşma yok</div>';
    return;
  }

  container.innerHTML = taskIds.reverse().map(taskId => {
    const conversation = pmConversations[taskId];
    return `
      <div class="conversation-group">
        <div class="task-title">🎯 ${conversation.taskName}</div>
        <div class="conversation-messages">
          ${conversation.messages.map(msg => `
            <div class="conversation-message ${msg.from === 'PM' ? 'pm' : 'agent'}">
              <div class="from">${msg.from}</div>
              <div class="text">${msg.message}</div>
              <div class="time">${new Date(msg.timestamp).toLocaleTimeString('tr-TR')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function filterActivity(filter) {
  currentFilter = filter;

  // Task filtresini temizle (eğer "Tümü" veya "Bugün" seçilirse)
  if (filter !== 'task') {
    currentTaskFilter = null;
  }

  // Buton durumlarını güncelle
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  renderActivityTimeline();
  renderPMConversations();
}

// Göreve göre filtrele
window.filterActivityByTask = function(taskId) {
  currentTaskFilter = taskId;
  currentFilter = 'task';

  // Buton durumlarını güncelle
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    // "Görevlere Göre" veya "Göreve Göre" butonunu aktif et
    if (btn.textContent.includes('Görev')) {
      btn.classList.add('active');
    }
  });

  renderActivityTimeline();
  renderPMConversations();
}

// Socket event listeners için
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const checkInterval = setInterval(() => {
      if (window.socket) {
        clearInterval(checkInterval);

        // Activity log için socket listeners
        window.socket.on('workspace:created', (ws) => {
          addActivityLog('workspace', `📁 "${ws.name}" projesi oluşturuldu`);
        });

        window.socket.on('agent:created', (agent) => {
          addActivityLog('agent', `👤 ${agent.name} (${agent.role}) havuza eklendi`);
          renderAgentStatus();
        });

        window.socket.on('agent:updated', (agent) => {
          // window.agents'ı güncelle
          if (window.agents) {
            const index = window.agents.findIndex(a => a.id === agent.id);
            if (index !== -1) {
              window.agents[index] = agent;
            } else {
              console.warn('⚠️ Agent bulunamadı:', agent.id);
            }
          } else {
            console.warn('⚠️ window.agents tanımlı değil!');
          }

          renderAgentStatus();

          if (agent.status === 'working') {
            const workspaces = window.workspaces || [];
            const ws = workspaces.find(w => w.id === agent.currentWorkspace);
            addActivityLog('agent', `🚀 ${agent.name} → "${ws?.name}" projesinde çalışmaya başladı`);
          } else if (agent.status === 'idle') {
            addActivityLog('agent', `✅ ${agent.name} görevi tamamladı`);
          }
        });

        window.socket.on('pm:task-received', (data) => {
          addActivityLog('pm', data.message);

          // Task için conversation başlat
          if (!pmConversations[data.taskId]) {
            pmConversations[data.taskId] = {
              taskName: data.message.match(/'([^']+)'/)?.[1] || `Görev ${data.taskId.slice(-4)}`,
              messages: []
            };
          }
        });

        window.socket.on('pm:message', (data) => {
          const taskId = data.taskId || Date.now().toString();
          const taskName = data.task || `Görev ${taskId.slice(-4)}`;
          const from = data.from || 'PM';
          addPMConversation(taskId, taskName, from, data.message);
          addActivityLog('pm', `💬 ${from} → ${data.to || 'Takım'}: ${data.message.substring(0, 50)}...`, { taskId });
        });

        window.socket.on('agent:log', (data) => {
          const agents = window.agents || [];
          const agent = agents.find(a => a.id === data.agentId);
          if (agent) {
            addActivityLog('agent', `📝 ${agent.name}: ${data.message}`, { taskId: data.taskId });
          }
        });
      }
    }, 100);
  });
}
