// Auto-generated split from client.js
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

  // Update phase timeline
  this.updatePhaseTimeline();

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
    // Update resources
    document.getElementById('wood').textContent = myPlayer.resources.wood;
    document.getElementById('brick').textContent = myPlayer.resources.brick;
    document.getElementById('sheep').textContent = myPlayer.resources.sheep;
    document.getElementById('wheat').textContent = myPlayer.resources.wheat;
    document.getElementById('ore').textContent = myPlayer.resources.ore;

    // Update development cards display
    this.updateDevelopmentCardsDisplay(myPlayer);
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
