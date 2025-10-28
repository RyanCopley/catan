let socket;
let currentEditingGameId = null;

// Check authentication on load
async function checkAuth() {
  try {
    const response = await fetch('/admin/check-auth');
    const data = await response.json();

    if (data.isAuthenticated) {
      showAdminPanel();
      initializeSocket();
      refreshGames();
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');

  errorDiv.textContent = '';

  try {
    const response = await fetch('/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showAdminPanel();
      initializeSocket();
      refreshGames();
    } else {
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
  }
});

async function logout() {
  try {
    await fetch('/admin/logout', { method: 'POST' });
    if (socket) {
      socket.disconnect();
    }
    showLoginScreen();
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function initializeSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Admin socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Admin socket disconnected');
  });
}

async function refreshGames() {
  try {
    const response = await fetch('/admin/games');
    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to fetch games:', data.error);
      return;
    }

    renderGames(data.games);
  } catch (error) {
    console.error('Error fetching games:', error);
  }
}

function renderGames(games) {
  const lobbies = games.filter(g => g.phase === 'waiting');
  const inProgress = games.filter(g => g.phase !== 'waiting');

  renderGameList('lobbiesContainer', lobbies);
  renderGameList('gamesContainer', inProgress);
}

function renderGameList(containerId, games) {
  const container = document.getElementById(containerId);

  if (games.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>No games found</div>
      </div>
    `;
    return;
  }

  container.innerHTML = games.map(game => `
    <div class="game-card">
      <div class="game-card-header">
        <div class="game-id">${game.id}</div>
        <span class="game-phase phase-${game.phase}">${game.phase}</span>
      </div>
      <div class="game-info">
        <div><strong>Players:</strong> ${game.players.length}</div>
        ${game.players.length > 0 ? `
          <ul class="players-list">
            ${game.players.map(p => `
              <li>
                <span style="color: ${p.color}">●</span>
                ${p.name}
                ${game.phase !== 'waiting' ? `(${p.victoryPoints} VP)` : ''}
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${game.phase === 'playing' ? `
          <div><strong>Turn:</strong> ${game.players[game.currentPlayerIndex]?.name || 'Unknown'}</div>
          <div><strong>Phase:</strong> ${game.turnPhase}</div>
        ` : ''}
      </div>
      <div class="game-actions">
        <button class="btn btn-secondary" onclick="spectateGame('${game.id}')">Spectate</button>
        ${game.phase !== 'waiting' ? `
          <button class="btn btn-secondary" onclick="editGameState('${game.id}')">Edit State</button>
        ` : ''}
        <button class="btn btn-danger" onclick="deleteGame('${game.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function spectateGame(gameId) {
  // Open the game in a new tab/window with spectate mode
  window.open(`/?spectate=${gameId}`, '_blank');
}

async function deleteGame(gameId) {
  if (!confirm(`Are you sure you want to delete game ${gameId}?`)) {
    return;
  }

  try {
    const response = await fetch(`/admin/games/${gameId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Server handles notifying game clients
      refreshGames();
    } else {
      alert('Failed to delete game: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error deleting game:', error);
    alert('Network error while deleting game');
  }
}

async function editGameState(gameId) {
  try {
    const response = await fetch(`/admin/games/${gameId}`);
    const data = await response.json();

    if (!response.ok) {
      alert('Failed to load game state: ' + (data.error || 'Unknown error'));
      return;
    }

    currentEditingGameId = gameId;
    document.getElementById('stateEditor').value = JSON.stringify(data.game, null, 2);
    document.getElementById('editorError').textContent = '';
    document.getElementById('editModal').style.display = 'block';
  } catch (error) {
    console.error('Error loading game state:', error);
    alert('Network error while loading game state');
  }
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  currentEditingGameId = null;
  document.getElementById('editorError').textContent = '';
}

async function saveGameState() {
  if (!currentEditingGameId) return;

  const editorError = document.getElementById('editorError');
  editorError.textContent = '';

  let newState;
  try {
    newState = JSON.parse(document.getElementById('stateEditor').value);
  } catch (error) {
    editorError.textContent = 'Invalid JSON: ' + error.message;
    return;
  }

  try {
    const response = await fetch(`/admin/games/${currentEditingGameId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newState)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Server handles resyncing game clients
      closeEditModal();
      refreshGames();
      alert('Game state updated and clients resynced!');
    } else {
      editorError.textContent = 'Failed to save: ' + (data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error saving game state:', error);
    editorError.textContent = 'Network error while saving';
  }
}

// Close modal when clicking outside
document.getElementById('editModal').addEventListener('click', (e) => {
  if (e.target.id === 'editModal') {
    closeEditModal();
  }
});

// Initialize on load
checkAuth();
