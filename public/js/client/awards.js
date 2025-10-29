// Auto-generated split from client.js
export function resetAwardTracking() {
  this.awardsInitialized = false;
  this.longestRoadHolderId = null;
  this.largestArmyHolderId = null;
}

export function playAccomplishmentSound() {
  const audio = new Audio('sounds/accomplishment.mp3');
  audio.volume = 0.2;
  audio.play();
}

export function checkSpecialAwards() {
  if (!this.gameState || !this.gameState.players) return;

  const longestHolder = this.gameState.players.find(player => player.longestRoad);
  const largestHolder = this.gameState.players.find(player => player.largestArmy);

  if (!this.awardsInitialized) {
    this.longestRoadHolderId = longestHolder ? longestHolder.id : null;
    this.largestArmyHolderId = largestHolder ? largestHolder.id : null;
    this.awardsInitialized = true;
    return;
  }

  const newLongestId = longestHolder ? longestHolder.id : null;
  const newLargestId = largestHolder ? largestHolder.id : null;

  let shouldPlaySound = false;

  if (newLongestId && newLongestId !== this.longestRoadHolderId) {
    shouldPlaySound = true;
  }

  if (newLargestId && newLargestId !== this.largestArmyHolderId) {
    shouldPlaySound = true;
  }

  this.longestRoadHolderId = newLongestId;
  this.largestArmyHolderId = newLargestId;

  if (shouldPlaySound) {
    this.playAccomplishmentSound();
  }
}
