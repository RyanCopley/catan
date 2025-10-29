import GameClient from './client/GameClient.js';

let gameClient;

document.addEventListener('DOMContentLoaded', () => {
  gameClient = new GameClient();
  window.gameClient = gameClient;
});

window.toggleDebugLog = function toggleDebugLog() {
  const messageLog = document.querySelector('.message-log');
  if (messageLog) {
    messageLog.classList.toggle('debug-visible');
    const isVisible = messageLog.classList.contains('debug-visible');
    console.log(`Game log ${isVisible ? 'enabled' : 'disabled'}`);
    return isVisible;
  }
  console.log('Message log element not found');
  return false;
};

export default GameClient;
