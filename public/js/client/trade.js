// Auto-generated split from client.js
import { showWarningToast } from '../modules/toast.js';
export function openTradeModal() {
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

export function closeTradeModal() {
  const modal = document.getElementById('tradeModal');
  modal.classList.remove('active');
}

export function openBankTradeModal() {
  const modal = document.getElementById('bankTradeModal');
  modal.classList.add('active');

  // Reset selections
  document.getElementById('bankGiveResource').value = '';
  document.getElementById('bankReceiveResource').value = '';

  // Update modal title to show available trade rates
  const modalHeader = modal.querySelector('.modal-header h2');
  const myPlayer = this.gameState.players.find(p => p.id === this.playerId);

  // Get player's ports from server state
  let tradeRatesText = 'Trade with Bank';
  if (myPlayer) {
    // Check for ports - we'll get this info from the server
    const has3to1 = this.hasPort(myPlayer.id, '3:1');
    const specificPorts = this.getSpecificPorts(myPlayer.id);

    if (has3to1 || specificPorts.length > 0) {
      tradeRatesText = 'Trade with Bank';
      if (has3to1) {
        tradeRatesText += ' (3:1 available)';
      }
      if (specificPorts.length > 0) {
        const portList = specificPorts.map(p => `${p}:2:1`).join(', ');
        tradeRatesText += ` (2:1: ${specificPorts.join(', ')})`;
      }
    }

    // Update resource availability in the give dropdown
    const giveSelect = document.getElementById('bankGiveResource');
    const options = giveSelect.querySelectorAll('option');
    options.forEach(option => {
      if (option.value) {
        const resource = option.value;
        const count = myPlayer.resources[resource];
        const tradeRate = this.getBestTradeRate(myPlayer.id, resource);
        option.textContent = `${resource.charAt(0).toUpperCase() + resource.slice(1)} (${count}) [${tradeRate}:1]`;
        option.disabled = count < tradeRate;
      }
    });
  }

  modalHeader.textContent = tradeRatesText;
}

export function hasPort(playerId, portType) {
  if (!this.gameState.board || !this.gameState.board.ports) return false;

  return this.gameState.board.ports.some(port => {
    if (port.type !== portType) return false;

    return port.vertices.some(portVertex => {
      const vertex = this.gameState.board.vertices.find(v =>
        Math.abs(v.x - portVertex.x) < 0.01 && Math.abs(v.y - portVertex.y) < 0.01
      );
      return vertex && vertex.playerId === playerId && vertex.building;
    });
  });
}

export function getSpecificPorts(playerId) {
  if (!this.gameState.board || !this.gameState.board.ports) return [];

  const resources = [];
  this.gameState.board.ports.forEach(port => {
    if (port.type === '2:1') {
      const hasAccess = port.vertices.some(portVertex => {
        const vertex = this.gameState.board.vertices.find(v =>
          Math.abs(v.x - portVertex.x) < 0.01 && Math.abs(v.y - portVertex.y) < 0.01
        );
        return vertex && vertex.playerId === playerId && vertex.building;
      });

      if (hasAccess && !resources.includes(port.resource)) {
        resources.push(port.resource);
      }
    }
  });

  return resources;
}

export function getBestTradeRate(playerId, resource) {
  // Check for 2:1 specific port
  const specificPorts = this.getSpecificPorts(playerId);
  if (specificPorts.includes(resource)) {
    return 2;
  }

  // Check for 3:1 generic port
  if (this.hasPort(playerId, '3:1')) {
    return 3;
  }

  // Default 4:1
  return 4;
}

export function closeBankTradeModal() {
  const modal = document.getElementById('bankTradeModal');
  modal.classList.remove('active');
}

export function submitBankTrade() {
  const givingResource = document.getElementById('bankGiveResource').value;
  const receivingResource = document.getElementById('bankReceiveResource').value;

  if (!givingResource || !receivingResource) {
    showWarningToast('Please select both resources');
    return;
  }

  if (givingResource === receivingResource) {
    showWarningToast('You must select different resources');
    return;
  }

  const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
  const tradeRate = this.getBestTradeRate(myPlayer.id, givingResource);

  if (!myPlayer || myPlayer.resources[givingResource] < tradeRate) {
    showWarningToast(`You need at least ${tradeRate} ${givingResource} to trade with the bank`);
    return;
  }

  this.socket.emit('bankTrade', {
    gameId: this.gameId,
    givingResource,
    receivingResource,
    amount: tradeRate
  });

  this.closeBankTradeModal();
}

export function showStealModal(stealableTargets) {
  const modal = document.getElementById('stealModal');
  modal.classList.add('active');

  const targetsDiv = document.getElementById('stealTargets');
  targetsDiv.innerHTML = '';

  stealableTargets.forEach(targetId => {
    const target = this.gameState.players.find(p => p.id === targetId);
    if (!target) return;

    // Use resourceCount for other players (resources are censored)
    const targetCard = target.id === this.playerId
      ? Object.values(target.resources).reduce((a, b) => a + b, 0)
      : (target.resourceCount || 0);

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

export function closeStealModal() {
  const modal = document.getElementById('stealModal');
  modal.classList.remove('active');
}

export function submitTradeOffer() {
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
    showWarningToast('You must offer at least one resource');
    return;
  }

  if (requestingTotal === 0) {
    showWarningToast('You must request at least one resource');
    return;
  }

  // Check if player has enough resources
  const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
  for (const [resource, amount] of Object.entries(offering)) {
    if (myPlayer.resources[resource] < amount) {
      showWarningToast(`You don't have enough ${resource}`);
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

export function updateTradeOffers() {
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

export function canAffordTrade(player, requestedResources) {
  if (!player || !requestedResources) return false;

  for (const [resource, amount] of Object.entries(requestedResources)) {
    if (player.resources[resource] < amount) {
      return false;
    }
  }

  return true;
}

export function hideTradeOffer(offerId) {
  // Store hidden offer IDs in browser session
  if (!this.hiddenOffers) {
    this.hiddenOffers = new Set();
  }
  this.hiddenOffers.add(offerId);
  this.updateTradeOffers();
}

export function cleanupHiddenOffers() {
  if (!this.gameState || !this.gameState.tradeOffers) return;

  // Remove offer IDs that no longer exist in the game state
  const currentOfferIds = new Set(this.gameState.tradeOffers.map(offer => offer.id));
  this.hiddenOffers = new Set([...this.hiddenOffers].filter(id => currentOfferIds.has(id)));
}

export function formatResources(resources) {
  const parts = [];
  const resourceEmojis = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛰️' };

  for (const [resource, amount] of Object.entries(resources)) {
    if (amount > 0) {
      parts.push(`${amount} ${resourceEmojis[resource]}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'Nothing';
}
