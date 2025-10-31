import BoardRenderer from '../renderer.js';

// Auto-generated split from client.js
export function showMenu() {
  document.getElementById('menu').classList.add('active');
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('game').classList.remove('active');
  // Clear chat messages when leaving game
  if (this.clearChatMessages) {
    this.clearChatMessages();
  }
  // Request open games and history when showing menu
  this.socket.emit('getOpenGames');
  this.socket.emit('getGameHistory');
}

export function showLobby() {
  document.getElementById('menu').classList.remove('active');
  document.getElementById('lobby').classList.add('active');
  document.getElementById('game').classList.remove('active');
  this.updateLobby();
}

export function showGame() {
  document.getElementById('menu').classList.remove('active');
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('game').classList.add('active');

  // Initialize renderer
  if (!this.renderer) {
    this.renderer = new BoardRenderer('gameBoard');
    window.gameClient = this;
  }

  this.renderer.setBoard(this.gameState.board);
  this.updateDiceVisibility();

  this.hideGameOverOverlay();
  this.gameOverSoundPlayed = false;
}

export function resetDiceDisplay() {
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  const diceTotal = document.getElementById('diceTotal');

  if (die1) die1.removeAttribute('data-value');
  if (die2) die2.removeAttribute('data-value');
  if (diceTotal) diceTotal.textContent = '—';
}

export function applyDiceResult(diceResult) {
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  const diceTotal = document.getElementById('diceTotal');

  if (!die1 || !die2 || !diceTotal) return;

  if (!diceResult) {
    resetDiceDisplay();
    return;
  }

  if (typeof diceResult.die1 === 'number') {
    die1.setAttribute('data-value', diceResult.die1);
  } else {
    die1.removeAttribute('data-value');
  }

  if (typeof diceResult.die2 === 'number') {
    die2.setAttribute('data-value', diceResult.die2);
  } else {
    die2.removeAttribute('data-value');
  }

  diceTotal.textContent = typeof diceResult.total === 'number' ? diceResult.total : '—';
}

export function updateDiceVisibility() {
  const diceContainer = document.querySelector('.dice-container');
  if (!diceContainer) return;

  if (this.hasRolledDice) {
    diceContainer.classList.remove('is-hidden');
  } else {
    diceContainer.classList.add('is-hidden');
  }
}
