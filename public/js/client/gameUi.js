// Auto-generated split from client.js
const RESOURCE_TYPES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

function animateResourceDelta(resourceId, delta) {
  if (!delta) return;

  const resourceCountEl = document.getElementById(resourceId);
  if (!resourceCountEl) return;

  const container = resourceCountEl.parentElement;
  if (!container) return;

  container.querySelectorAll('.resource-change').forEach(el => el.remove());

  const changeEl = document.createElement('span');
  changeEl.classList.add('resource-change', delta > 0 ? 'positive' : 'negative');
  const sign = delta > 0 ? '+' : '';
  changeEl.textContent = `${sign}${delta}`;

  container.appendChild(changeEl);

  container.classList.remove('resource-gain', 'resource-loss');
  container.classList.add(delta > 0 ? 'resource-gain' : 'resource-loss');

  const cleanupHighlight = () => {
    container.classList.remove('resource-gain', 'resource-loss');
  };
  setTimeout(cleanupHighlight, 1500);

  changeEl.addEventListener('animationend', () => {
    changeEl.remove();
    cleanupHighlight();
  });

  // Fallback removal in case animation is interrupted or reduced-motion is enabled
  setTimeout(() => {
    if (changeEl.isConnected) {
      changeEl.remove();
      cleanupHighlight();
    }
  }, 2800);
}

export function updateGameUI() {
  if (!this.gameState) return;

  const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
  const myPlayer = this.gameState.players.find(p => p.id === this.playerId);

  this.checkSpecialAwards();

  if (this.gameState.phase === 'setup' && this.gameState.diceRoll === null) {
    this.hasRolledDice = false;
    this.resetDiceDisplay();
  } else if (this.gameState.diceRoll !== null) {
    this.hasRolledDice = true;
  }
  this.updateDiceVisibility();

  // Check for game over
  if (this.gameState.phase === 'finished') {
    const winner = this.gameState.players.find(p => p.victoryPoints >= 10);
    if (winner && !this.gameOverSoundPlayed) {
      this.gameOverSoundPlayed = true;
      if (winner.id === this.playerId) {
        const audio = new Audio('sounds/win.mp3');
        audio.volume = 0.3;
        audio.play();
      } else {
        const audio = new Audio('sounds/loss.mp3');
        audio.volume = 0.3;
        audio.play();
      }
    }
    const didWin = myPlayer && winner ? winner.id === myPlayer.id : false;
    const title = myPlayer
      ? (didWin ? 'YOU WON' : 'YOU LOST')
      : (winner ? `${winner.name} Won` : 'Game Over');
    const details = winner
      ? `Final score: ${winner.victoryPoints} VP${winner.victoryPoints === 1 ? '' : 's'}`
      : '';
    this.forceGameOverOverlay = false;
    this.showGameOverOverlay({ title, details });
  } else if (!this.forceGameOverOverlay) {
    this.hideGameOverOverlay();
    this.gameOverSoundPlayed = false;
  }

  // Update scoreboard
  this.updateScoreboard();

  // Update trade offers
  this.updateTradeOffers();

  // Check if we should show robber notice
  let showRobberNotice = false;
  if (this.gameState.phase === 'playing' && this.gameState.turnPhase === 'robber') {
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (currentPlayer.id === this.playerId && (!myPlayer.mustDiscard || myPlayer.mustDiscard === 0)) {
      // Check if all players have discarded before showing notice
      const allDiscarded = this.gameState.players.every(p => !p.mustDiscard || p.mustDiscard === 0);
      if (allDiscarded) {
        showRobberNotice = true;
      }
    }
  }

  // Show/hide robber notice
  const robberNotice = document.getElementById('robberNotice');
  if (showRobberNotice) {
    robberNotice.style.display = 'block';
  } else {
    robberNotice.style.display = 'none';
  }

  // Show/hide road building notice
  const roadBuildingNotice = document.getElementById('roadBuildingNotice');
  if (myPlayer && myPlayer.freeRoads > 0) {
    roadBuildingNotice.style.display = 'block';
    document.getElementById('freeRoadsRemaining').textContent = myPlayer.freeRoads;
  } else {
    roadBuildingNotice.style.display = 'none';
  }

  // Update player info
  if (myPlayer) {
    if (!this.lastResourceCounts) {
      this.lastResourceCounts = { ...myPlayer.resources };
    } else {
      for (const resource of RESOURCE_TYPES) {
        const previous = this.lastResourceCounts[resource] ?? 0;
        const current = myPlayer.resources[resource] ?? 0;
        if (current !== previous) {
          animateResourceDelta(resource, Number(current) - Number(previous));
        }
      }
      this.lastResourceCounts = { ...myPlayer.resources };
    }

    // Update resources
    for (const resource of RESOURCE_TYPES) {
      const element = document.getElementById(resource);
      if (element) {
        element.textContent = myPlayer.resources[resource] ?? 0;
      }
    }

    // Update development cards display
    this.updateDevelopmentCardsDisplay(myPlayer);
  } else {
    this.lastResourceCounts = null;
  }

  // Update buttons
  const isMyTurn = currentPlayer.id === this.playerId && !this.isSpectator;
  const isSetup = this.gameState.phase === 'setup';
  const isFinished = this.gameState.phase === 'finished';
  const canRoll = isMyTurn && this.gameState.turnPhase === 'roll' && !isSetup && !isFinished && !this.isSpectator;

  let canBuildSettlement = false;
  let canBuildRoad = false;
  let canBuildCity = false;
  let canBuyDevCard = false;
  let canEndTurn = false;

  if (isSetup && isMyTurn && !this.isSpectator) {
    // During setup, settlement only if not placed yet
    canBuildSettlement = !this.gameState.setupSettlementPlaced;
    // Road only if settlement is placed but road is not
    canBuildRoad = this.gameState.setupSettlementPlaced && !this.gameState.setupRoadPlaced;
    // Can only end turn if both settlement and road are placed
    canEndTurn = this.gameState.setupSettlementPlaced && this.gameState.setupRoadPlaced;
  } else if (!isSetup && isMyTurn && this.gameState.turnPhase === 'build' && !this.isSpectator) {
    // Check resources for each building type
    const res = myPlayer.resources;

    // Settlement: 1 wood, 1 brick, 1 sheep, 1 wheat
    canBuildSettlement = res.wood >= 1 && res.brick >= 1 && res.sheep >= 1 && res.wheat >= 1;

    // Road: 1 wood, 1 brick OR has free roads from Road Building card
    canBuildRoad = (res.wood >= 1 && res.brick >= 1) || (myPlayer.freeRoads > 0);

    // City: 2 wheat, 3 ore (also need to have a settlement to upgrade)
    canBuildCity = res.wheat >= 2 && res.ore >= 3 && myPlayer.settlements.length > 0;

    // Development Card: 1 sheep, 1 wheat, 1 ore
    canBuyDevCard = res.sheep >= 1 && res.wheat >= 1 && res.ore >= 1;

    // Can end turn during build phase (dice already rolled)
    canEndTurn = true;
  } else if (!isSetup && isMyTurn && this.gameState.turnPhase === 'roll' && !this.isSpectator) {
    // Cannot end turn until dice are rolled
    canEndTurn = false;
  }

  document.getElementById('rollDiceBtn').disabled = !canRoll || this.isSpectator;
  document.getElementById('buildSettlementBtn').disabled = !canBuildSettlement || this.isSpectator;
  document.getElementById('buildRoadBtn').disabled = !canBuildRoad || this.isSpectator;
  document.getElementById('buildCityBtn').disabled = !canBuildCity || this.isSpectator;
  document.getElementById('buyDevCardBtn').disabled = !canBuyDevCard || this.isSpectator;
  document.getElementById('tradeBtn').disabled = !(isMyTurn && !isSetup && this.gameState.turnPhase === 'build') || this.isSpectator;
  document.getElementById('bankTradeBtn').disabled = !(isMyTurn && !isSetup && this.gameState.turnPhase === 'build') || this.isSpectator;
  document.getElementById('endTurnBtn').disabled = !canEndTurn || this.isSpectator;

}
