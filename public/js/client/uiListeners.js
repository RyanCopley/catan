// Auto-generated split from client.js
export function setupUIListeners() {
  // Menu screen
  document.getElementById('createGameBtn').addEventListener('click', () => {
    const playerName = document.getElementById('playerName').value.trim();
    if (!playerName) {
      alert('Please enter your name');
      return;
    }
    this.playerName = playerName;
    this.savePlayerDataToStorage();
    this.socket.emit('createGame', { playerName, password: this.playerPassword });
  });

  // Password section toggle
  document.getElementById('togglePasswordSection').addEventListener('click', () => {
    const details = document.getElementById('passwordDetails');
    const icon = document.getElementById('passwordToggleIcon');
    if (details.style.display === 'none') {
      details.style.display = 'block';
      icon.textContent = '▼';
      document.getElementById('sessionPassword').value = this.playerPassword;
    } else {
      details.style.display = 'none';
      icon.textContent = '▶';
    }
  });

  // Regenerate password button
  document.getElementById('regeneratePassword').addEventListener('click', () => {
    if (confirm('Are you sure you want to regenerate your password? This will prevent reconnection to existing games with your current username.')) {
      this.playerPassword = this.generatePassword();
      this.savePlayerDataToStorage();
      document.getElementById('sessionPassword').value = this.playerPassword;
    }
  });

  // Lobby screen
  document.getElementById('readyBtn').addEventListener('click', () => {
    this.socket.emit('toggleReady', { gameId: this.gameId });
  });

  document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
    if (this.gameId) {
      this.socket.emit('leaveGame', { gameId: this.gameId });
    }
    this.showMenu();
    this.gameId = null;
    this.playerId = null;
    this.gameState = null;
    this.resetAwardTracking();
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

  document.getElementById('buyDevCardBtn').addEventListener('click', () => {
    this.socket.emit('buyDevelopmentCard', { gameId: this.gameId });
  });

  document.getElementById('endTurnBtn').addEventListener('click', () => {
    this.socket.emit('endTurn', { gameId: this.gameId });
    this.renderer.clearBuildMode();
  });

  document.getElementById('tradeBtn').addEventListener('click', () => {
    this.openTradeModal();
  });

  document.getElementById('bankTradeBtn').addEventListener('click', () => {
    this.openBankTradeModal();
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

  // Bank trade modal controls
  document.getElementById('closeBankTradeBtn').addEventListener('click', () => {
    this.closeBankTradeModal();
  });

  document.getElementById('cancelBankTradeBtn').addEventListener('click', () => {
    this.closeBankTradeModal();
  });

  document.getElementById('submitBankTradeBtn').addEventListener('click', () => {
    this.submitBankTrade();
  });

  // Year of Plenty modal
  document.getElementById('closeYearOfPlentyBtn').addEventListener('click', () => {
    this.closeYearOfPlentyModal();
  });

  document.getElementById('cancelYearOfPlentyBtn').addEventListener('click', () => {
    this.closeYearOfPlentyModal();
  });

  document.getElementById('submitYearOfPlentyBtn').addEventListener('click', () => {
    this.submitYearOfPlenty();
  });

  // Monopoly modal
  document.getElementById('closeMonopolyBtn').addEventListener('click', () => {
    this.closeMonopolyModal();
  });

  document.getElementById('cancelMonopolyBtn').addEventListener('click', () => {
    this.closeMonopolyModal();
  });

  document.getElementById('submitMonopolyBtn').addEventListener('click', () => {
    this.submitMonopoly();
  });

  // Close bank trade modal when clicking outside
  document.getElementById('bankTradeModal').addEventListener('click', (e) => {
    if (e.target.id === 'bankTradeModal') {
      this.closeBankTradeModal();
    }
  });

  // Discard modal
  document.getElementById('submitDiscardBtn').addEventListener('click', () => {
    this.submitDiscard();
  });

  // Message log toggle
  document.getElementById('messageLogToggle').addEventListener('click', () => {
    const messageLog = document.querySelector('.message-log');
    messageLog.classList.toggle('collapsed');
  });
}
