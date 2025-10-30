import * as storage from './storage.js';
import * as routing from './routing.js';
import * as boardInteractions from './boardInteractions.js';
import * as trade from './trade.js';
import * as modals from './modals.js';
import * as screens from './screens.js';
import * as lobby from './lobby.js';
import * as awards from './awards.js';
import * as devCards from './devCards.js';
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
  {
    updateGameUI,
    updateScoreboard,
    showConnectionStatus,
    setupSocketListeners,
    setupUIListeners
  }
);

export default GameClient;
