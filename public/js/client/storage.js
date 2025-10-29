// Auto-generated split from client.js
export function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function loadPlayerDataFromStorage() {
  // Load saved name
  const savedName = localStorage.getItem('catanPlayerName');
  if (savedName) {
    this.playerName = savedName;
    document.getElementById('playerName').value = savedName;
  }

  // Load or generate password
  let savedPassword = localStorage.getItem('catanPlayerPassword');
  if (!savedPassword) {
    savedPassword = this.generatePassword();
    localStorage.setItem('catanPlayerPassword', savedPassword);
  }
  this.playerPassword = savedPassword;
}

export function savePlayerDataToStorage() {
  if (this.playerName) {
    localStorage.setItem('catanPlayerName', this.playerName);
  }
  if (this.playerPassword) {
    localStorage.setItem('catanPlayerPassword', this.playerPassword);
  }
}
