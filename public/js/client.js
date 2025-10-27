class GameClient {
  constructor() {
    this.socket = io();
    this.gameId = null;
    this.playerId = null;
    this.gameState = null;
    this.renderer = null;
    this.playerName = '';

    this.setupSocketListeners();
    this.setupUIListeners();
    this.checkUrlParams();
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerName = urlParams.get('name');

    if (gameId && playerName) {
      // Auto-rejoin game from URL params
      this.playerName = playerName;
      document.getElementById('playerName').value = playerName;
      this.socket.emit('joinGame', { gameId, playerName });
    }
  }

  updateUrl() {
    if (this.gameId && this.playerName) {
      const url = new URL(window.location);
      url.searchParams.set('gameId', this.gameId);
      url.searchParams.set('name', this.playerName);
      window.history.pushState({}, '', url);
    }
  }

  setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('gameCreated', (data) => {
      this.gameId = data.gameId;
      this.playerId = data.playerId;
      this.gameState = data.game;
      this.updateUrl();
      this.showLobby();
    });

    this.socket.on('gameJoined', (data) => {
      this.gameId = data.gameId;
      this.playerId = data.playerId;
      this.gameState = data.game;
      this.updateUrl();

      // Show appropriate screen based on game phase
      if (this.gameState.phase === 'waiting') {
        this.showLobby();
      } else if (this.gameState.phase === 'setup' || this.gameState.phase === 'playing') {
        this.showGame();
        this.updateGameUI();
      }
    });

    this.socket.on('playerJoined', (data) => {
      this.gameState = data.game;
      this.updateLobby();
    });

    this.socket.on('playerReconnected', (data) => {
      this.gameState = data.game;
      if (this.gameState.phase === 'waiting' || this.gameState.phase === 'setup') {
        this.updateLobby();
      } else {
        this.updateGameUI();
        if (this.renderer) {
          this.renderer.addLogMessage(`${data.playerName} reconnected`);
        }
      }
    });

    this.socket.on('gameStarted', (data) => {
      this.gameState = data.game;
      this.showGame();
      this.updateGameUI();
      this.renderer.addLogMessage('Game started!');
    });

    this.socket.on('diceRolled', (data) => {
      this.gameState = data.game;
      const result = data.diceResult;
      document.getElementById('diceResult').textContent = `${result.die1} + ${result.die2} = ${result.total}`;
      this.renderer.addLogMessage(`Dice rolled: ${result.total}`);
      this.updateGameUI();
    });

    this.socket.on('settlementBuilt', (data) => {
      this.gameState = data.game;
      this.renderer.setBoard(this.gameState.board);
      this.renderer.clearBuildMode();
      this.updateGameUI();
      const player = this.gameState.players.find(p => p.id === data.playerId);
      this.renderer.addLogMessage(`${player.name} built a settlement`);
    });

    this.socket.on('roadBuilt', (data) => {
      this.gameState = data.game;
      this.renderer.setBoard(this.gameState.board);
      this.renderer.clearBuildMode();
      this.updateGameUI();
      const player = this.gameState.players.find(p => p.id === data.playerId);
      this.renderer.addLogMessage(`${player.name} built a road`);
    });

    this.socket.on('cityBuilt', (data) => {
      this.gameState = data.game;
      this.renderer.setBoard(this.gameState.board);
      this.renderer.clearBuildMode();
      this.updateGameUI();
      const player = this.gameState.players.find(p => p.id === data.playerId);
      this.renderer.addLogMessage(`${player.name} built a city`);
    });

    this.socket.on('turnEnded', (data) => {
      this.gameState = data.game;
      this.updateGameUI();
      const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
      this.renderer.addLogMessage(`${currentPlayer.name}'s turn`);
      document.getElementById('diceResult').textContent = '';
    });

    this.socket.on('playerDisconnected', (data) => {
      this.renderer.addLogMessage('A player disconnected');
    });

    this.socket.on('error', (data) => {
      alert(data.message);
      this.renderer.clearBuildMode();
    });
  }

  setupUIListeners() {
    // Menu screen
    document.getElementById('createGameBtn').addEventListener('click', () => {
      const playerName = document.getElementById('playerName').value.trim();
      if (!playerName) {
        alert('Please enter your name');
        return;
      }
      this.playerName = playerName;
      this.socket.emit('createGame', { playerName });
    });

    document.getElementById('joinGameBtn').addEventListener('click', () => {
      const playerName = document.getElementById('playerName').value.trim();
      const gameId = document.getElementById('gameId').value.trim().toUpperCase();
      if (!playerName || !gameId) {
        alert('Please enter your name and game ID');
        return;
      }
      this.playerName = playerName;
      this.socket.emit('joinGame', { gameId, playerName });
    });

    // Lobby screen
    document.getElementById('startGameBtn').addEventListener('click', () => {
      if (this.gameState.players.length < 2) {
        alert('Need at least 2 players to start');
        return;
      }
      this.socket.emit('startGame', { gameId: this.gameId });
    });

    document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
      this.showMenu();
      this.gameId = null;
      this.playerId = null;
      this.gameState = null;
    });

    // Game screen
    document.getElementById('rollDiceBtn').addEventListener('click', () => {
      this.socket.emit('rollDice', { gameId: this.gameId });
    });

    document.getElementById('buildSettlementBtn').addEventListener('click', () => {
      this.renderer.setBuildMode('settlement');
    });

    document.getElementById('buildRoadBtn').addEventListener('click', () => {
      this.renderer.setBuildMode('road');
    });

    document.getElementById('buildCityBtn').addEventListener('click', () => {
      this.renderer.setBuildMode('city');
    });

    document.getElementById('endTurnBtn').addEventListener('click', () => {
      this.socket.emit('endTurn', { gameId: this.gameId });
      this.renderer.clearBuildMode();
    });

    document.getElementById('tradeBtn').addEventListener('click', () => {
      alert('Trading feature coming soon!');
    });
  }

  handleVertexClick(vertex) {
    if (this.renderer.buildMode === 'settlement') {
      this.socket.emit('buildSettlement', { gameId: this.gameId, vertex });
    } else if (this.renderer.buildMode === 'city') {
      this.socket.emit('buildCity', { gameId: this.gameId, vertex });
    }
  }

  handleEdgeClick(edge) {
    if (this.renderer.buildMode === 'road') {
      this.socket.emit('buildRoad', { gameId: this.gameId, edge });
    }
  }

  showMenu() {
    document.getElementById('menu').classList.add('active');
    document.getElementById('lobby').classList.remove('active');
    document.getElementById('game').classList.remove('active');
  }

  showLobby() {
    document.getElementById('menu').classList.remove('active');
    document.getElementById('lobby').classList.add('active');
    document.getElementById('game').classList.remove('active');
    this.updateLobby();
  }

  showGame() {
    document.getElementById('menu').classList.remove('active');
    document.getElementById('lobby').classList.remove('active');
    document.getElementById('game').classList.add('active');

    // Initialize renderer
    if (!this.renderer) {
      this.renderer = new BoardRenderer('gameBoard');
      window.gameClient = this;
    }

    this.renderer.setBoard(this.gameState.board);
  }

  updateLobby() {
    document.getElementById('lobbyGameId').textContent = this.gameId;

    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    this.gameState.players.forEach(player => {
      const li = document.createElement('li');
      const colorDiv = document.createElement('div');
      colorDiv.className = `player-color color-${player.color}`;
      li.appendChild(colorDiv);
      li.appendChild(document.createTextNode(player.name));
      playersList.appendChild(li);
    });

    // Only show start button to first player
    const startBtn = document.getElementById('startGameBtn');
    if (this.gameState.players[0].id === this.playerId) {
      startBtn.style.display = 'block';
    } else {
      startBtn.style.display = 'none';
    }
  }

  updateGameUI() {
    if (!this.gameState) return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);

    // Update header
    document.getElementById('currentPlayerName').textContent = currentPlayer.name;
    document.getElementById('currentPlayerName').style.color =
      this.renderer.playerColors[currentPlayer.color];

    let phaseText = '';
    if (this.gameState.phase === 'setup') {
      phaseText = `Setup Round ${this.gameState.setupRound} - Place Settlement & Road`;
    } else if (this.gameState.phase === 'playing') {
      phaseText = this.gameState.turnPhase === 'roll' ? 'Roll Dice' : 'Build & Trade';
    }
    document.getElementById('phaseText').textContent = phaseText;

    // Update player info
    if (myPlayer) {
      document.getElementById('playerColor').style.backgroundColor =
        this.renderer.playerColors[myPlayer.color];
      document.getElementById('victoryPoints').querySelector('span').textContent =
        myPlayer.victoryPoints;

      // Update resources
      document.getElementById('wood').textContent = myPlayer.resources.wood;
      document.getElementById('brick').textContent = myPlayer.resources.brick;
      document.getElementById('sheep').textContent = myPlayer.resources.sheep;
      document.getElementById('wheat').textContent = myPlayer.resources.wheat;
      document.getElementById('ore').textContent = myPlayer.resources.ore;
    }

    // Update buttons
    const isMyTurn = currentPlayer.id === this.playerId;
    const isSetup = this.gameState.phase === 'setup';
    const canRoll = isMyTurn && this.gameState.turnPhase === 'roll' && !isSetup;

    let canBuildSettlement = false;
    let canBuildRoad = false;
    let canBuildCity = false;
    let canEndTurn = false;

    if (isSetup && isMyTurn) {
      // During setup, settlement only if not placed yet
      canBuildSettlement = !this.gameState.setupSettlementPlaced;
      // Road only if settlement is placed but road is not
      canBuildRoad = this.gameState.setupSettlementPlaced && !this.gameState.setupRoadPlaced;
      // Can only end turn if both settlement and road are placed
      canEndTurn = this.gameState.setupSettlementPlaced && this.gameState.setupRoadPlaced;
    } else if (!isSetup && isMyTurn && this.gameState.turnPhase === 'build') {
      // Check resources for each building type
      const res = myPlayer.resources;

      // Settlement: 1 wood, 1 brick, 1 sheep, 1 wheat
      canBuildSettlement = res.wood >= 1 && res.brick >= 1 && res.sheep >= 1 && res.wheat >= 1;

      // Road: 1 wood, 1 brick
      canBuildRoad = res.wood >= 1 && res.brick >= 1;

      // City: 2 wheat, 3 ore (also need to have a settlement to upgrade)
      canBuildCity = res.wheat >= 2 && res.ore >= 3 && myPlayer.settlements.length > 0;

      // Can end turn during build phase (dice already rolled)
      canEndTurn = true;
    } else if (!isSetup && isMyTurn && this.gameState.turnPhase === 'roll') {
      // Cannot end turn until dice are rolled
      canEndTurn = false;
    }

    document.getElementById('rollDiceBtn').disabled = !canRoll;
    document.getElementById('buildSettlementBtn').disabled = !canBuildSettlement;
    document.getElementById('buildRoadBtn').disabled = !canBuildRoad;
    document.getElementById('buildCityBtn').disabled = !canBuildCity;
    document.getElementById('tradeBtn').disabled = !(isMyTurn && !isSetup && this.gameState.turnPhase === 'build');
    document.getElementById('endTurnBtn').disabled = !canEndTurn;

    // Update all players status
    const playersStatus = document.getElementById('playersStatus');
    playersStatus.innerHTML = '';

    this.gameState.players.forEach((player, index) => {
      const div = document.createElement('div');
      div.className = 'player-status';
      if (index === this.gameState.currentPlayerIndex) {
        div.classList.add('current-turn');
      }

      const header = document.createElement('div');
      header.className = 'player-status-header';

      const colorDiv = document.createElement('div');
      colorDiv.className = 'player-color';
      colorDiv.style.backgroundColor = this.renderer.playerColors[player.color];
      colorDiv.style.width = '15px';
      colorDiv.style.height = '15px';
      colorDiv.style.borderRadius = '50%';
      colorDiv.style.border = '2px solid #333';

      header.appendChild(colorDiv);
      header.appendChild(document.createTextNode(player.name));

      const info = document.createElement('div');
      info.className = 'player-status-info';
      info.textContent = `VP: ${player.victoryPoints} | Settlements: ${player.settlements.length} | Cities: ${player.cities.length} | Roads: ${player.roads.length}`;

      div.appendChild(header);
      div.appendChild(info);
      playersStatus.appendChild(div);
    });

    // Check for winner
    if (this.gameState.phase === 'finished') {
      const winner = this.gameState.players.find(p => p.victoryPoints >= 10);
      if (winner) {
        setTimeout(() => {
          alert(`${winner.name} wins with ${winner.victoryPoints} victory points!`);
        }, 500);
      }
    }
  }
}

// Initialize game client when page loads
let gameClient;
document.addEventListener('DOMContentLoaded', () => {
  gameClient = new GameClient();
  window.gameClient = gameClient;
});
