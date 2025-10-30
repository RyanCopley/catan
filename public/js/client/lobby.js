// Auto-generated split from client.js
import { showWarningToast } from '../modules/toast.js';
export function updateLobby() {
  document.getElementById('lobbyGameId').textContent = this.gameId;

  const playersList = document.getElementById('playersList');
  playersList.innerHTML = '';

  this.gameState.players.forEach(player => {
    const li = document.createElement('li');
    const colorDiv = document.createElement('div');
    colorDiv.className = `player-color color-${player.color}`;
    li.appendChild(colorDiv);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    li.appendChild(nameSpan);

    // Add ready indicator
    const readyIndicator = document.createElement('span');
    readyIndicator.className = 'ready-indicator';
    if (player.ready) {
      readyIndicator.textContent = ' ✓ Ready';
      readyIndicator.style.color = '#51cf66';
      readyIndicator.style.fontWeight = 'bold';
    } else {
      readyIndicator.textContent = ' ✗ Not Ready';
      readyIndicator.style.color = '#ff6b6b';
    }
    li.appendChild(readyIndicator);

    playersList.appendChild(li);
  });

  // Update ready button text based on current player's ready state
  const readyBtn = document.getElementById('readyBtn');
  const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
  if (myPlayer && myPlayer.ready) {
    readyBtn.textContent = 'Unready';
    readyBtn.classList.remove('btn-primary');
    readyBtn.classList.add('btn-secondary');
  } else {
    readyBtn.textContent = 'Ready';
    readyBtn.classList.remove('btn-secondary');
    readyBtn.classList.add('btn-primary');
  }
}

export function updateOpenGamesList(games) {
  const openGamesList = document.getElementById('openGamesList');
  openGamesList.innerHTML = '';

  if (!games || games.length === 0) {
    const noGames = document.createElement('p');
    noGames.className = 'no-games-text';
    noGames.textContent = 'No open games available';
    openGamesList.appendChild(noGames);
    return;
  }

  games.forEach(game => {
    const gameItem = document.createElement('div');
    gameItem.className = 'open-game-item';

    const gameInfo = document.createElement('div');
    gameInfo.className = 'open-game-info';

    const gameName = document.createElement('div');
    gameName.className = 'open-game-name';
    gameName.textContent = `${game.hostName}'s Game`;

    const gameDetails = document.createElement('div');
    gameDetails.className = 'open-game-details';
    gameDetails.textContent = `${game.playerCount}/${game.maxPlayers} players • ID: ${game.gameId}`;

    gameInfo.appendChild(gameName);
    gameInfo.appendChild(gameDetails);

    const joinButton = document.createElement('button');
    joinButton.className = 'btn btn-small btn-primary';
    joinButton.textContent = 'Join';
    joinButton.onclick = () => this.joinOpenGame(game.gameId);

    gameItem.appendChild(gameInfo);
    gameItem.appendChild(joinButton);
    openGamesList.appendChild(gameItem);
  });
}

export function joinOpenGame(gameId) {
  const playerName = document.getElementById('playerName').value.trim();
  if (!playerName) {
    showWarningToast('Please enter your name first');
    return;
  }
  this.playerName = playerName;
  this.savePlayerDataToStorage();
  this.socket.emit('joinGame', { gameId, playerName, password: this.playerPassword });
}

export function updateGameHistory(history) {
  const gameHistoryList = document.getElementById('gameHistoryList');
  gameHistoryList.innerHTML = '';

  if (!history || history.length === 0) {
    const noHistory = document.createElement('p');
    noHistory.className = 'no-games-text';
    noHistory.textContent = 'No completed games yet';
    gameHistoryList.appendChild(noHistory);
    return;
  }

  history.forEach(game => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-header';

    const winnerInfo = document.createElement('div');
    winnerInfo.className = 'history-winner';

    const colorDot = document.createElement('span');
    colorDot.className = `history-color color-${game.winner.color}`;

    const winnerText = document.createElement('span');
    winnerText.textContent = `${game.winner.name} won!`;

    winnerInfo.appendChild(colorDot);
    winnerInfo.appendChild(winnerText);

    const timeInfo = document.createElement('div');
    timeInfo.className = 'history-time';
    const completedDate = new Date(game.completedAt);
    const now = new Date();
    const diffMs = now - completedDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeText;
    if (diffMins < 1) {
      timeText = 'Just now';
    } else if (diffMins < 60) {
      timeText = `${diffMins}m ago`;
    } else if (diffHours < 24) {
      timeText = `${diffHours}h ago`;
    } else if (diffDays < 7) {
      timeText = `${diffDays}d ago`;
    } else {
      timeText = completedDate.toLocaleDateString();
    }
    timeInfo.textContent = timeText;

    header.appendChild(winnerInfo);
    header.appendChild(timeInfo);

    const players = document.createElement('div');
    players.className = 'history-players';

    // Sort players by victory points descending
    const sortedPlayers = [...game.players].sort((a, b) => b.victoryPoints - a.victoryPoints);

    sortedPlayers.forEach(player => {
      const playerSpan = document.createElement('span');
      playerSpan.className = 'history-player';

      const playerColorDot = document.createElement('span');
      playerColorDot.className = `history-color-small color-${player.color}`;

      playerSpan.appendChild(playerColorDot);
      playerSpan.appendChild(document.createTextNode(`${player.name} (${player.victoryPoints})`));
      players.appendChild(playerSpan);
    });

    historyItem.appendChild(header);
    historyItem.appendChild(players);

    if (game.duration) {
      const duration = document.createElement('div');
      duration.className = 'history-duration';
      const durationMins = Math.floor(game.duration / 60000);
      const durationHours = Math.floor(durationMins / 60);
      const remainingMins = durationMins % 60;

      if (durationHours > 0) {
        duration.textContent = `Duration: ${durationHours}h ${remainingMins}m`;
      } else {
        duration.textContent = `Duration: ${durationMins}m`;
      }
      historyItem.appendChild(duration);
    }

    gameHistoryList.appendChild(historyItem);
  });
}
