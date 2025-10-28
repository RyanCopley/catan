let socket;
let currentEditingGameId = null;
let metricsInterval = null;
let latencyInterval = null;
let latestSocketLatency = null;
let latestMetrics = null;

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
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'N/A';
  }

  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(' ');
}

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) {
    return 'Calculating...';
  }

  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatLatencyValue(latency) {
  if (!Number.isFinite(latency) || latency < 0) {
    return '—';
  }

  return `${Math.round(latency)} ms`;
}

function renderNetworkMetrics() {
  const container = document.getElementById('networkMetrics');
  if (!container) {
    return;
  }

  const metrics = latestMetrics;
  const network = metrics?.network ?? null;

  const cards = [];

  if (network) {
    const receiveRateText = network.receiveRate != null ? formatRate(network.receiveRate) : 'Calculating...';
    const sendRateText = network.sendRate != null ? formatRate(network.sendRate) : 'Calculating...';
    const sampledAt = network.lastSampledAt ? new Date(network.lastSampledAt).toLocaleTimeString() : null;

    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Network Usage</div>
        <div class="metric-value">${receiveRateText} ↓</div>
        <div class="metric-subtext">
          Upload: ${sendRateText} ↑<br>
          Total Down: ${formatBytes(network.bytesReceived)} · Total Up: ${formatBytes(network.bytesSent)}${sampledAt ? `<br>Sampled ${sampledAt}` : ''}
        </div>
      </div>
    `);
  }

  const latencySubtitle = (() => {
    if (!socket || socket.disconnected) {
      return 'Socket disconnected';
    }
    if (latestSocketLatency == null) {
      return 'Measuring latency...';
    }
    return `Connected as ${socket.id} · Round trip to server`;
  })();

  cards.push(`
    <div class="metric-card">
      <div class="metric-title">WebSocket Latency</div>
      <div class="metric-value">${formatLatencyValue(latestSocketLatency)}</div>
      <div class="metric-subtext">${latencySubtitle}</div>
    </div>
  `);

  const statusMessage = (() => {
    if (!metrics) {
      return '<div class="network-empty">Collecting network metrics...</div>';
    }
    if (!network) {
      return '<div class="network-empty">Network usage metrics unavailable on this system.</div>';
    }
    return '';
  })();

  container.innerHTML = `
    ${statusMessage}
    <div class="network-grid">
      ${cards.join('')}
    </div>
  `;
}

function startLatencyMonitoring() {
  if (!socket) {
    return;
  }

  if (latencyInterval) {
    clearInterval(latencyInterval);
  }

  measureSocketLatency();
  latencyInterval = setInterval(measureSocketLatency, 10000);
}

function stopLatencyMonitoring() {
  if (latencyInterval) {
    clearInterval(latencyInterval);
    latencyInterval = null;
  }
}

function measureSocketLatency() {
  if (!socket || socket.disconnected) {
    latestSocketLatency = null;
    renderNetworkMetrics();
    return;
  }

  latestSocketLatency = null;
  renderNetworkMetrics();

  const start = performance.now();
  let settled = false;

  const timeoutId = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    latestSocketLatency = null;
    renderNetworkMetrics();
  }, 5000);

  socket.emit('admin:ping', () => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeoutId);
    latestSocketLatency = Math.round(performance.now() - start);
    renderNetworkMetrics();
  });
}

function startMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }

  fetchSystemMetrics();
  metricsInterval = setInterval(fetchSystemMetrics, 10000);
}

function stopMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

async function fetchSystemMetrics() {
  const statusEl = document.getElementById('metricsStatus');
  const errorEl = document.getElementById('metricsError');

  if (statusEl) {
    statusEl.textContent = 'Updating server metrics...';
  }

  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  try {
    const response = await fetch('/admin/system/metrics');

    if (response.status === 401) {
      stopMetricsPolling();
      showLoginScreen();
      return;
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    renderSystemMetrics(data.metrics);

    if (statusEl) {
      const generatedAt = data.metrics?.generatedAt ? new Date(data.metrics.generatedAt) : new Date();
      const isValidDate = !Number.isNaN(generatedAt.getTime());
      const formattedTime = isValidDate ? generatedAt.toLocaleTimeString() : 'just now';
      const uptime = formatDuration(data.metrics?.uptimeSeconds ?? 0);
      statusEl.textContent = `Last updated ${formattedTime} · Uptime ${uptime}`;
    }
  } catch (error) {
    console.error('Failed to load system metrics:', error);
    if (statusEl) {
      statusEl.textContent = 'Unable to refresh server metrics';
    }
    if (errorEl) {
      errorEl.textContent = 'Unable to load server metrics. Please try again later.';
      errorEl.style.display = 'block';
    }
  }
}

function renderSystemMetrics(metrics) {
  const metricsContainer = document.getElementById('systemMetrics');
  const errorEl = document.getElementById('metricsError');

  if (!metricsContainer) {
    return;
  }

  latestMetrics = metrics;

  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  const totalSystem = metrics?.memory?.totalSystem ?? 0;
  const usedSystem = metrics?.memory?.usedSystem ?? 0;
  const freeSystem = metrics?.memory?.freeSystem ?? 0;
  const systemUsagePercent = totalSystem ? Math.min((usedSystem / totalSystem) * 100, 100) : 0;
  const processRss = metrics?.processMemory?.rss ?? 0;
  const processHeapUsed = metrics?.processMemory?.heapUsed ?? 0;
  const processHeapTotal = metrics?.processMemory?.heapTotal ?? 0;
  const processExternal = metrics?.processMemory?.external ?? 0;
  const loadAverage = metrics?.cpu?.loadAverage ?? [];
  const loadOne = loadAverage[0] ?? 0;
  const loadFive = loadAverage[1] ?? 0;
  const loadFifteen = loadAverage[2] ?? 0;
  const cpuCores = metrics?.cpu?.coreCount ?? 0;
  const cpuModel = metrics?.cpu?.model ?? '';
  const uptimeSeconds = metrics?.uptimeSeconds ?? 0;
  const nodeVersion = metrics?.nodeVersion ?? 'unknown';
  const pid = metrics?.pid ?? '—';
  const platform = metrics?.platform ?? '';

  metricsContainer.innerHTML = `
    <div class="metric-card">
      <div class="metric-title">CPU Load</div>
      <div class="metric-value">${loadOne.toFixed(2)}</div>
      <div class="metric-subtext">
        5m: ${loadFive.toFixed(2)} · 15m: ${loadFifteen.toFixed(2)}<br>
        Cores: ${cpuCores}${cpuModel ? ` · ${cpuModel}` : ''}
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-title">System Memory</div>
      <div class="metric-value">${formatBytes(usedSystem)} / ${formatBytes(totalSystem)}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${systemUsagePercent.toFixed(0)}%"></div>
      </div>
      <div class="metric-subtext">${systemUsagePercent.toFixed(1)}% used · ${formatBytes(freeSystem)} free</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Process Memory (RSS)</div>
      <div class="metric-value">${formatBytes(processRss)}</div>
      <div class="metric-subtext">
        Heap: ${formatBytes(processHeapUsed)} / ${formatBytes(processHeapTotal)}<br>
        External: ${formatBytes(processExternal)}
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Runtime</div>
      <div class="metric-value">${formatDuration(uptimeSeconds)}</div>
      <div class="metric-subtext">Node ${nodeVersion} · PID ${pid}${platform ? ` · ${platform}` : ''}</div>
    </div>
  `;

  renderNetworkMetrics();
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
  stopMetricsPolling();
  stopLatencyMonitoring();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  latestMetrics = null;
  latestSocketLatency = null;
  renderNetworkMetrics();
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  startMetricsPolling();
  renderNetworkMetrics();
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
    showLoginScreen();
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function initializeSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on('connect', () => {
    console.log('Admin socket connected');
    startLatencyMonitoring();
    renderNetworkMetrics();
  });

  socket.on('disconnect', () => {
    console.log('Admin socket disconnected');
    stopLatencyMonitoring();
    latestSocketLatency = null;
    renderNetworkMetrics();
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
