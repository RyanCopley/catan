/**
 * SocketManager - Handles all Socket.IO event listeners and network communication
 */
class SocketManager {
  constructor(gameClient) {
    this.client = gameClient;
    this.socket = gameClient.socket;
  }

  setupListeners() {
    // Connection events
    this.socket.on('connect', () => this.onConnect());
    this.socket.on('disconnect', (reason) => this.onDisconnect(reason));
    this.socket.on('reconnect_attempt', (attemptNumber) => this.onReconnectAttempt(attemptNumber));
    this.socket.on('reconnect', (attemptNumber) => this.onReconnect(attemptNumber));
    this.socket.on('reconnect_error', (error) => this.onReconnectError(error));
    this.socket.on('reconnect_failed', () => this.onReconnectFailed());

    // Game list events
    this.socket.on('openGamesList', (data) => this.client.uiManager.updateOpenGamesList(data.games));
    this.socket.on('gameHistory', (data) => this.client.uiManager.updateGameHistory(data.history));

    // Game lifecycle events
    this.socket.on('gameCreated', (data) => this.onGameCreated(data));
    this.socket.on('spectateJoined', (data) => this.onSpectateJoined(data));
    this.socket.on('gameJoined', (data) => this.onGameJoined(data));
    this.socket.on('playerJoined', (data) => this.onPlayerJoined(data));
    this.socket.on('playerLeft', (data) => this.onPlayerLeft(data));
    this.socket.on('playerReadyChanged', (data) => this.onPlayerReadyChanged(data));
    this.socket.on('playerReconnected', (data) => this.onPlayerReconnected(data));
    this.socket.on('gameStarted', (data) => this.onGameStarted(data));
    this.socket.on('playerDisconnected', (data) => this.onPlayerDisconnected(data));

    // Game action events
    this.socket.on('diceRolled', (data) => this.onDiceRolled(data));
    this.socket.on('cardsDiscarded', (data) => this.onCardsDiscarded(data));
    this.socket.on('robberMoved', (data) => this.onRobberMoved(data));
    this.socket.on('cardStolen', (data) => this.onCardStolen(data));
    this.socket.on('settlementBuilt', (data) => this.onSettlementBuilt(data));
    this.socket.on('roadBuilt', (data) => this.onRoadBuilt(data));
    this.socket.on('cityBuilt', (data) => this.onCityBuilt(data));
    this.socket.on('turnEnded', (data) => this.onTurnEnded(data));

    // Development card events
    this.socket.on('developmentCardBought', (data) => this.onDevelopmentCardBought(data));
    this.socket.on('developmentCardBoughtByOther', (data) => this.onDevelopmentCardBoughtByOther(data));
    this.socket.on('knightPlayed', (data) => this.onKnightPlayed(data));
    this.socket.on('yearOfPlentyPlayed', (data) => this.onYearOfPlentyPlayed(data));
    this.socket.on('monopolyPlayed', (data) => this.onMonopolyPlayed(data));
    this.socket.on('roadBuildingPlayed', (data) => this.onRoadBuildingPlayed(data));
    this.socket.on('roadBuiltFree', (data) => this.onRoadBuiltFree(data));

    // Trade events
    this.socket.on('tradeOffered', (data) => this.onTradeOffered(data));
    this.socket.on('tradeResponseUpdated', (data) => this.onTradeResponseUpdated(data));
    this.socket.on('tradeExecuted', (data) => this.onTradeExecuted(data));
    this.socket.on('tradeCancelled', (data) => this.onTradeCancelled(data));
    this.socket.on('bankTradeExecuted', (data) => this.onBankTradeExecuted(data));

    // Error events
    this.socket.on('error', (data) => this.onError(data));
  }

  // Connection handlers
  onConnect() {
    console.log('Connected to server');
    this.client.uiManager.showConnectionStatus('connected');

    if (this.client.gameId && this.client.playerName && this.client.playerPassword) {
      console.log('Reconnecting to game:', this.client.gameId);
      this.socket.emit('joinGame', {
        gameId: this.client.gameId,
        playerName: this.client.playerName,
        password: this.client.playerPassword
      });
    } else {
      this.socket.emit('getOpenGames');
      this.socket.emit('getGameHistory');
    }
  }

  onDisconnect(reason) {
    console.log('Disconnected from server:', reason);
    this.client.uiManager.showConnectionStatus('disconnected');
  }

  onReconnectAttempt(attemptNumber) {
    console.log('Reconnection attempt:', attemptNumber);
    this.client.uiManager.showConnectionStatus('reconnecting', attemptNumber);
  }

  onReconnect(attemptNumber) {
    console.log('Reconnected after', attemptNumber, 'attempts');
    this.client.uiManager.showConnectionStatus('connected');
  }

  onReconnectError(error) {
    console.error('Reconnection error:', error);
  }

  onReconnectFailed() {
    console.error('Failed to reconnect');
    this.client.uiManager.showConnectionStatus('failed');
  }

  // Game lifecycle handlers
  onGameCreated(data) {
    this.client.gameId = data.gameId;
    this.client.playerId = data.playerId;
    this.client.gameState = data.game;
    this.client.resetAwardTracking();
    this.client.hasRolledDice = false;
    this.client.uiManager.resetDiceDisplay();
    this.client.uiManager.updateDiceVisibility();
    this.client.updateUrl();
    this.client.uiManager.showLobby();
  }

  onSpectateJoined(data) {
    this.client.gameId = data.gameId;
    this.client.playerId = null;
    this.client.gameState = data.game;
    this.client.resetAwardTracking();
    this.client.isSpectator = true;

    if (this.client.gameState.phase === 'setup' || this.client.gameState.phase === 'playing') {
      this.client.uiManager.showGame();
      this.client.uiManager.updateGameUI();
    } else {
      this.client.uiManager.showLobby();
    }

    alert('You are spectating this game');
  }

  onGameJoined(data) {
    this.client.gameId = data.gameId;
    this.client.playerId = data.playerId;
    this.client.gameState = data.game;
    this.client.resetAwardTracking();

    const lastDiceResult = this.client.gameState?.lastDiceResult ?? null;
    if (lastDiceResult) {
      this.client.hasRolledDice = true;
      this.client.uiManager.applyDiceResult(lastDiceResult);
    } else if (this.client.gameState && this.client.gameState.diceRoll !== null) {
      this.client.hasRolledDice = true;
      this.client.uiManager.applyDiceResult({ die1: null, die2: null, total: this.client.gameState.diceRoll });
    } else {
      this.client.hasRolledDice = false;
      this.client.uiManager.resetDiceDisplay();
    }

    this.client.uiManager.updateDiceVisibility();
    this.client.updateUrl();

    if (this.client.gameState.phase === 'waiting') {
      this.client.uiManager.showLobby();
    } else if (this.client.gameState.phase === 'setup' || this.client.gameState.phase === 'playing') {
      this.client.uiManager.showGame();
      this.client.uiManager.updateGameUI();

      const myPlayer = this.client.gameState.players.find(p => p.id === this.client.playerId);
      if (myPlayer && myPlayer.mustDiscard > 0) {
        this.client.modalManager.showDiscardModal(myPlayer.mustDiscard, myPlayer.resources);
      }
    }
  }

  onPlayerJoined(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateLobby();
  }

  onPlayerLeft(data) {
    if (!this.client.gameId || data.game.id !== this.client.gameId) return;
    this.client.gameState = data.game;
    this.client.uiManager.updateLobby();
  }

  onPlayerReadyChanged(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateLobby();
  }

  onPlayerReconnected(data) {
    this.client.gameState = data.game;
    const lastDiceResult = this.client.gameState?.lastDiceResult ?? null;
    if (lastDiceResult) {
      this.client.hasRolledDice = true;
      this.client.uiManager.applyDiceResult(lastDiceResult);
    } else if (this.client.gameState && this.client.gameState.diceRoll !== null) {
      this.client.hasRolledDice = true;
      this.client.uiManager.applyDiceResult({ die1: null, die2: null, total: this.client.gameState.diceRoll });
    }
    this.client.uiManager.updateDiceVisibility();

    if (this.client.gameState.phase === 'waiting') {
      this.client.uiManager.updateLobby();
    } else if (this.client.gameState.phase === 'setup') {
      this.client.uiManager.updateLobby();
      this.client.uiManager.updateScoreboard();
    } else {
      this.client.uiManager.updateGameUI();
      if (this.client.renderer) {
        this.client.renderer.addLogMessage(`${data.playerName} reconnected`);
      }
    }
  }

  onGameStarted(data) {
    this.client.gameState = data.game;
    this.client.resetAwardTracking();
    this.client.hasRolledDice = false;
    this.client.uiManager.resetDiceDisplay();
    this.client.uiManager.showGame();
    this.client.uiManager.updateGameUI();
    this.client.renderer.addLogMessage('Game started!');
  }

  onPlayerDisconnected(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    if (player) {
      this.client.renderer.addLogMessage(`${player.name} disconnected`);
    } else {
      this.client.renderer.addLogMessage('A player disconnected');
    }
  }

  // Game action handlers
  onDiceRolled(data) {
    const audio = new Audio('sounds/dice-roll.mp3');
    audio.volume = 0.2;
    audio.play();

    this.client.gameState = data.game;
    this.client.hasRolledDice = true;
    const result = data.diceResult;

    this.client.uiManager.applyDiceResult(result);
    this.client.uiManager.updateDiceVisibility();

    this.client.renderer.addLogMessage(`Dice rolled: ${result.total}`);

    const myPlayer = this.client.gameState.players.find(p => p.id === this.client.playerId);
    if (myPlayer && myPlayer.mustDiscard > 0) {
      this.client.modalManager.showDiscardModal(myPlayer.mustDiscard, myPlayer.resources);
    }

    this.client.renderer.setRoll(result.total);
    this.client.uiManager.updateGameUI();
  }

  onCardsDiscarded(data) {
    this.client.gameState = data.game;
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    this.client.renderer.addLogMessage(`${player.name} discarded cards`);
    this.client.uiManager.updateGameUI();
  }

  onRobberMoved(data) {
    this.client.gameState = data.game;
    this.client.renderer.setBoard(this.client.gameState.board);
    this.client.renderer.clearBuildMode();

    const currentPlayer = this.client.gameState.players[this.client.gameState.currentPlayerIndex];
    if (currentPlayer.id === this.client.playerId && data.stealableTargets.length > 0) {
      this.client.modalManager.showStealModal(data.stealableTargets);
    } else if (currentPlayer.id === this.client.playerId && data.stealableTargets.length === 0) {
      this.client.renderer.addLogMessage('Robber moved, but no one to steal from');
      this.socket.emit('stealCard', { gameId: this.client.gameId, targetPlayerId: null });
    } else {
      this.client.renderer.addLogMessage(`${currentPlayer.name} moved the robber`);
    }

    this.client.uiManager.updateGameUI();
  }

  onCardStolen(data) {
    this.client.gameState = data.game;
    const robber = this.client.gameState.players.find(p => p.id === data.robberId);
    const target = this.client.gameState.players.find(p => p.id === data.targetPlayerId);

    if (data.stolenResource) {
      if (data.robberId === this.client.playerId) {
        this.client.renderer.addLogMessage(`You stole a ${data.stolenResource} from ${target.name}`);
      } else if (data.targetPlayerId === this.client.playerId) {
        this.client.renderer.addLogMessage(`${robber.name} stole a ${data.stolenResource} from you`);
      } else {
        this.client.renderer.addLogMessage(`${robber.name} stole a card from ${target.name}`);
      }
    } else if (target) {
      this.client.renderer.addLogMessage(`${robber.name} couldn't steal from ${target.name} (no cards)`);
    }

    this.client.modalManager.closeStealModal();
    this.client.endKnightMode();
    this.client.uiManager.updateGameUI();
  }

  onSettlementBuilt(data) {
    const audio = new Audio('sounds/build.mp3');
    audio.volume = 0.1;
    audio.play();

    this.client.gameState = data.game;
    this.client.renderer.setBoard(this.client.gameState.board);
    this.client.renderer.clearBuildMode();
    this.client.uiManager.updateGameUI();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    this.client.renderer.addLogMessage(`${player.name} built a settlement`);
  }

  onRoadBuilt(data) {
    const audio = new Audio('sounds/build.mp3');
    audio.volume = 0.1;
    audio.play();

    this.client.gameState = data.game;
    this.client.renderer.setBoard(this.client.gameState.board);
    this.client.renderer.clearBuildMode();
    this.client.uiManager.updateGameUI();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    this.client.renderer.addLogMessage(`${player.name} built a road`);
  }

  onCityBuilt(data) {
    const audio = new Audio('sounds/build.mp3');
    audio.volume = 0.1;
    audio.play();

    this.client.gameState = data.game;
    this.client.renderer.setBoard(this.client.gameState.board);
    this.client.renderer.clearBuildMode();
    this.client.uiManager.updateGameUI();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    this.client.renderer.addLogMessage(`${player.name} built a city`);
  }

  onTurnEnded(data) {
    this.client.gameState = data.game;
    this.client.endKnightMode();
    this.client.uiManager.updateGameUI();
    const currentPlayer = this.client.gameState.players[this.client.gameState.currentPlayerIndex];

    if (currentPlayer.id === this.client.playerId) {
      const audio = new Audio('sounds/your-turn.mp3');
      audio.volume = 0.05;
      audio.play();
    }

    this.client.renderer.addLogMessage(`${currentPlayer.name}'s turn`);
  }

  // Development card handlers
  onDevelopmentCardBought(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    const cardNames = {
      knight: 'Knight',
      victoryPoint: 'Victory Point',
      roadBuilding: 'Road Building',
      monopoly: 'Monopoly',
      yearOfPlenty: 'Year of Plenty'
    };
    this.client.renderer.addLogMessage(`You bought a ${cardNames[data.cardType]} card!`);
  }

  onDevelopmentCardBoughtByOther(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    this.client.renderer.addLogMessage(`${data.playerName} bought a development card`);
  }

  onKnightPlayed(data) {
    this.client.gameState = data.game;
    this.client.renderer.setBoard(this.client.gameState.board);
    this.client.uiManager.updateGameUI();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    this.client.renderer.addLogMessage(`${player.name} played a Knight card`);
    this.client.endKnightMode();

    if (data.playerId === this.client.playerId && data.stealableTargets.length > 0) {
      this.client.modalManager.showStealModal(data.stealableTargets);
    } else if (data.playerId === this.client.playerId && data.stealableTargets.length === 0) {
      this.client.renderer.addLogMessage('Robber moved, but no one to steal from');
      this.socket.emit('stealCard', { gameId: this.client.gameId, targetPlayerId: null });
    }
  }

  onYearOfPlentyPlayed(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    this.client.renderer.addLogMessage(
      `${data.playerName} played Year of Plenty and took ${data.resource1} and ${data.resource2}`
    );
  }

  onMonopolyPlayed(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    this.client.renderer.addLogMessage(
      `${data.playerName} played Monopoly and took all ${data.resource} (${data.totalTaken} total)`
    );
  }

  onRoadBuildingPlayed(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    this.client.renderer.addLogMessage(`${data.playerName} played Road Building - can build 2 free roads`);

    const myPlayer = this.client.gameState.players.find(p => p.id === this.client.playerId);
    if (myPlayer && myPlayer.freeRoads > 0) {
      document.getElementById('roadBuildingNotice').style.display = 'block';
      document.getElementById('freeRoadsRemaining').textContent = myPlayer.freeRoads;
    }
  }

  onRoadBuiltFree(data) {
    this.client.gameState = data.game;
    this.client.renderer.setBoard(this.client.gameState.board);
    this.client.uiManager.updateGameUI();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    const myPlayer = this.client.gameState.players.find(p => p.id === this.client.playerId);

    if (myPlayer && myPlayer.freeRoads > 0) {
      this.client.renderer.addLogMessage(`${player.name} built a free road (${myPlayer.freeRoads} remaining)`);
      document.getElementById('freeRoadsRemaining').textContent = myPlayer.freeRoads;
    } else {
      this.client.renderer.addLogMessage(`${player.name} built a free road`);
      document.getElementById('roadBuildingNotice').style.display = 'none';
    }
  }

  // Trade handlers
  onTradeOffered(data) {
    this.client.gameState = data.game;
    this.client.tradeManager.updateTradeOffers();
    const offeringPlayer = this.client.gameState.players.find(p => p.id === data.offer.offeringPlayerId);
    this.client.renderer.addLogMessage(`${offeringPlayer.name} created a trade offer`);
  }

  onTradeResponseUpdated(data) {
    this.client.gameState = data.game;
    this.client.tradeManager.updateTradeOffers();
    const player = this.client.gameState.players.find(p => p.id === data.playerId);
    const responseText = data.response === 'accepted' ? 'accepted' : 'rejected';
    this.client.renderer.addLogMessage(`${player.name} ${responseText} a trade offer`);
  }

  onTradeExecuted(data) {
    this.client.gameState = data.game;
    this.client.tradeManager.cleanupHiddenOffers();
    this.client.uiManager.updateGameUI();
    this.client.tradeManager.updateTradeOffers();
    this.client.renderer.addLogMessage(`Trade completed between ${data.offeringPlayer} and ${data.acceptingPlayer}`);
  }

  onTradeCancelled(data) {
    this.client.gameState = data.game;
    this.client.tradeManager.cleanupHiddenOffers();
    this.client.tradeManager.updateTradeOffers();
    this.client.renderer.addLogMessage('A trade offer was cancelled');
  }

  onBankTradeExecuted(data) {
    this.client.gameState = data.game;
    this.client.uiManager.updateGameUI();
    const tradeMsg = `${data.playerName} traded ${data.gaveAmount} ${data.gave} for 1 ${data.received} with the bank (${data.tradeRate})`;
    this.client.renderer.addLogMessage(tradeMsg);
  }

  // Error handler
  onError(data) {
    alert(data.message);
    this.client.renderer.clearBuildMode();
  }
}

// Export for use in main client
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SocketManager;
}
