// Auto-generated split from client.js
export function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get('gameId');
  const spectateId = urlParams.get('spectate');

  if (spectateId) {
    // Join as spectator
    this.isSpectator = true;
    this.socket.emit('spectateGame', { gameId: spectateId });
  } else if (gameId && this.playerName && this.playerPassword) {
    // Auto-rejoin game from URL params (gameId) and localStorage (name/password)
    this.socket.emit('joinGame', { gameId, playerName: this.playerName, password: this.playerPassword });
  }
}

export function updateUrl() {
  if (this.gameId) {
    const url = new URL(window.location);
    url.searchParams.set('gameId', this.gameId);
    // Remove any old name/password params if they exist
    url.searchParams.delete('name');
    url.searchParams.delete('password');
    window.history.pushState({}, '', url);
  }
}
