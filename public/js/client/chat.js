// Chat functionality
export function setupChatListeners() {
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');

  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    if (!this.gameId) {
      console.error('Cannot send chat message: not in a game');
      return;
    }

    this.socket.emit('chatMessage', {
      gameId: this.gameId,
      message: message
    });

    chatInput.value = '';
  };

  sendChatBtn.addEventListener('click', sendMessage);

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
}

export function handleChatMessage(data) {
  const chatMessages = document.getElementById('chatMessages');
  const noMessages = chatMessages.querySelector('.no-messages');

  // Remove "no messages" text if it exists
  if (noMessages) {
    noMessages.remove();
  }

  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';

  // Check if this is our own message
  if (data.playerId === this.playerId) {
    messageEl.classList.add('own-message');
  }

  const authorEl = document.createElement('div');
  authorEl.className = 'chat-message-author';

  // Color code by player color if available
  const player = this.gameState?.players.find(p => p.id === data.playerId);
  if (player && player.color) {
    authorEl.style.color = player.color;
  }
  authorEl.textContent = data.playerName;

  const textEl = document.createElement('div');
  textEl.className = 'chat-message-text';
  textEl.textContent = data.message;

  messageEl.appendChild(authorEl);
  messageEl.appendChild(textEl);

  chatMessages.appendChild(messageEl);

  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Limit to last 50 messages to prevent memory issues
  const messages = chatMessages.querySelectorAll('.chat-message');
  if (messages.length > 50) {
    messages[0].remove();
  }
}

export function clearChatMessages() {
  const chatMessages = document.getElementById('chatMessages');
  chatMessages.innerHTML = '<p class="no-messages">No messages yet</p>';
}

export function loadChatHistory() {
  if (!this.gameState || !this.gameState.chatMessages) return;

  const chatMessages = document.getElementById('chatMessages');
  const noMessages = chatMessages.querySelector('.no-messages');

  // Clear existing messages
  if (noMessages) {
    noMessages.remove();
  } else {
    chatMessages.innerHTML = '';
  }

  // Load all chat messages from game state
  this.gameState.chatMessages.forEach(msg => {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';

    // Check if this is our own message
    if (msg.playerId === this.playerId) {
      messageEl.classList.add('own-message');
    }

    const authorEl = document.createElement('div');
    authorEl.className = 'chat-message-author';

    // Color code by player color if available
    const player = this.gameState?.players.find(p => p.id === msg.playerId);
    if (player && player.color) {
      authorEl.style.color = player.color;
    }
    authorEl.textContent = msg.playerName;

    const textEl = document.createElement('div');
    textEl.className = 'chat-message-text';
    textEl.textContent = msg.message;

    messageEl.appendChild(authorEl);
    messageEl.appendChild(textEl);

    chatMessages.appendChild(messageEl);
  });

  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
