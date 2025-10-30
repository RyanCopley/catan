// Auto-generated split from client.js
import { showInfoToast, showErrorToast } from '../modules/toast.js';
export function setupSocketListeners() {
  this.socket.on('connect', () => {
    console.log('Connected to server');
    this.showConnectionStatus('connected');

    // Auto-rejoin game if we were in one
    if (this.gameId && this.playerName && this.playerPassword) {
      console.log('Reconnecting to game:', this.gameId);
      this.socket.emit('joinGame', { gameId: this.gameId, playerName: this.playerName, password: this.playerPassword });
    } else {
      // Request open games list and history if on main menu
      this.socket.emit('getOpenGames');
      this.socket.emit('getGameHistory');
    }
  });

  this.socket.on('openGamesList', (data) => {
    this.updateOpenGamesList(data.games);
  });

  this.socket.on('gameHistory', (data) => {
    console.log('Received game history:', data.history);
    this.updateGameHistory(data.history);
  });

  this.socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    this.showConnectionStatus('disconnected');
  });

  this.socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('Reconnection attempt:', attemptNumber);
    this.showConnectionStatus('reconnecting', attemptNumber);
  });

  this.socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    this.showConnectionStatus('connected');
  });

  this.socket.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error);
  });

  this.socket.on('reconnect_failed', () => {
    console.error('Failed to reconnect');
    this.showConnectionStatus('failed');
  });

  this.socket.on('gameCreated', (data) => {
    this.gameId = data.gameId;
    this.playerId = data.playerId;
    this.gameState = data.game;
    this.awardsInitialized = false;
    this.hasRolledDice = false;
    this.resetDiceDisplay();
    this.updateDiceVisibility();
    this.updateUrl();
    this.showLobby();
  });

  this.socket.on('spectateJoined', (data) => {
    this.gameId = data.gameId;
    this.playerId = null; // Spectators don't have a player ID
    this.gameState = data.game;
    this.awardsInitialized = false;
    this.isSpectator = true;

    // Show game screen
    if (this.gameState.phase === 'setup' || this.gameState.phase === 'playing') {
      this.showGame();
      this.updateGameUI();
    } else {
      this.showLobby();
    }

    showInfoToast('You are spectating this game');
  });

  this.socket.on('gameJoined', (data) => {
    this.gameId = data.gameId;
    this.playerId = data.playerId;
    this.gameState = data.game;
    this.awardsInitialized = false;
    const lastDiceResult = this.gameState?.lastDiceResult ?? null;
    if (lastDiceResult) {
      this.hasRolledDice = true;
      this.applyDiceResult(lastDiceResult);
    } else if (this.gameState && this.gameState.diceRoll !== null) {
      this.hasRolledDice = true;
      this.applyDiceResult({ die1: null, die2: null, total: this.gameState.diceRoll });
    } else {
      this.hasRolledDice = false;
      this.resetDiceDisplay();
    }
    this.updateDiceVisibility();
    this.updateUrl();

    // Show appropriate screen based on game phase
    if (this.gameState.phase === 'waiting') {
      this.showLobby();
    } else if (this.gameState.phase === 'setup' || this.gameState.phase === 'playing') {
      this.showGame();
      this.updateGameUI();

      // Check if we need to show discard modal after reconnecting
      const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
      if (myPlayer && myPlayer.mustDiscard > 0) {
        this.showDiscardModal(myPlayer.mustDiscard, myPlayer.resources);
      }
    }
  });

  this.socket.on('playerJoined', (data) => {
    this.gameState = data.game;
    this.updateLobby();
  });

  this.socket.on('playerLeft', (data) => {
    if (!this.gameId || data.game.id !== this.gameId) return;
    this.gameState = data.game;
    this.updateLobby();
  });

  this.socket.on('playerReadyChanged', (data) => {
    this.gameState = data.game;
    this.updateLobby();
  });

  this.socket.on('playerReconnected', (data) => {
    this.gameState = data.game;
    const lastDiceResult = this.gameState?.lastDiceResult ?? null;
    if (lastDiceResult) {
      this.hasRolledDice = true;
      this.applyDiceResult(lastDiceResult);
    } else if (this.gameState && this.gameState.diceRoll !== null) {
      this.hasRolledDice = true;
      this.applyDiceResult({ die1: null, die2: null, total: this.gameState.diceRoll });
    }
    this.updateDiceVisibility();
    if (this.gameState.phase === 'waiting') {
      this.updateLobby();
    } else if (this.gameState.phase === 'setup') {
      this.updateLobby();
      // Also update scoreboard during setup phase
      this.updateScoreboard();
    } else {
      this.updateGameUI();
      if (this.renderer) {
        this.renderer.addLogMessage(`${data.playerName} reconnected`);
      }
    }
  });

  this.socket.on('gameStarted', (data) => {
    this.gameState = data.game;
    this.awardsInitialized = false;
    this.hasRolledDice = false;
    this.resetDiceDisplay();
    this.showGame();
    this.updateGameUI();
    this.renderer.addLogMessage('Game started!');
  });

  this.socket.on('diceRolled', (data) => {
    var audio = new Audio('sounds/dice-roll.mp3');
    audio.volume = 0.2;
    audio.play();

    this.gameState = data.game;
    this.hasRolledDice = true;
    const result = data.diceResult;

    this.applyDiceResult(result);
    this.updateDiceVisibility();

    this.renderer.addLogMessage(`Dice rolled: ${result.total}`);

    // Check if we need to discard
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    if (myPlayer && myPlayer.mustDiscard > 0) {
      this.showDiscardModal(myPlayer.mustDiscard, myPlayer.resources);
    }

    this.renderer.setRoll(result.total);
    this.updateGameUI();

  });

  this.socket.on('cardsDiscarded', (data) => {
    this.gameState = data.game;
    const player = this.gameState.players.find(p => p.id === data.playerId);
    this.renderer.addLogMessage(`${player.name} discarded cards`);
    this.updateGameUI();
  });

  this.socket.on('robberMoved', (data) => {
    this.gameState = data.game;
    this.renderer.setBoard(this.gameState.board);
    this.renderer.clearBuildMode();

    // If I'm the current player and there are stealable targets, show steal modal
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (currentPlayer.id === this.playerId && data.stealableTargets.length > 0) {
      this.showStealModal(data.stealableTargets);
    } else if (currentPlayer.id === this.playerId && data.stealableTargets.length === 0) {
      // No one to steal from, auto-complete by calling stealCard with null
      this.renderer.addLogMessage('Robber moved, but no one to steal from');
      this.socket.emit('stealCard', { gameId: this.gameId, targetPlayerId: null });
    } else {
      this.renderer.addLogMessage(`${currentPlayer.name} moved the robber`);
    }

    this.updateGameUI();
  });

  this.socket.on('cardStolen', (data) => {
    this.gameState = data.game;
    const robber = this.gameState.players.find(p => p.id === data.robberId);
    const target = this.gameState.players.find(p => p.id === data.targetPlayerId);

    if (data.stolenResource) {
      if (data.robberId === this.playerId) {
        this.renderer.addLogMessage(`You stole a ${data.stolenResource} from ${target.name}`);
      } else if (data.targetPlayerId === this.playerId) {
        this.renderer.addLogMessage(`${robber.name} stole a ${data.stolenResource} from you`);
      } else {
        this.renderer.addLogMessage(`${robber.name} stole a card from ${target.name}`);
      }
    } else if (target) {
      this.renderer.addLogMessage(`${robber.name} couldn't steal from ${target.name} (no cards)`);
    }

    this.closeStealModal();
    this.endKnightMode(); // Clear knight banner if it was from playing a knight card
    this.updateGameUI();
  });

  this.socket.on('settlementBuilt', (data) => {
    var audio = new Audio('sounds/build.mp3');
    audio.volume = 0.1;
    audio.play();

    this.gameState = data.game;
    this.renderer.setBoard(this.gameState.board);
    this.renderer.clearBuildMode();
    this.updateGameUI();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    this.renderer.addLogMessage(`${player.name} built a settlement`);
  });

  this.socket.on('roadBuilt', (data) => {
    var audio = new Audio('sounds/build.mp3');
    audio.volume = 0.1;
    audio.play();
    this.gameState = data.game;
    this.renderer.setBoard(this.gameState.board);
    this.renderer.clearBuildMode();
    this.updateGameUI();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    this.renderer.addLogMessage(`${player.name} built a road`);
  });

  this.socket.on('cityBuilt', (data) => {
    var audio = new Audio('sounds/build.mp3');
    audio.volume = 0.1;
    audio.play();
    this.gameState = data.game;
    this.renderer.setBoard(this.gameState.board);
    this.renderer.clearBuildMode();
    this.updateGameUI();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    this.renderer.addLogMessage(`${player.name} built a city`);
  });

  this.socket.on('developmentCardBought', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    const cardNames = {
      knight: 'Knight',
      victoryPoint: 'Victory Point',
      roadBuilding: 'Road Building',
      monopoly: 'Monopoly',
      yearOfPlenty: 'Year of Plenty'
    };
    this.renderer.addLogMessage(`You bought a ${cardNames[data.cardType]} card!`);
  });

  this.socket.on('developmentCardBoughtByOther', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    this.renderer.addLogMessage(`${data.playerName} bought a development card`);
  });

  this.socket.on('knightPlayed', (data) => {
    this.gameState = data.game;
    this.renderer.setBoard(this.gameState.board);
    this.updateGameUI();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    this.renderer.addLogMessage(`${player.name} played a Knight card`);
    this.endKnightMode();

    // If I'm the current player and there are stealable targets, show steal modal
    if (data.playerId === this.playerId && data.stealableTargets.length > 0) {
      this.showStealModal(data.stealableTargets);
    } else if (data.playerId === this.playerId && data.stealableTargets.length === 0) {
      // No one to steal from
      this.renderer.addLogMessage('Robber moved, but no one to steal from');
      this.socket.emit('stealCard', { gameId: this.gameId, targetPlayerId: null });
    }
  });

  this.socket.on('yearOfPlentyPlayed', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    this.renderer.addLogMessage(`${data.playerName} played Year of Plenty and took ${data.resource1} and ${data.resource2}`);
  });

  this.socket.on('monopolyPlayed', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    this.renderer.addLogMessage(`${data.playerName} played Monopoly and took all ${data.resource} (${data.totalTaken} total)`);
  });

  this.socket.on('roadBuildingPlayed', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    this.renderer.addLogMessage(`${data.playerName} played Road Building - can build 2 free roads`);

    // Show notice if it's the player who played the card
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    if (myPlayer && myPlayer.freeRoads > 0) {
      document.getElementById('roadBuildingNotice').style.display = 'block';
      document.getElementById('freeRoadsRemaining').textContent = myPlayer.freeRoads;
    }
  });

  this.socket.on('roadBuiltFree', (data) => {
    this.gameState = data.game;
    this.renderer.setBoard(this.gameState.board);
    this.updateGameUI();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    if (myPlayer && myPlayer.freeRoads > 0) {
      this.renderer.addLogMessage(`${player.name} built a free road (${myPlayer.freeRoads} remaining)`);
      document.getElementById('freeRoadsRemaining').textContent = myPlayer.freeRoads;
    } else {
      this.renderer.addLogMessage(`${player.name} built a free road`);
      document.getElementById('roadBuildingNotice').style.display = 'none';
    }
  });

  this.socket.on('turnEnded', (data) => {
    this.gameState = data.game;
    this.endKnightMode(); // Clear knight banner when turn ends
    this.updateGameUI();
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (currentPlayer.id === this.playerId) {

      var audio = new Audio('sounds/your-turn.mp3');
      audio.volume = 0.05;
      audio.play();

    }


    this.renderer.addLogMessage(`${currentPlayer.name}'s turn`);
  });

  this.socket.on('playerDisconnected', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    if (player) {
      this.renderer.addLogMessage(`${player.name} disconnected`);
    } else {
      this.renderer.addLogMessage('A player disconnected');
    }
  });

  this.socket.on('tradeOffered', (data) => {
    this.gameState = data.game;
    this.updateTradeOffers();
    const offeringPlayer = this.gameState.players.find(p => p.id === data.offer.offeringPlayerId);
    this.renderer.addLogMessage(`${offeringPlayer.name} created a trade offer`);
  });

  this.socket.on('tradeResponseUpdated', (data) => {
    this.gameState = data.game;
    this.updateTradeOffers();
    const player = this.gameState.players.find(p => p.id === data.playerId);
    const responseText = data.response === 'accepted' ? 'accepted' : 'rejected';
    this.renderer.addLogMessage(`${player.name} ${responseText} a trade offer`);
  });

  this.socket.on('tradeExecuted', (data) => {
    this.gameState = data.game;
    this.cleanupHiddenOffers();
    this.updateGameUI();
    this.updateTradeOffers();
    this.renderer.addLogMessage(`Trade completed between ${data.offeringPlayer} and ${data.acceptingPlayer}`);
  });

  this.socket.on('tradeCancelled', (data) => {
    this.gameState = data.game;
    this.cleanupHiddenOffers();
    this.updateTradeOffers();
    this.renderer.addLogMessage('A trade offer was cancelled');
  });

  this.socket.on('bankTradeExecuted', (data) => {
    this.gameState = data.game;
    this.updateGameUI();
    const tradeMsg = `${data.playerName} traded ${data.gaveAmount} ${data.gave} for 1 ${data.received} with the bank (${data.tradeRate})`;
    this.renderer.addLogMessage(tradeMsg);
  });

  this.socket.on('error', (data) => {
    showErrorToast(data.message || 'An unexpected error occurred');
    this.renderer.clearBuildMode();
  });
}
