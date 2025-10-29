// Auto-generated split from client.js
export function handleVertexClick(vertex) {
  if (this.renderer.buildMode === 'settlement') {
    this.socket.emit('buildSettlement', { gameId: this.gameId, vertex });
  } else if (this.renderer.buildMode === 'city') {
    this.socket.emit('buildCity', { gameId: this.gameId, vertex });
  }
}

export function handleEdgeClick(edge) {
  if (this.renderer.buildMode === 'road') {
    // Check if player has free roads from Road Building card
    const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
    if (myPlayer && myPlayer.freeRoads && myPlayer.freeRoads > 0) {
      this.socket.emit('buildRoadFree', { gameId: this.gameId, edge });
    } else {
      this.socket.emit('buildRoad', { gameId: this.gameId, edge });
    }
  }
}

export function handleHexClick(hex) {
  // Allow hex clicking during robber phase OR when playing knight card
  if (this.gameState.turnPhase === 'robber' || this.renderer.buildMode === 'robber') {
    if (this.renderer.buildMode === 'robber') {
      // Playing knight card
      this.socket.emit('playKnight', { gameId: this.gameId, hexCoords: { q: hex.q, r: hex.r } });
      return;
    }
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
