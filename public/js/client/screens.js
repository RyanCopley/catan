import BoardRenderer from '../renderer.js';

// Auto-generated split from client.js
export function showMenu() {
  document.getElementById('menu').classList.add('active');
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('game').classList.remove('active');
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

export function updateDiceVisibility() {
  const diceContainer = document.querySelector('.dice-container');
  if (!diceContainer) return;

  if (this.hasRolledDice) {
    diceContainer.classList.remove('is-hidden');
  } else {
    diceContainer.classList.add('is-hidden');
  }
}
