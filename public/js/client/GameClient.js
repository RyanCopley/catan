import * as storage from './storage.js';
import * as routing from './routing.js';
import * as boardInteractions from './boardInteractions.js';
import * as trade from './trade.js';
import * as modals from './modals.js';
import * as screens from './screens.js';
import * as lobby from './lobby.js';
import * as awards from './awards.js';
import * as devCards from './devCards.js';
import * as chat from './chat.js';
import { updateGameUI } from './gameUi.js';
import { updateScoreboard } from './scoreboard.js';
import { showConnectionStatus } from './connection.js';
import { setupSocketListeners } from './socketHandlers.js';
import { setupUIListeners } from './uiListeners.js';

class GameClient {
  constructor() {
    // Configure Socket.IO with auto-reconnect settings
    this.socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000
    });
    this.gameId = null;
    this.playerId = null;
    this.gameState = null;
    this.renderer = null;
    this.playerName = '';
    this.playerPassword = '';
    this.hiddenOffers = new Set();
    this.hasRolledDice = false;
    this.isSpectator = false;
    this.gameOverOverlayDismissed = false;
    this.gameOverSoundPlayed = false;
    this.forceGameOverOverlay = false;
    this.resetAwardTracking();
    this.lastResourceCounts = null;

    this.loadPlayerDataFromStorage();
    this.setupSocketListeners();
    this.setupUIListeners();
    this.checkUrlParams();
  }
}

Object.assign(
  GameClient.prototype,
  storage,
  routing,
  boardInteractions,
  trade,
  modals,
  screens,
  lobby,
  awards,
  devCards,
  chat,
  {
    updateGameUI,
    updateScoreboard,
    showConnectionStatus,
    setupSocketListeners,
    setupUIListeners
  }
);

GameClient.prototype.showGameOverOverlay = function showGameOverOverlay({
  title = 'Game Over',
  details = '',
  force = false
} = {}) {
  const overlay = document.getElementById('gameOverOverlay');
  if (!overlay) return;

  if (force) {
    this.forceGameOverOverlay = true;
    this.gameOverOverlayDismissed = false;
  } else if (this.gameOverOverlayDismissed) {
    return;
  }

  const titleEl = document.getElementById('gameOverTitle');
  if (titleEl) {
    titleEl.textContent = title;
  }

  const detailsEl = document.getElementById('gameOverDetails');
  if (detailsEl) {
    if (details) {
      detailsEl.textContent = details;
      detailsEl.style.display = 'block';
    } else {
      detailsEl.textContent = '';
      detailsEl.style.display = 'none';
    }
  }

  overlay.classList.add('visible');
};

GameClient.prototype.hideGameOverOverlay = function hideGameOverOverlay({
  resetDismissed = true,
  resetForce = true
} = {}) {
  const overlay = document.getElementById('gameOverOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
  }
  if (resetForce) {
    this.forceGameOverOverlay = false;
  }
  if (resetDismissed) {
    this.gameOverOverlayDismissed = false;
  }
};

export default GameClient;
