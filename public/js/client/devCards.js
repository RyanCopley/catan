// Auto-generated split from client.js
import { showWarningToast, showConfirmToast } from '../modules/toast.js';
export function updateDevelopmentCardsDisplay(player) {
  const cardDescriptions = {
    knight: 'Move robber and steal',
    victoryPoint: '+1 Victory Point',
    roadBuilding: 'Build 2 free roads',
    monopoly: 'Take all of 1 resource',
    yearOfPlenty: 'Take any 2 resources'
  };

  const cardNames = {
    knight: 'Knight',
    victoryPoint: 'Victory Point',
    roadBuilding: 'Road Building',
    monopoly: 'Monopoly',
    yearOfPlenty: 'Year of Plenty'
  };

  // Count total cards (excluding VP cards since they're shown in VP breakdown)
  const playableCards = player.developmentCards.filter(c => c !== 'victoryPoint');
  const totalCards = playableCards.length + player.newDevelopmentCards.length;
  document.getElementById('devCardCount').textContent = totalCards;

  const cardsList = document.getElementById('developmentCardsList');
  cardsList.innerHTML = '';

  if (totalCards === 0) {
    const noCards = document.createElement('p');
    noCards.className = 'no-cards';
    noCards.textContent = 'No development cards yet';
    cardsList.appendChild(noCards);
    return;
  }

  // Check if cards can be played (only during your turn in build phase)
  const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.id === this.playerId;
  const canPlayCards = isMyTurn && this.gameState.turnPhase === 'build' && this.gameState.phase === 'playing';

  // Display playable cards (excluding VP cards)
  player.developmentCards.forEach(cardType => {
    if (cardType === 'victoryPoint') return; // Don't show VP cards as playable

    const cardDiv = document.createElement('div');
    cardDiv.className = `dev-card ${cardType}`;

    if (!canPlayCards) {
      cardDiv.classList.add('disabled');
    } else {
      cardDiv.onclick = () => this.playDevelopmentCard(cardType);
    }

    const info = document.createElement('div');
    info.className = 'dev-card-info';

    const name = document.createElement('div');
    name.className = 'dev-card-name';
    name.textContent = cardNames[cardType];

    const desc = document.createElement('div');
    desc.className = 'dev-card-desc';
    desc.textContent = cardDescriptions[cardType];

    info.appendChild(name);
    info.appendChild(desc);

    const status = document.createElement('div');
    status.className = 'dev-card-status';
    status.textContent = canPlayCards ? 'Click to Play' : 'Wait Your Turn';

    cardDiv.appendChild(info);
    cardDiv.appendChild(status);
    cardsList.appendChild(cardDiv);
  });

  // Display new cards (can't be played this turn)
  player.newDevelopmentCards.forEach(cardType => {
    const cardDiv = document.createElement('div');
    cardDiv.className = `dev-card ${cardType} new`;

    const info = document.createElement('div');
    info.className = 'dev-card-info';

    const name = document.createElement('div');
    name.className = 'dev-card-name';
    name.textContent = cardNames[cardType];

    const desc = document.createElement('div');
    desc.className = 'dev-card-desc';
    desc.textContent = cardDescriptions[cardType];

    info.appendChild(name);
    info.appendChild(desc);

    const status = document.createElement('div');
    status.className = 'dev-card-status';
    status.textContent = 'Next Turn';

    cardDiv.appendChild(info);
    cardDiv.appendChild(status);
    cardsList.appendChild(cardDiv);
  });
}

export function playDevelopmentCard(cardType) {
  // Check if it's my turn
  const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
  if (currentPlayer.id !== this.playerId) {
    showWarningToast('Not your turn!');
    return;
  }

  // Check if in build phase
  if (this.gameState.turnPhase !== 'build') {
    showWarningToast('You can only play development cards during the build phase');
    return;
  }

  switch(cardType) {
    case 'knight':
      this.startKnightMode();
      break;
    case 'yearOfPlenty':
      this.showYearOfPlentyModal();
      break;
    case 'monopoly':
      this.showMonopolyModal();
      break;
    case 'roadBuilding':
      showConfirmToast('Play Road Building card? You can build 2 free roads.', {
        confirmText: 'Play',
        cancelText: 'Not Now',
        type: 'info'
      }).then(confirmed => {
        if (confirmed) {
          this.socket.emit('playRoadBuilding', { gameId: this.gameId });
        }
      });
      break;
  }
}

export function startKnightMode() {
  // Show banner notification
  document.getElementById('knightNotice').style.display = 'block';
  this.renderer.setBuildMode('robber');
  this.renderer.addLogMessage('Click on a hex to move the robber');
}

export function endKnightMode() {
  const knightNotice = document.getElementById('knightNotice');
  if (knightNotice) {
    knightNotice.style.display = 'none';
  }
  if (this.renderer && this.renderer.buildMode === 'robber') {
    this.renderer.clearBuildMode();
  }
}

export function showYearOfPlentyModal() {
  document.getElementById('yearOfPlentyModal').style.display = 'flex';
}

export function closeYearOfPlentyModal() {
  document.getElementById('yearOfPlentyModal').style.display = 'none';
  document.getElementById('yearOfPlentyResource1').value = '';
  document.getElementById('yearOfPlentyResource2').value = '';
}

export function submitYearOfPlenty() {
  const resource1 = document.getElementById('yearOfPlentyResource1').value;
  const resource2 = document.getElementById('yearOfPlentyResource2').value;

  if (!resource1 || !resource2) {
    showWarningToast('Please select both resources');
    return;
  }

  this.socket.emit('playYearOfPlenty', {
    gameId: this.gameId,
    resource1,
    resource2
  });
  this.closeYearOfPlentyModal();
}

export function showMonopolyModal() {
  document.getElementById('monopolyModal').style.display = 'flex';
}

export function closeMonopolyModal() {
  document.getElementById('monopolyModal').style.display = 'none';
  document.getElementById('monopolyResource').value = '';
}

export function submitMonopoly() {
  const resource = document.getElementById('monopolyResource').value;

  if (!resource) {
    showWarningToast('Please select a resource');
    return;
  }

  this.socket.emit('playMonopoly', {
    gameId: this.gameId,
    resource
  });
  this.closeMonopolyModal();
}
