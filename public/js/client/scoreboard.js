// Auto-generated split from client.js
export function updateScoreboard() {
  if (!this.gameState || !this.renderer) return;

  const scoreboardContent = document.getElementById('scoreboardContent');
  scoreboardContent.innerHTML = '';

  this.gameState.players.forEach((player, index) => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'scoreboard-player';

    // Highlight current turn
    if (index === this.gameState.currentPlayerIndex) {
      playerDiv.classList.add('current-turn');
    }

    // Highlight my player
    if (player.id === this.playerId) {
      playerDiv.classList.add('my-player');
    }

    // Header with name and color
    const header = document.createElement('div');
    header.className = 'scoreboard-player-header';

    const colorDiv = document.createElement('div');
    colorDiv.className = 'scoreboard-player-color';
    colorDiv.style.backgroundColor = this.renderer.playerColors[player.color];

    const nameDiv = document.createElement('div');
    nameDiv.className = 'scoreboard-player-name';
    nameDiv.textContent = (player.id === this.playerId ? ' You' : player.name);

    // Add disconnect indicator if player is disconnected
    if (player.disconnected) {
      const disconnectIndicator = document.createElement('span');
      disconnectIndicator.className = 'disconnect-indicator';
      disconnectIndicator.textContent = ' (Disconnected)';
      disconnectIndicator.style.color = '#ff6b6b';
      disconnectIndicator.style.fontSize = '0.9em';
      disconnectIndicator.style.fontWeight = 'normal';
      nameDiv.appendChild(disconnectIndicator);
    }

    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'scoreboard-badges-inline';

    if (player.longestRoad) {
      const badge = document.createElement('span');
      badge.className = 'scoreboard-badge longest-road';
      badge.textContent = '🛣️';
      badge.title = 'Longest Road';
      badgesDiv.appendChild(badge);
    }

    if (player.largestArmy) {
      const badge = document.createElement('span');
      badge.className = 'scoreboard-badge largest-army';
      badge.textContent = '⚔️';
      badge.title = 'Largest Army';
      badgesDiv.appendChild(badge);
    }

    if (player.id === this.playerId) {
      for (let i = 0; i < player.victoryPointCards; i++) {
        const badge = document.createElement('span');
        badge.className = 'victory-point';
        badge.textContent = '⭐';
        badge.title = 'Victory Point';
        badgesDiv.appendChild(badge);
      }
    }
    header.appendChild(colorDiv);
    header.appendChild(nameDiv);
    if (badgesDiv.children.length > 0) {
      header.appendChild(badgesDiv);
    }

    // Stats
    const statsDiv = document.createElement('div');
    statsDiv.className = 'scoreboard-stats';

    // Calculate visible score (excludes VP cards for other players)
    let visibleScore = player.settlements.length + (player.cities.length * 2);
    if (player.longestRoad) visibleScore += 2;
    if (player.largestArmy) visibleScore += 2;

    // Only add VP cards to visible score if it's the current player
    if (player.id === this.playerId) {
      visibleScore += player.victoryPointCards || 0;
    }

    // Score stat (prominently displayed)
    const scoreStat = document.createElement('div');
    scoreStat.className = 'scoreboard-stat score';
    scoreStat.innerHTML = `
      <span class="scoreboard-stat-label">VPs:</span>
      <span class="scoreboard-stat-value">${visibleScore}</span>
    `;
    statsDiv.appendChild(scoreStat);

    // Road length
    const totalRoads = Array.isArray(player.roads)
      ? player.roads.length
      : (typeof player.roadCount === 'number' ? player.roadCount : 0);
    const longestRoadLength = Number.isFinite(player.longestRoadLength)
      ? player.longestRoadLength
      : 0;
    const roadDisplay = `${longestRoadLength}/${totalRoads}`;

    const roadStat = document.createElement('div');
    roadStat.className = 'scoreboard-stat';
    roadStat.innerHTML = `
      <span class="scoreboard-stat-label">Roads:</span>
      <span class="scoreboard-stat-value">${roadDisplay}</span>
    `;
    statsDiv.appendChild(roadStat);

    // Army size
    const armyStat = document.createElement('div');
    armyStat.className = 'scoreboard-stat';
    armyStat.innerHTML = `
      <span class="scoreboard-stat-label">Army:</span>
      <span class="scoreboard-stat-value">${player.armySize || 0}</span>
    `;
    statsDiv.appendChild(armyStat);

    // Total cards (resources + dev cards)
    // For other players, use resourceCount field (resources are censored to -1)
    const totalResourceCards = player.id === this.playerId
      ? Object.values(player.resources).reduce((a, b) => a + b, 0)
      : (player.resourceCount || 0);

    // For other players, use count fields (arrays are censored to empty)
    const totalDevCards = player.id === this.playerId
      ? ((player.developmentCards ? player.developmentCards.length : 0) +
         (player.newDevelopmentCards ? player.newDevelopmentCards.length : 0))
      : ((player.developmentCardCount || 0) + (player.newDevelopmentCardCount || 0));

    const totalCards = totalResourceCards + totalDevCards;

    const cardsStat = document.createElement('div');
    cardsStat.className = 'scoreboard-stat';
    cardsStat.innerHTML = `
      <span class="scoreboard-stat-label">Cards:</span>
      <span class="scoreboard-stat-value">${totalCards}</span>
    `;
    statsDiv.appendChild(cardsStat);

    // Assemble the player card
    playerDiv.appendChild(header);
    playerDiv.appendChild(statsDiv);

    scoreboardContent.appendChild(playerDiv);
  });
}
