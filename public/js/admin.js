let socket;
let currentEditingGameId = null;
let metricsInterval = null;

// Helper function to format relative time
function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const totalSeconds = Math.floor(diff / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;
    return `${totalDays}d${hours}h${minutes}m`;
  } else if (totalHours > 0) {
    const minutes = totalMinutes % 60;
    const seconds = totalSeconds % 60;
    return `${totalHours}h${minutes}m${seconds}s`;
  } else if (totalMinutes > 0) {
    const seconds = totalSeconds % 60;
    return `${totalMinutes}m${seconds}s`;
  } else {
    return `${totalSeconds}s`;
  }
}

// Helper function to get activity class for color coding
function getActivityClass(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 10) {
    return 'last-active-recent'; // Green - active within 10 min
  } else if (minutes < 20) {
    return 'last-active-warning'; // Orange - 10-20 min inactive
  } else {
    return 'last-active-stale'; // Red - 20+ min inactive
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return 'N/A';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatPercentage(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  return `${value.toFixed(digits)}%`;
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return 'N/A';
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor((totalSeconds / 3600) % 24);
  const days = Math.floor(totalSeconds / 86400);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || parts.length) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function formatFrequency(mhz) {
  if (!Number.isFinite(mhz)) {
    return 'N/A';
  }

  if (mhz >= 1000) {
    return `${(mhz / 1000).toFixed(2)} GHz`;
  }

  return `${mhz.toFixed(0)} MHz`;
}

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
  stopMetricsPolling();
}

function showAdminPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  startMetricsPolling();
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
    stopMetricsPolling();
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

function startMetricsPolling() {
  stopMetricsPolling();
  fetchServerMetrics();
  metricsInterval = setInterval(fetchServerMetrics, 5000);
}

function stopMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

async function fetchServerMetrics() {
  const container = document.getElementById('serverMetrics');
  if (!container) {
    return;
  }

  try {
    const response = await fetch('/admin/metrics');

    if (response.status === 401) {
      stopMetricsPolling();
      showLoginScreen();
      return;
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    renderServerMetrics(data);
  } catch (error) {
    console.error('Error fetching server metrics:', error);
    container.innerHTML = `
      <div class="metric-card full-width">
        <h3>Server Metrics</h3>
        <div class="metric-subtext">Unable to load metrics. Check server logs for details.</div>
      </div>
    `;
  }
}

function renderServerMetrics(metrics) {
  const container = document.getElementById('serverMetrics');
  if (!container) {
    return;
  }

  const memory = metrics?.memory || {};
  const cpu = metrics?.cpu || {};
  const network = Array.isArray(metrics?.network) ? metrics.network : [];

  const systemMemoryPercent = memory.total ? (memory.used / memory.total) * 100 : NaN;
  const processHeapPercent = memory.heapTotal ? (memory.heapUsed / memory.heapTotal) * 100 : NaN;
  const loadAverage = Array.isArray(cpu.loadAverage) ? cpu.loadAverage : [];
  const cpuPercent = cpu?.usage?.percent;
  const userCpuSeconds = (cpu?.usage?.user ?? 0) / 1_000_000;
  const systemCpuSeconds = (cpu?.usage?.system ?? 0) / 1_000_000;
  const lastUpdated = metrics?.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : 'N/A';

  const loadAverageText = loadAverage
    .slice(0, 3)
    .map(value => (Number.isFinite(value) ? value.toFixed(2) : '0.00'))
    .join(' / ');

  const networkCards = network.length > 0
    ? network.map(interfaceInfo => `
        <div class="network-card">
          <h3>${interfaceInfo.name}</h3>
          ${Array.isArray(interfaceInfo.addresses) && interfaceInfo.addresses.length > 0
            ? interfaceInfo.addresses.map(address => `
              <div class="network-address">
                ${address.family} • ${address.address}
                <span class="metric-metadata">(mask ${address.netmask}${address.mac ? ` • MAC ${address.mac}` : ''})</span>
              </div>
            `).join('')
            : '<div class="metric-subtext">No external addresses</div>'}
        </div>
      `).join('')
    : '<div class="metric-subtext">No external network interfaces detected.</div>';

  container.innerHTML = `
    <div class="metric-card">
      <h3>Memory Usage</h3>
      <div class="metric-value">${formatBytes(memory.used || 0)} / ${formatBytes(memory.total || 0)}</div>
      <div class="metric-subtext">System usage: ${formatPercentage(systemMemoryPercent)}</div>
      <div class="metric-subtext">Process heap: ${formatBytes(memory.heapUsed || 0)} / ${formatBytes(memory.heapTotal || 0)} (${formatPercentage(processHeapPercent)})</div>
      <div class="metric-metadata">RSS ${formatBytes(memory.rss || 0)} • External ${formatBytes(memory.external || 0)}</div>
    </div>
    <div class="metric-card">
      <h3>CPU Load</h3>
      <div class="metric-value">${formatPercentage(cpuPercent)}</div>
      <div class="metric-subtext">Load avg (1m / 5m / 15m): ${loadAverageText}</div>
      <div class="metric-subtext">${cpu.cores || '?'} cores • ${cpu.model || 'Unknown CPU'}</div>
      <div class="metric-metadata">Clock ~ ${formatFrequency(cpu.speed)} • Process time ${userCpuSeconds.toFixed(1)}s user / ${systemCpuSeconds.toFixed(1)}s sys</div>
    </div>
    <div class="metric-card">
      <h3>Uptime</h3>
      <div class="metric-value">${formatDuration(metrics?.uptime)}</div>
      <div class="metric-subtext">Node ${metrics?.nodeVersion || 'N/A'} • ${metrics?.platform || 'unknown'}</div>
      <div class="metric-metadata">Last updated ${lastUpdated}</div>
    </div>
    <div class="metric-card full-width">
      <h3>Network Interfaces</h3>
      <div class="network-list">
        ${networkCards}
      </div>
    </div>
  `;
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
        ${game.phase === 'playing' || game.phase === 'setup' ? `
          <div><strong>Turn:</strong> ${game.players[game.currentPlayerIndex]?.name || 'Unknown'}</div>
          <div><strong>Phase:</strong> ${game.turnPhase}</div>
        ` : ''}
        ${game.phase !== 'waiting' && game.lastActivityAt ? `
          <div><strong>Last active:</strong> <span class="last-active ${getActivityClass(game.lastActivityAt)}">${getRelativeTime(game.lastActivityAt)}</span></div>
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
