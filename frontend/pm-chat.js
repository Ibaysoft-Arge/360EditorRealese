// PM Chat Widget
let pmChatOpen = false;
let pmChatMinimized = false;
let unreadPMMessages = 0;

function togglePMChat() {
  const widget = document.getElementById('pmChatWidget');
  const toggle = document.getElementById('pmChatToggle');

  pmChatOpen = !pmChatOpen;

  if (pmChatOpen) {
    // İlk açılışta HTML'i oluştur
    if (!widget.innerHTML || widget.innerHTML.trim() === '') {
      initPMChat();
    }

    widget.classList.remove('hidden');
    toggle.classList.add('hidden');
    unreadPMMessages = 0;
    updatePMBadge();
  } else {
    widget.classList.add('hidden');
    toggle.classList.remove('hidden');
  }
}

function closePMChat() {
  document.getElementById('pmChatWidget').classList.add('hidden');
  document.getElementById('pmChatToggle').classList.remove('hidden');
  pmChatOpen = false;
}

function minimizePMChat() {
  const widget = document.getElementById('pmChatWidget');
  pmChatMinimized = !pmChatMinimized;

  if (pmChatMinimized) {
    widget.classList.add('minimized');
  } else {
    widget.classList.remove('minimized');
  }
}

function initPMChat() {
  const messagesContainer = document.getElementById('pmChatWidget');
  messagesContainer.innerHTML = `
    <div class="pm-chat-header">
      <div class="pm-chat-title">
        <span>💬 PM ile Chat</span>
        <span class="pm-status">Online</span>
      </div>
      <div class="pm-chat-controls">
        <button class="btn-icon" onclick="minimizePMChat()">−</button>
        <button class="btn-icon" onclick="closePMChat()">✕</button>
      </div>
    </div>

    <div class="pm-chat-messages" id="pmChatMessages">
      <div class="pm-chat-message system">
        <span class="text">PM hazır. Görev hakkında sorularım olursa soracağım!</span>
      </div>
    </div>

    <div class="pm-chat-input-area">
      <input
        type="text"
        id="pmChatInput"
        placeholder="PM'e mesaj yaz..."
        onkeypress="handlePMChatEnter(event)"
      >
      <button class="btn-send" onclick="sendPMChat()">📤</button>
    </div>
  `;
}

function addPMChatMessage(from, text) {
  const messagesContainer = document.getElementById('pmChatMessages');
  if (!messagesContainer) return;

  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const messageDiv = document.createElement('div');
  messageDiv.className = `pm-chat-message ${from}`;
  messageDiv.innerHTML = `
    <span class="time">${time}</span>
    <span class="text">${text}</span>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // PM mesajı geldi ve pencere kapalıysa badge göster
  if (from === 'pm' && !pmChatOpen) {
    unreadPMMessages++;
    updatePMBadge();
  }
}

function updatePMBadge() {
  const badge = document.getElementById('pmChatBadge');
  if (unreadPMMessages > 0) {
    badge.textContent = unreadPMMessages;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function sendPMChat() {
  const input = document.getElementById('pmChatInput');
  const message = input.value.trim();

  if (!message) return;

  // Kullanıcı mesajını göster
  addPMChatMessage('user', message);

  // Backend'e gönder
  if (window.socket) {
    window.socket.emit('pm:chat-message', { message });
  }

  input.value = '';
}

function handlePMChatEnter(event) {
  if (event.key === 'Enter') {
    sendPMChat();
  }
}

// Socket'ten PM mesajları
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // Socket bağlantısını bekle
    const checkSocket = setInterval(() => {
      if (window.socket) {
        clearInterval(checkSocket);

        window.socket.on('pm:chat-response', (data) => {
          addPMChatMessage('pm', data.message);
        });

        window.socket.on('pm:question', (data) => {
          addPMChatMessage('pm', data.question);
          // Chat'i otomatik aç
          if (!pmChatOpen) {
            togglePMChat();
          }
        });

        // PM message'da da soru olabilir
        window.socket.on('pm:message', (data) => {
          if (data.message && data.message.includes('sorum var')) {
            addPMChatMessage('pm', data.message);
            // Chat'i otomatik aç
            if (!pmChatOpen) {
              togglePMChat();
            }
          }
        });
      }
    }, 100);
  });
}
