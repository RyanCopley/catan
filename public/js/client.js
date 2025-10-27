class GameClient {
  constructor() {
    this.socket = io();
    this.gameId = null;
    this.playerId = null;
    this.gameState = null;
    this.renderer = null;
    this.playerName = '';
    this.hiddenOffers = new Set();

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

      // Check if we need to discard
      const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
      if (myPlayer && myPlayer.mustDiscard > 0) {
        this.showDiscardModal(myPlayer.mustDiscard, myPlayer.resources);
      }

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
      this.openTradeModal();
    });

    // Trade modal controls
    document.querySelector('.close-modal').addEventListener('click', () => {
      this.closeTradeModal();
    });

    document.getElementById('cancelTradeBtn').addEventListener('click', () => {
      this.closeTradeModal();
    });

    document.getElementById('submitTradeBtn').addEventListener('click', () => {
      this.submitTradeOffer();
    });

    // Close modal when clicking outside
    document.getElementById('tradeModal').addEventListener('click', (e) => {
      if (e.target.id === 'tradeModal') {
        this.closeTradeModal();
      }
    });

    // Discard modal
    document.getElementById('submitDiscardBtn').addEventListener('click', () => {
      this.submitDiscard();
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

  handleHexClick(hex) {
    // Only allow hex clicking during robber phase
    if (this.gameState.turnPhase === 'robber') {
      const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
      if (currentPlayer.id === this.playerId) {
        // Check if all players have discarded
        const allDiscarded = this.gameState.players.every(p => !p.mustDiscard || p.mustDiscard === 0);
        if (allDiscarded) {
          this.socket.emit('moveRobber', { gameId: this.gameId, hexCoords: { q: hex.q, r: hex.r } });
        } else {
          this.renderer.addLogMessage('Waiting for all players to discard');
        }
      }
    }
  }

  openTradeModal() {
    const modal = document.getElementById('tradeModal');
    modal.classList.add('active');

    // Reset all inputs
    ['wood', 'brick', 'sheep', 'wheat', 'ore'].forEach(resource => {
      document.getElementById(`give-${resource}`).value = 0;
      document.getElementById(`get-${resource}`).value = 0;
    });

    // Populate player dropdown
    const select = document.getElementById('tradeTarget');
    select.innerHTML = '<option value="">All Players</option>';

    this.gameState.players.forEach(player => {
      if (player.id !== this.playerId) {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        select.appendChild(option);
      }
    });

    // Set max values based on current resources
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    if (myPlayer) {
      ['wood', 'brick', 'sheep', 'wheat', 'ore'].forEach(resource => {
        document.getElementById(`give-${resource}`).max = myPlayer.resources[resource];
      });
    }
  }

  closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    modal.classList.remove('active');
  }

  showDiscardModal(mustDiscard, resources) {
    const modal = document.getElementById('discardModal');
    modal.classList.add('active');

    document.getElementById('discardAmount').textContent = mustDiscard;

    // Reset inputs and set max values
    ['wood', 'brick', 'sheep', 'wheat', 'ore'].forEach(resource => {
      const input = document.getElementById(`discard-${resource}`);
      input.value = 0;
      input.max = resources[resource];
    });
  }

  closeDiscardModal() {
    const modal = document.getElementById('discardModal');
    modal.classList.remove('active');
  }

  submitDiscard() {
    const cardsToDiscard = {
      wood: parseInt(document.getElementById('discard-wood').value) || 0,
      brick: parseInt(document.getElementById('discard-brick').value) || 0,
      sheep: parseInt(document.getElementById('discard-sheep').value) || 0,
      wheat: parseInt(document.getElementById('discard-wheat').value) || 0,
      ore: parseInt(document.getElementById('discard-ore').value) || 0
    };

    const totalDiscarded = Object.values(cardsToDiscard).reduce((a, b) => a + b, 0);
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);

    if (totalDiscarded !== myPlayer.mustDiscard) {
      alert(`You must discard exactly ${myPlayer.mustDiscard} cards`);
      return;
    }

    this.socket.emit('discardCards', { gameId: this.gameId, cardsToDiscard });
    this.closeDiscardModal();
  }

  showStealModal(stealableTargets) {
    const modal = document.getElementById('stealModal');
    modal.classList.add('active');

    const targetsDiv = document.getElementById('stealTargets');
    targetsDiv.innerHTML = '';

    stealableTargets.forEach(targetId => {
      const target = this.gameState.players.find(p => p.id === targetId);
      if (!target) return;

      const targetCard = Object.values(target.resources).reduce((a, b) => a + b, 0);

      const button = document.createElement('button');
      button.className = 'btn btn-primary';
      button.textContent = `${target.name} (${targetCard} cards)`;
      button.style.display = 'block';
      button.style.margin = '10px auto';
      button.onclick = () => {
        this.socket.emit('stealCard', { gameId: this.gameId, targetPlayerId: targetId });
      };
      targetsDiv.appendChild(button);
    });
  }

  closeStealModal() {
    const modal = document.getElementById('stealModal');
    modal.classList.remove('active');
  }

  submitTradeOffer() {
    const offering = {
      wood: parseInt(document.getElementById('give-wood').value) || 0,
      brick: parseInt(document.getElementById('give-brick').value) || 0,
      sheep: parseInt(document.getElementById('give-sheep').value) || 0,
      wheat: parseInt(document.getElementById('give-wheat').value) || 0,
      ore: parseInt(document.getElementById('give-ore').value) || 0
    };

    const requesting = {
      wood: parseInt(document.getElementById('get-wood').value) || 0,
      brick: parseInt(document.getElementById('get-brick').value) || 0,
      sheep: parseInt(document.getElementById('get-sheep').value) || 0,
      wheat: parseInt(document.getElementById('get-wheat').value) || 0,
      ore: parseInt(document.getElementById('get-ore').value) || 0
    };

    const targetPlayerId = document.getElementById('tradeTarget').value || null;

    // Validate trade offer
    const offeringTotal = Object.values(offering).reduce((a, b) => a + b, 0);
    const requestingTotal = Object.values(requesting).reduce((a, b) => a + b, 0);

    if (offeringTotal === 0) {
      alert('You must offer at least one resource');
      return;
    }

    if (requestingTotal === 0) {
      alert('You must request at least one resource');
      return;
    }

    // Check if player has enough resources
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    for (const [resource, amount] of Object.entries(offering)) {
      if (myPlayer.resources[resource] < amount) {
        alert(`You don't have enough ${resource}`);
        return;
      }
    }

    this.socket.emit('tradeOffer', {
      gameId: this.gameId,
      targetPlayerId,
      offering,
      requesting
    });

    this.closeTradeModal();
  }

  updateTradeOffers() {
    if (!this.gameState || !this.gameState.tradeOffers) return;

    const panel = document.getElementById('tradeOffersPanel');
    const list = document.getElementById('tradeOffersList');

    // Filter out hidden offers
    if (!this.hiddenOffers) {
      this.hiddenOffers = new Set();
    }

    const visibleOffers = this.gameState.tradeOffers.filter(offer => !this.hiddenOffers.has(offer.id));

    if (visibleOffers.length === 0) {
      panel.classList.remove('active');
      return;
    }

    panel.classList.add('active');
    list.innerHTML = '';

    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);

    visibleOffers.forEach(offer => {
      const offeringPlayer = this.gameState.players.find(p => p.id === offer.offeringPlayerId);
      const isMyOffer = offer.offeringPlayerId === this.playerId;
      const isTargetedAtMe = offer.targetPlayerId === this.playerId;
      const canSeeOffer = !isMyOffer && (!offer.targetPlayerId || isTargetedAtMe);
      const myResponse = offer.responses ? offer.responses[this.playerId] : null;
      const hasEnoughResources = !isMyOffer && this.canAffordTrade(myPlayer, offer.requesting);

      const offerDiv = document.createElement('div');
      offerDiv.className = 'trade-offer-item';
      if (isMyOffer) offerDiv.classList.add('my-offer');

      const header = document.createElement('div');
      header.className = 'trade-offer-header';
      if (offer.targetPlayerId) {
        const targetPlayer = this.gameState.players.find(p => p.id === offer.targetPlayerId);
        header.textContent = isMyOffer
          ? `Your offer to ${targetPlayer.name}`
          : `${offeringPlayer.name} offers to ${targetPlayer.name}`;
      } else {
        header.textContent = isMyOffer
          ? 'Your offer to all players'
          : `${offeringPlayer.name} offers to all`;
      }

      const details = document.createElement('div');
      details.className = 'trade-offer-details';

      const gives = document.createElement('div');
      gives.className = 'trade-offer-gives';
      gives.innerHTML = '<h4>Gives:</h4>' + this.formatResources(offer.offering);

      const gets = document.createElement('div');
      gets.className = 'trade-offer-gets';
      gets.innerHTML = '<h4>Gets:</h4>' + this.formatResources(offer.requesting);

      details.appendChild(gives);
      details.appendChild(gets);

      offerDiv.appendChild(header);
      offerDiv.appendChild(details);

      // Show responses for the offering player
      if (isMyOffer && offer.responses) {
        const responsesDiv = document.createElement('div');
        responsesDiv.className = 'trade-offer-responses';
        responsesDiv.innerHTML = '<h4>Player Responses:</h4>';

        const responseList = document.createElement('div');
        responseList.className = 'response-list';

        Object.entries(offer.responses).forEach(([playerId, response]) => {
          const player = this.gameState.players.find(p => p.id === playerId);
          if (!player) return;

          const responseItem = document.createElement('div');
          responseItem.className = 'response-item';

          const playerName = document.createElement('span');
          playerName.textContent = player.name;

          const statusIcon = document.createElement('span');
          statusIcon.className = `response-status ${response}`;
          statusIcon.textContent = response === 'accepted' ? '✓' : response === 'rejected' ? '✗' : '?';

          responseItem.appendChild(playerName);
          responseItem.appendChild(statusIcon);
          responseList.appendChild(responseItem);
        });

        responsesDiv.appendChild(responseList);
        offerDiv.appendChild(responsesDiv);

        // Show confirm buttons if anyone has accepted
        if (offer.acceptedBy && offer.acceptedBy.length > 0) {
          const confirmDiv = document.createElement('div');
          confirmDiv.className = 'confirm-buttons';

          offer.acceptedBy.forEach(acceptedPlayerId => {
            const acceptedPlayer = this.gameState.players.find(p => p.id === acceptedPlayerId);
            if (!acceptedPlayer) return;

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn-primary';
            confirmBtn.textContent = `Complete trade with ${acceptedPlayer.name}`;
            confirmBtn.onclick = () => {
              this.socket.emit('tradeConfirm', {
                gameId: this.gameId,
                offerId: offer.id,
                acceptingPlayerId: acceptedPlayerId
              });
            };
            confirmDiv.appendChild(confirmBtn);
          });

          offerDiv.appendChild(confirmDiv);
        }

        // Cancel button
        const actions = document.createElement('div');
        actions.className = 'trade-offer-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel Offer';
        cancelBtn.onclick = () => {
          this.socket.emit('tradeCancel', { gameId: this.gameId, offerId: offer.id });
        };
        actions.appendChild(cancelBtn);
        offerDiv.appendChild(actions);
      }
      // Show accept/reject buttons for other players
      else if (canSeeOffer) {
        const actions = document.createElement('div');
        actions.className = 'trade-offer-actions';

        if (myResponse === 'pending') {
          const acceptBtn = document.createElement('button');
          acceptBtn.className = 'btn btn-primary';
          acceptBtn.textContent = 'Accept';
          acceptBtn.disabled = !hasEnoughResources;
          acceptBtn.onclick = () => {
            this.socket.emit('tradeRespond', {
              gameId: this.gameId,
              offerId: offer.id,
              response: 'accepted'
            });
          };
          actions.appendChild(acceptBtn);

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'btn btn-secondary';
          rejectBtn.textContent = 'Reject';
          rejectBtn.onclick = () => {
            this.socket.emit('tradeRespond', {
              gameId: this.gameId,
              offerId: offer.id,
              response: 'rejected'
            });
          };
          actions.appendChild(rejectBtn);
        } else if (myResponse === 'accepted') {
          const statusDiv = document.createElement('div');
          statusDiv.style.padding = '10px';
          statusDiv.style.textAlign = 'center';
          statusDiv.style.color = '#51cf66';
          statusDiv.style.fontWeight = 'bold';
          statusDiv.textContent = '✓ You accepted this trade. Waiting for confirmation...';
          offerDiv.appendChild(statusDiv);

          const changeBtn = document.createElement('button');
          changeBtn.className = 'btn btn-secondary';
          changeBtn.textContent = 'Change to Reject';
          changeBtn.onclick = () => {
            this.socket.emit('tradeRespond', {
              gameId: this.gameId,
              offerId: offer.id,
              response: 'rejected'
            });
          };
          actions.appendChild(changeBtn);
        } else if (myResponse === 'rejected') {
          const statusDiv = document.createElement('div');
          statusDiv.style.padding = '10px';
          statusDiv.style.textAlign = 'center';
          statusDiv.style.color = '#ff6b6b';
          statusDiv.style.fontWeight = 'bold';
          statusDiv.textContent = '✗ You rejected this trade';
          offerDiv.appendChild(statusDiv);

          const changeBtn = document.createElement('button');
          changeBtn.className = 'btn btn-secondary';
          changeBtn.textContent = 'Change to Accept';
          changeBtn.disabled = !hasEnoughResources;
          changeBtn.onclick = () => {
            this.socket.emit('tradeRespond', {
              gameId: this.gameId,
              offerId: offer.id,
              response: 'accepted'
            });
          };
          actions.appendChild(changeBtn);
        }

        if (actions.children.length > 0) {
          offerDiv.appendChild(actions);
        }
      }

      list.appendChild(offerDiv);
    });
  }

  canAffordTrade(player, requestedResources) {
    if (!player || !requestedResources) return false;

    for (const [resource, amount] of Object.entries(requestedResources)) {
      if (player.resources[resource] < amount) {
        return false;
      }
    }

    return true;
  }

  hideTradeOffer(offerId) {
    // Store hidden offer IDs in browser session
    if (!this.hiddenOffers) {
      this.hiddenOffers = new Set();
    }
    this.hiddenOffers.add(offerId);
    this.updateTradeOffers();
  }

  cleanupHiddenOffers() {
    if (!this.gameState || !this.gameState.tradeOffers) return;

    // Remove offer IDs that no longer exist in the game state
    const currentOfferIds = new Set(this.gameState.tradeOffers.map(offer => offer.id));
    this.hiddenOffers = new Set([...this.hiddenOffers].filter(id => currentOfferIds.has(id)));
  }

  formatResources(resources) {
    const parts = [];
    const resourceNames = { wood: 'W', brick: 'B', sheep: 'S', wheat: 'Wh', ore: 'O' };

    for (const [resource, amount] of Object.entries(resources)) {
      if (amount > 0) {
        parts.push(`${amount} ${resourceNames[resource]}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'Nothing';
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

    // Update trade offers
    this.updateTradeOffers();

    // Update header
    document.getElementById('currentPlayerName').textContent = currentPlayer.name;
    document.getElementById('currentPlayerName').style.color =
      this.renderer.playerColors[currentPlayer.color];

    let phaseText = '';
    if (this.gameState.phase === 'setup') {
      phaseText = `Setup Round ${this.gameState.setupRound} - Place Settlement & Road`;
    } else if (this.gameState.phase === 'playing') {
      if (this.gameState.turnPhase === 'roll') {
        phaseText = 'Roll Dice';
      } else if (this.gameState.turnPhase === 'robber') {
        const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (myPlayer && myPlayer.mustDiscard > 0) {
          phaseText = `Discard ${myPlayer.mustDiscard} Cards`;
        } else {
          const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
          if (currentPlayer.id === this.playerId) {
            phaseText = 'Move Robber & Steal Card';
          } else {
            phaseText = 'Waiting for Robber';
          }
        }
      } else {
        phaseText = 'Build & Trade';
      }
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
