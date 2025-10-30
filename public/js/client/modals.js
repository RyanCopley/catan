// Auto-generated split from client.js
import { showWarningToast } from '../modules/toast.js';
export function showDiscardModal(mustDiscard, resources) {
  const modal = document.getElementById('discardModal');
  modal.classList.add('active');

  document.getElementById('discardAmount').textContent = mustDiscard;

  // Reset inputs and set max values
  ['wood', 'brick', 'sheep', 'wheat', 'ore'].forEach(resource => {
    const input = document.getElementById(`discard-${resource}`);
    input.value = 0;
    input.max = resources[resource];
  });
}

export function closeDiscardModal() {
  const modal = document.getElementById('discardModal');
  modal.classList.remove('active');
}

export function submitDiscard() {
  const cardsToDiscard = {
    wood: parseInt(document.getElementById('discard-wood').value) || 0,
    brick: parseInt(document.getElementById('discard-brick').value) || 0,
    sheep: parseInt(document.getElementById('discard-sheep').value) || 0,
    wheat: parseInt(document.getElementById('discard-wheat').value) || 0,
    ore: parseInt(document.getElementById('discard-ore').value) || 0
  };

  const totalDiscarded = Object.values(cardsToDiscard).reduce((a, b) => a + b, 0);
  const myPlayer = this.gameState.players.find(p => p.id === this.playerId);

  if (totalDiscarded !== myPlayer.mustDiscard) {
    showWarningToast(`You must discard exactly ${myPlayer.mustDiscard} cards`);
    return;
  }

  this.socket.emit('discardCards', { gameId: this.gameId, cardsToDiscard });
  this.closeDiscardModal();
}
