class Game {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.board = null;
    this.currentPlayerIndex = 0;
    this.phase = 'waiting'; // waiting, setup, playing, finished
    this.turnPhase = 'roll'; // roll, build, trade
    this.diceRoll = null;
    this.setupRound = 1; // For initial settlement/road placement
    this.setupSettlementPlaced = false;
    this.setupRoadPlaced = false;
    this.buildings = { settlements: [], cities: [], roads: [] };
    this.tradeOffers = []; // Active trade offers
    this.nextTradeId = 1;
    this.developmentCardDeck = []; // Development card deck
    this.devCardPlayedThisTurn = false; // Track if a dev card was played this turn
  }

  addPlayer(socketId, name) {
    const colors = ['red', 'blue', 'white', 'orange'];
    const player = {
      id: socketId,
      name: name,
      color: colors[this.players.length],
      resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      developmentCards: [],
      newDevelopmentCards: [], // Cards bought this turn (can't be played until next turn)
      victoryPointCards: 0, // Hidden victory point cards count
      settlements: [],
      cities: [],
      roads: [],
      victoryPoints: 0,
      longestRoad: false,
      largestArmy: false,
      armySize: 0
    };
    this.players.push(player);
  }

  hasPlayer(socketId) {
    return this.players.some(p => p.id === socketId);
  }

  reconnectPlayer(oldSocketId, newSocketId) {
    const player = this.players.find(p => p.id === oldSocketId);
    if (!player) return false;

    // Update player's socket ID
    player.id = newSocketId;

    // Update all buildings owned by this player
    if (this.board) {
      this.board.vertices.forEach(v => {
        if (v.playerId === oldSocketId) {
          v.playerId = newSocketId;
        }
      });

      this.board.edges.forEach(e => {
        if (e.playerId === oldSocketId) {
          e.playerId = newSocketId;
        }
      });
    }

    return true;
  }

  start() {
    if (this.players.length < 2) return false;

    this.board = this.generateBoard();
    this.initializeDevelopmentCards();
    this.phase = 'setup';
    this.turnPhase = 'place';
    return true;
  }

  initializeDevelopmentCards() {
    // Standard Catan development card distribution:
    // 14 Knight cards
    // 5 Victory Point cards (1 each: Chapel, Library, Market, Palace, University)
    // 2 Road Building cards
    // 2 Monopoly cards
    // 2 Year of Plenty cards
    // Total: 25 cards

    const cards = [
      // Knights (14)
      'knight', 'knight', 'knight', 'knight', 'knight',
      'knight', 'knight', 'knight', 'knight', 'knight',
      'knight', 'knight', 'knight', 'knight',
      // Victory Points (5)
      'victoryPoint', 'victoryPoint', 'victoryPoint', 'victoryPoint', 'victoryPoint',
      // Road Building (2)
      'roadBuilding', 'roadBuilding',
      // Monopoly (2)
      'monopoly', 'monopoly',
      // Year of Plenty (2)
      'yearOfPlenty', 'yearOfPlenty'
    ];

    this.developmentCardDeck = this.shuffle([...cards]);
  }

  generateBoard() {
    // Standard Catan board layout (19 hexes)
    const terrainTypes = [
      'forest', 'forest', 'forest', 'forest',
      'pasture', 'pasture', 'pasture', 'pasture',
      'fields', 'fields', 'fields', 'fields',
      'hills', 'hills', 'hills',
      'mountains', 'mountains', 'mountains',
      'desert'
    ];

    const numberTokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

    // Shuffle terrain types
    const shuffledTerrain = this.shuffle([...terrainTypes]);
    const shuffledNumbers = this.shuffle([...numberTokens]);

    // Create hexagonal grid (axial coordinates)
    const hexes = [];
    const layout = [
      { row: 0, positions: [{ q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }] },
      { row: 1, positions: [{ q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 }] },
      { row: 2, positions: [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }] },
      { row: 3, positions: [{ q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }] },
      { row: 4, positions: [{ q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }] }
    ];

    let index = 0;
    let numberIndex = 0;

    layout.forEach(row => {
      row.positions.forEach(pos => {
        const terrain = shuffledTerrain[index];
        const hex = {
          q: pos.q,
          r: pos.r,
          terrain: terrain,
          number: terrain === 'desert' ? null : shuffledNumbers[numberIndex],
          hasRobber: terrain === 'desert'
        };

        if (terrain !== 'desert') numberIndex++;
        hexes.push(hex);
        index++;
      });
    });

    // Generate vertices and edges
    const vertices = this.generateVertices(hexes);
    const edges = this.generateEdges(hexes);

    // Generate ports around the board edges
    const ports = this.generatePorts(hexes, vertices);

    return { hexes, vertices, edges, ports, robber: hexes.find(h => h.hasRobber) };
  }

  generateVertices(hexes) {
    const vertices = new Map();

    hexes.forEach(hex => {
      // Each hex has 6 vertices
      const hexVertices = this.getHexVertices(hex.q, hex.r);
      hexVertices.forEach(v => {
        const key = `${v.x},${v.y}`;
        if (!vertices.has(key)) {
          vertices.set(key, {
            x: v.x,
            y: v.y,
            adjacentHexes: [],
            building: null,
            playerId: null
          });
        }
        vertices.get(key).adjacentHexes.push({ q: hex.q, r: hex.r });
      });
    });

    return Array.from(vertices.values());
  }

  generateEdges(hexes) {
    const edges = new Map();

    hexes.forEach(hex => {
      const hexEdges = this.getHexEdges(hex.q, hex.r);
      hexEdges.forEach(e => {
        const key = `${Math.min(e.v1.x, e.v2.x)},${Math.min(e.v1.y, e.v2.y)}-${Math.max(e.v1.x, e.v2.x)},${Math.max(e.v1.y, e.v2.y)}`;
        if (!edges.has(key)) {
          edges.set(key, {
            v1: e.v1,
            v2: e.v2,
            road: null,
            playerId: null
          });
        }
      });
    });

    return Array.from(edges.values());
  }

  generatePorts(hexes, vertices) {
    // Standard Catan has 9 ports total:
    // - 4 generic 3:1 ports (any resource)
    // - 5 specific 2:1 ports (one for each resource)

    const portTypes = [
      { type: '3:1', resource: null },
      { type: '3:1', resource: null },
      { type: '3:1', resource: null },
      { type: '3:1', resource: null },
      { type: '2:1', resource: 'wood' },
      { type: '2:1', resource: 'brick' },
      { type: '2:1', resource: 'sheep' },
      { type: '2:1', resource: 'wheat' },
      { type: '2:1', resource: 'ore' }
    ];

    // Shuffle port types for randomization
    const shuffledPorts = this.shuffle([...portTypes]);

    // Define edge hexes and their port-facing vertices
    // These are the coastal hexes that border the water
    const portLocations = [
      // Top edge - facing up
      { hexQ: 0, hexR: -2, vertices: [3, 4] },  // Top-left hex, bottom vertices
      { hexQ: 2, hexR: -2, vertices: [4, 5] },  // Top-right hex, bottom-left vertices

      // Upper-right edge - facing upper-right
      { hexQ: 2, hexR: -1, vertices: [5, 0] },  // Upper-right side

      // Lower-right edge - facing lower-right
      { hexQ: 2, hexR: 0, vertices: [0, 1] },   // Right side
      { hexQ: 1, hexR: 1, vertices: [0, 1] },   // Lower-right side

      // Bottom edge - facing down
      { hexQ: 0, hexR: 2, vertices: [1, 2] },   // Bottom center hex
      { hexQ: -2, hexR: 2, vertices: [2, 3] },  // Bottom-left hex

      // Lower-left edge - facing lower-left
      { hexQ: -2, hexR: 1, vertices: [2, 3] },  // Left side

      // Upper-left edge - facing upper-left
      { hexQ: -1, hexR: -1, vertices: [3, 4] }  // Upper-left side
    ];

    const ports = [];

    for (let i = 0; i < Math.min(portLocations.length, shuffledPorts.length); i++) {
      const location = portLocations[i];
      const portType = shuffledPorts[i];

      // Find the hex
      const hex = hexes.find(h => h.q === location.hexQ && h.r === location.hexR);
      if (!hex) continue;

      // Get the hex vertices
      const hexVertices = this.getHexVertices(location.hexQ, location.hexR);

      // Get the two vertices for this port
      const portVertex1 = hexVertices[location.vertices[0]];
      const portVertex2 = hexVertices[location.vertices[1]];

      // Find matching vertices in the board
      const vertex1 = vertices.find(v =>
        Math.abs(v.x - portVertex1.x) < 0.01 && Math.abs(v.y - portVertex1.y) < 0.01
      );
      const vertex2 = vertices.find(v =>
        Math.abs(v.x - portVertex2.x) < 0.01 && Math.abs(v.y - portVertex2.y) < 0.01
      );

      if (vertex1 && vertex2) {
        ports.push({
          type: portType.type,
          resource: portType.resource,
          vertices: [
            { x: vertex1.x, y: vertex1.y },
            { x: vertex2.x, y: vertex2.y }
          ],
          hex: { q: location.hexQ, r: location.hexR }
        });
      }
    }

    return ports;
  }

  getHexVertices(q, r) {
    // Convert axial to pixel coordinates for vertices
    const size = 1;
    const x = size * (3/2 * q);
    const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

    const vertices = [];
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i;
      vertices.push({
        x: parseFloat((x + size * Math.cos(angle)).toFixed(3)),
        y: parseFloat((y + size * Math.sin(angle)).toFixed(3))
      });
    }
    return vertices;
  }

  getHexEdges(q, r) {
    const vertices = this.getHexVertices(q, r);
    const edges = [];
    for (let i = 0; i < 6; i++) {
      edges.push({
        v1: vertices[i],
        v2: vertices[(i + 1) % 6]
      });
    }
    return edges;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  rollDice(playerId) {
    if (this.phase !== 'playing') return null;
    if (this.players[this.currentPlayerIndex].id !== playerId) return null;
    if (this.turnPhase !== 'roll') return null;

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    this.diceRoll = die1 + die2;

    if (this.diceRoll === 7) {
      // Robber logic - players with >7 cards discard half
      this.handleRobber();
      // Don't set turnPhase to 'build' yet - wait for robber to be moved
      this.turnPhase = 'robber';
    } else {
      this.distributeResources(this.diceRoll);
      this.turnPhase = 'build';
    }

    return { die1, die2, total: this.diceRoll };
  }

  distributeResources(number) {
    const resourceMap = {
      forest: 'wood',
      hills: 'brick',
      pasture: 'sheep',
      fields: 'wheat',
      mountains: 'ore'
    };

    this.board.hexes.forEach(hex => {
      if (hex.number === number && !hex.hasRobber) {
        // Find all settlements/cities on this hex's vertices
        this.board.vertices.forEach(vertex => {
          if (vertex.building && vertex.adjacentHexes.some(h => h.q === hex.q && h.r === hex.r)) {
            const player = this.players.find(p => p.id === vertex.playerId);
            if (player) {
              const resource = resourceMap[hex.terrain];
              if (resource) {
                const amount = vertex.building === 'city' ? 2 : 1;
                player.resources[resource] += amount;
              }
            }
          }
        });
      }
    });
  }

  handleRobber() {
    // Players with more than 7 cards must discard half
    this.players.forEach(player => {
      const totalCards = Object.values(player.resources).reduce((a, b) => a + b, 0);
      if (totalCards > 7) {
        player.mustDiscard = Math.floor(totalCards / 2);
      } else {
        player.mustDiscard = 0;
      }
    });
  }

  discardCards(playerId, cardsToDiscard) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.mustDiscard) return { success: false, error: 'No discard required' };

    // Validate the discard amount
    const totalDiscarded = Object.values(cardsToDiscard).reduce((a, b) => a + b, 0);
    if (totalDiscarded !== player.mustDiscard) {
      return { success: false, error: `Must discard exactly ${player.mustDiscard} cards` };
    }

    // Validate player has the cards
    for (const [resource, amount] of Object.entries(cardsToDiscard)) {
      if (player.resources[resource] < amount) {
        return { success: false, error: `Not enough ${resource}` };
      }
    }

    // Discard the cards
    for (const [resource, amount] of Object.entries(cardsToDiscard)) {
      player.resources[resource] -= amount;
    }

    player.mustDiscard = 0;
    return { success: true };
  }

  checkAllDiscarded() {
    // Check if all players have discarded
    return this.players.every(p => !p.mustDiscard || p.mustDiscard === 0);
  }

  moveRobber(playerId, hexCoords) {
    // Only current player can move robber
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.turnPhase !== 'robber') {
      return { success: false, error: 'Cannot move robber now' };
    }

    // Check if all players have discarded
    if (!this.checkAllDiscarded()) {
      return { success: false, error: 'Waiting for players to discard' };
    }

    // Find the hex
    const hex = this.board.hexes.find(h => h.q === hexCoords.q && h.r === hexCoords.r);
    if (!hex) {
      return { success: false, error: 'Invalid hex' };
    }

    // Cannot place robber on the same hex
    if (hex.hasRobber) {
      return { success: false, error: 'Robber is already there' };
    }

    // Remove robber from current hex
    this.board.hexes.forEach(h => h.hasRobber = false);

    // Place robber on new hex
    hex.hasRobber = true;
    this.board.robber = hex;

    // Get players with settlements/cities on this hex
    const playersOnHex = this.getPlayersOnHex(hex);
    const stealableTargets = playersOnHex.filter(p => p !== playerId);

    return { success: true, stealableTargets };
  }

  getPlayersOnHex(hex) {
    const playerIds = new Set();

    this.board.vertices.forEach(vertex => {
      if (vertex.building && vertex.adjacentHexes.some(h => h.q === hex.q && h.r === hex.r)) {
        playerIds.add(vertex.playerId);
      }
    });

    return Array.from(playerIds);
  }

  stealCard(robberId, targetPlayerId) {
    if (!targetPlayerId) {
      // No one to steal from
      this.turnPhase = 'build';
      return { success: true, stolenResource: null };
    }

    const robber = this.players.find(p => p.id === robberId);
    const target = this.players.find(p => p.id === targetPlayerId);

    if (!robber || !target) {
      return { success: false, error: 'Player not found' };
    }

    // Get target's resources
    const availableResources = [];
    for (const [resource, amount] of Object.entries(target.resources)) {
      for (let i = 0; i < amount; i++) {
        availableResources.push(resource);
      }
    }

    if (availableResources.length === 0) {
      // Target has no cards
      this.turnPhase = 'build';
      return { success: true, stolenResource: null };
    }

    // Steal a random card
    const randomIndex = Math.floor(Math.random() * availableResources.length);
    const stolenResource = availableResources[randomIndex];

    target.resources[stolenResource]--;
    robber.resources[stolenResource]++;

    this.turnPhase = 'build';
    return { success: true, stolenResource };
  }

  buildSettlement(playerId, vertex) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    const v = this.board.vertices.find(vert =>
      Math.abs(vert.x - vertex.x) < 0.01 && Math.abs(vert.y - vertex.y) < 0.01
    );

    if (!v || v.building) return false;

    // Check distance rule (no settlements within 1 edge)
    const adjacentVertices = this.getAdjacentVertices(v);
    if (adjacentVertices.some(av => av.building)) return false;

    // In setup phase, only allow one settlement per turn
    if (this.phase === 'setup') {
      if (this.setupSettlementPlaced) return false;

      v.building = 'settlement';
      v.playerId = playerId;
      player.settlements.push(vertex);
      player.victoryPoints++;
      this.setupSettlementPlaced = true;

      // In round 2, give resources from adjacent hexes
      if (this.setupRound === 2) {
        this.giveSetupResources(v);
      }

      return true;
    }

    // Check resources
    if (player.resources.wood >= 1 && player.resources.brick >= 1 &&
        player.resources.sheep >= 1 && player.resources.wheat >= 1) {

      // Check if connected to player's road
      const connectedToRoad = this.isConnectedToPlayerRoad(v, playerId);
      if (!connectedToRoad) return false;

      player.resources.wood--;
      player.resources.brick--;
      player.resources.sheep--;
      player.resources.wheat--;

      v.building = 'settlement';
      v.playerId = playerId;
      player.settlements.push(vertex);
      player.victoryPoints++;
      return true;
    }

    return false;
  }

  buildRoad(playerId, edge) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    const e = this.board.edges.find(ed =>
      (Math.abs(ed.v1.x - edge.v1.x) < 0.01 && Math.abs(ed.v1.y - edge.v1.y) < 0.01 &&
       Math.abs(ed.v2.x - edge.v2.x) < 0.01 && Math.abs(ed.v2.y - edge.v2.y) < 0.01) ||
      (Math.abs(ed.v1.x - edge.v2.x) < 0.01 && Math.abs(ed.v1.y - edge.v2.y) < 0.01 &&
       Math.abs(ed.v2.x - edge.v1.x) < 0.01 && Math.abs(ed.v2.y - edge.v1.y) < 0.01)
    );

    if (!e || e.road) return false;

    if (this.phase === 'setup') {
      // Only allow road if settlement was placed first
      if (!this.setupSettlementPlaced) return false;
      if (this.setupRoadPlaced) return false;

      // Road must be adjacent to the settlement just placed
      const lastSettlement = player.settlements[player.settlements.length - 1];
      const isAdjacent =
        (Math.abs(e.v1.x - lastSettlement.x) < 0.01 && Math.abs(e.v1.y - lastSettlement.y) < 0.01) ||
        (Math.abs(e.v2.x - lastSettlement.x) < 0.01 && Math.abs(e.v2.y - lastSettlement.y) < 0.01);

      if (!isAdjacent) return false;

      e.road = true;
      e.playerId = playerId;
      player.roads.push(edge);
      this.setupRoadPlaced = true;
      return true;
    }

    // Check resources
    if (player.resources.wood >= 1 && player.resources.brick >= 1) {
      // Road must connect to existing road or settlement/city
      const isConnected = this.board.edges.some(existingEdge => {
        if (existingEdge.playerId !== playerId || !existingEdge.road) return false;
        // Check if edges share a vertex
        return (Math.abs(existingEdge.v1.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v1.y) < 0.01) ||
               (Math.abs(existingEdge.v1.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v2.y) < 0.01) ||
               (Math.abs(existingEdge.v2.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v1.y) < 0.01) ||
               (Math.abs(existingEdge.v2.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v2.y) < 0.01);
      }) || this.board.vertices.some(v => {
        if (v.playerId !== playerId || !v.building) return false;
        return (Math.abs(v.x - e.v1.x) < 0.01 && Math.abs(v.y - e.v1.y) < 0.01) ||
               (Math.abs(v.x - e.v2.x) < 0.01 && Math.abs(v.y - e.v2.y) < 0.01);
      });

      if (!isConnected) return false;

      player.resources.wood--;
      player.resources.brick--;

      e.road = true;
      e.playerId = playerId;
      player.roads.push(edge);
      this.calculateLongestRoad();
      return true;
    }

    return false;
  }

  buildCity(playerId, vertex) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    const v = this.board.vertices.find(vert =>
      Math.abs(vert.x - vertex.x) < 0.01 && Math.abs(vert.y - vertex.y) < 0.01
    );

    if (!v || v.building !== 'settlement' || v.playerId !== playerId) return false;

    // Check resources
    if (player.resources.wheat >= 2 && player.resources.ore >= 3) {
      player.resources.wheat -= 2;
      player.resources.ore -= 3;

      v.building = 'city';
      player.cities.push(vertex);
      player.settlements = player.settlements.filter(s =>
        Math.abs(s.x - vertex.x) >= 0.01 || Math.abs(s.y - vertex.y) >= 0.01
      );
      // Cities are worth 2 VP total, settlement was worth 1 VP, so add 1 more
      player.victoryPoints++;
      return true;
    }

    return false;
  }

  buyDevelopmentCard(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if in playing phase and build turn phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only buy cards during build phase' };
    }

    // Check if there are cards left
    if (this.developmentCardDeck.length === 0) {
      return { success: false, error: 'No development cards left' };
    }

    // Development card costs: 1 Sheep, 1 Wheat, 1 Ore
    if (player.resources.sheep >= 1 && player.resources.wheat >= 1 && player.resources.ore >= 1) {
      player.resources.sheep--;
      player.resources.wheat--;
      player.resources.ore--;

      // Draw a card from the deck
      const card = this.developmentCardDeck.pop();

      // Add to newDevelopmentCards (can't be played this turn, except Victory Points)
      player.newDevelopmentCards.push(card);

      // Victory Point cards immediately add to victory points but remain hidden
      if (card === 'victoryPoint') {
        player.victoryPoints++;
        player.victoryPointCards++;
        // Remove from newDevelopmentCards (don't show in hand)
        player.newDevelopmentCards = player.newDevelopmentCards.filter(c => c !== card);
      }

      return { success: true, cardType: card };
    }

    return { success: false, error: 'Not enough resources (need 1 sheep, 1 wheat, 1 ore)' };
  }

  playKnight(playerId, hexCoords) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if in playing phase and build turn phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    // Check if a dev card was already played this turn
    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    // Check if player has a knight card (not in newDevelopmentCards)
    const knightIndex = player.developmentCards.findIndex(c => c === 'knight');
    if (knightIndex === -1) {
      return { success: false, error: 'You do not have a knight card to play' };
    }

    // Remove the knight card
    player.developmentCards.splice(knightIndex, 1);

    // Mark that a dev card was played this turn
    this.devCardPlayedThisTurn = true;

    // Increase army size
    player.armySize++;

    // Find the hex to move robber to
    const hex = this.board.hexes.find(h => h.q === hexCoords.q && h.r === hexCoords.r);
    if (!hex) {
      return { success: false, error: 'Invalid hex' };
    }

    // Cannot place robber on the same hex
    if (hex.hasRobber) {
      return { success: false, error: 'Robber is already there' };
    }

    // Remove robber from current hex
    this.board.hexes.forEach(h => h.hasRobber = false);

    // Place robber on new hex
    hex.hasRobber = true;
    this.board.robber = hex;

    // Calculate largest army
    this.calculateLargestArmy();

    // Get players with settlements/cities on this hex for stealing
    const playersOnHex = this.getPlayersOnHex(hex);
    const stealableTargets = playersOnHex.filter(p => p !== playerId);

    return { success: true, stealableTargets };
  }

  calculateLargestArmy() {
    // Largest Army: minimum 3 knights played, worth 2 VP
    let largestPlayer = null;
    let largestSize = 2; // Minimum 3 knights to get largest army

    this.players.forEach(player => {
      if (player.armySize > largestSize) {
        largestSize = player.armySize;
        largestPlayer = player;
      }
    });

    // Remove largest army from all players first
    this.players.forEach(player => {
      if (player.largestArmy && player !== largestPlayer) {
        player.largestArmy = false;
        player.victoryPoints -= 2;
      }
    });

    // Award largest army to the player with most knights (if at least 3)
    if (largestPlayer && !largestPlayer.largestArmy) {
      largestPlayer.largestArmy = true;
      largestPlayer.victoryPoints += 2;
    }
  }

  playYearOfPlenty(playerId, resource1, resource2) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if in playing phase and build turn phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    // Check if a dev card was already played this turn
    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    // Check if player has a yearOfPlenty card
    const cardIndex = player.developmentCards.findIndex(c => c === 'yearOfPlenty');
    if (cardIndex === -1) {
      return { success: false, error: 'You do not have a Year of Plenty card' };
    }

    // Validate resources
    const validResources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
    if (!validResources.includes(resource1) || !validResources.includes(resource2)) {
      return { success: false, error: 'Invalid resource type' };
    }

    // Remove the card
    player.developmentCards.splice(cardIndex, 1);

    // Mark that a dev card was played this turn
    this.devCardPlayedThisTurn = true;

    // Give the player the resources
    player.resources[resource1]++;
    player.resources[resource2]++;

    return { success: true, resource1, resource2 };
  }

  playMonopoly(playerId, resource) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if in playing phase and build turn phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    // Check if a dev card was already played this turn
    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    // Check if player has a monopoly card
    const cardIndex = player.developmentCards.findIndex(c => c === 'monopoly');
    if (cardIndex === -1) {
      return { success: false, error: 'You do not have a Monopoly card' };
    }

    // Validate resource
    const validResources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
    if (!validResources.includes(resource)) {
      return { success: false, error: 'Invalid resource type' };
    }

    // Remove the card
    player.developmentCards.splice(cardIndex, 1);

    // Mark that a dev card was played this turn
    this.devCardPlayedThisTurn = true;

    // Take all of that resource from other players
    let totalTaken = 0;
    this.players.forEach(otherPlayer => {
      if (otherPlayer.id !== playerId) {
        const amount = otherPlayer.resources[resource];
        if (amount > 0) {
          player.resources[resource] += amount;
          otherPlayer.resources[resource] = 0;
          totalTaken += amount;
        }
      }
    });

    return { success: true, resource, totalTaken };
  }

  playRoadBuilding(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if in playing phase and build turn phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    // Check if a dev card was already played this turn
    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    // Check if player has a roadBuilding card
    const cardIndex = player.developmentCards.findIndex(c => c === 'roadBuilding');
    if (cardIndex === -1) {
      return { success: false, error: 'You do not have a Road Building card' };
    }

    // Remove the card
    player.developmentCards.splice(cardIndex, 1);

    // Mark that a dev card was played this turn
    this.devCardPlayedThisTurn = true;

    // Set a flag that player can build 2 free roads
    player.freeRoads = 2;

    return { success: true };
  }

  buildRoadFree(playerId, edge) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    // Check if player has free roads available
    if (!player.freeRoads || player.freeRoads <= 0) return false;

    // Check if it's the current player's turn
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    const e = this.board.edges.find(ed =>
      (Math.abs(ed.v1.x - edge.v1.x) < 0.01 && Math.abs(ed.v1.y - edge.v1.y) < 0.01 &&
       Math.abs(ed.v2.x - edge.v2.x) < 0.01 && Math.abs(ed.v2.y - edge.v2.y) < 0.01) ||
      (Math.abs(ed.v1.x - edge.v2.x) < 0.01 && Math.abs(ed.v1.y - edge.v2.y) < 0.01 &&
       Math.abs(ed.v2.x - edge.v1.x) < 0.01 && Math.abs(ed.v2.y - edge.v1.y) < 0.01)
    );

    if (!e || e.road) return false;

    // Road must connect to existing road or settlement/city
    const isConnected = this.board.edges.some(existingEdge => {
      if (existingEdge.playerId !== playerId || !existingEdge.road) return false;
      // Check if edges share a vertex
      return (Math.abs(existingEdge.v1.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v1.y) < 0.01) ||
             (Math.abs(existingEdge.v1.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v2.y) < 0.01) ||
             (Math.abs(existingEdge.v2.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v1.y) < 0.01) ||
             (Math.abs(existingEdge.v2.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v2.y) < 0.01);
    }) || this.board.vertices.some(v => {
      if (v.playerId !== playerId || !v.building) return false;
      return (Math.abs(v.x - e.v1.x) < 0.01 && Math.abs(v.y - e.v1.y) < 0.01) ||
             (Math.abs(v.x - e.v2.x) < 0.01 && Math.abs(v.y - e.v2.y) < 0.01);
    });

    if (!isConnected) return false;

    e.road = true;
    e.playerId = playerId;
    player.roads.push(edge);
    player.freeRoads--;

    this.calculateLongestRoad();

    return true;
  }

  getAdjacentVertices(vertex) {
    // Find all vertices connected by an edge
    const adjacent = [];
    this.board.edges.forEach(edge => {
      if (Math.abs(edge.v1.x - vertex.x) < 0.01 && Math.abs(edge.v1.y - vertex.y) < 0.01) {
        const v = this.board.vertices.find(v =>
          Math.abs(v.x - edge.v2.x) < 0.01 && Math.abs(v.y - edge.v2.y) < 0.01
        );
        if (v) adjacent.push(v);
      } else if (Math.abs(edge.v2.x - vertex.x) < 0.01 && Math.abs(edge.v2.y - vertex.y) < 0.01) {
        const v = this.board.vertices.find(v =>
          Math.abs(v.x - edge.v1.x) < 0.01 && Math.abs(v.y - edge.v1.y) < 0.01
        );
        if (v) adjacent.push(v);
      }
    });
    return adjacent;
  }

  isConnectedToPlayerRoad(vertex, playerId) {
    // Check if any edge connected to this vertex has the player's road
    return this.board.edges.some(edge => {
      if (edge.playerId !== playerId || !edge.road) return false;
      return (Math.abs(edge.v1.x - vertex.x) < 0.01 && Math.abs(edge.v1.y - vertex.y) < 0.01) ||
             (Math.abs(edge.v2.x - vertex.x) < 0.01 && Math.abs(edge.v2.y - vertex.y) < 0.01);
    });
  }

  calculateLongestRoad() {
    // Simplified longest road calculation
    let longestPlayer = null;
    let longestLength = 4; // Minimum 5 roads to get longest road

    this.players.forEach(player => {
      if (player.roads.length > longestLength) {
        longestLength = player.roads.length;
        longestPlayer = player;
      }
    });

    this.players.forEach(player => {
      if (player.longestRoad && player !== longestPlayer) {
        player.longestRoad = false;
        player.victoryPoints -= 2;
      }
    });

    if (longestPlayer && !longestPlayer.longestRoad) {
      longestPlayer.longestRoad = true;
      longestPlayer.victoryPoints += 2;
    }
  }

  endTurn(playerId) {
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    if (this.phase === 'setup') {
      // In setup, can only end turn if both settlement and road are placed
      if (!this.setupSettlementPlaced || !this.setupRoadPlaced) return false;

      this.handleSetupTurn();
    } else {
      // Move new development cards to playable cards at end of turn
      const player = this.players[this.currentPlayerIndex];
      if (player.newDevelopmentCards.length > 0) {
        player.developmentCards.push(...player.newDevelopmentCards);
        player.newDevelopmentCards = [];
      }

      // Reset dev card played flag for next turn
      this.devCardPlayedThisTurn = false;

      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      this.turnPhase = 'roll';
      this.diceRoll = null;
    }

    // Check for winner
    const winner = this.players.find(p => p.victoryPoints >= 10);
    if (winner) {
      this.phase = 'finished';
    }

    return true;
  }

  handleSetupTurn() {
    // Reset setup flags for next player
    this.setupSettlementPlaced = false;
    this.setupRoadPlaced = false;

    if (this.setupRound === 1) {
      if (this.currentPlayerIndex < this.players.length - 1) {
        this.currentPlayerIndex++;
      } else {
        this.setupRound = 2;
        // Don't increment, same player goes again in reverse
      }
    } else if (this.setupRound === 2) {
      if (this.currentPlayerIndex > 0) {
        this.currentPlayerIndex--;
      } else {
        this.phase = 'playing';
        this.currentPlayerIndex = 0;
        this.turnPhase = 'roll';
      }
    }
  }

  giveSetupResources(vertex) {
    const resourceMap = {
      forest: 'wood',
      hills: 'brick',
      pasture: 'sheep',
      fields: 'wheat',
      mountains: 'ore'
    };

    const player = this.players.find(p => p.id === vertex.playerId);
    if (!player) return;

    // Give one resource for each adjacent hex
    vertex.adjacentHexes.forEach(hexCoord => {
      const hex = this.board.hexes.find(h => h.q === hexCoord.q && h.r === hexCoord.r);
      if (hex && hex.terrain !== 'desert') {
        const resource = resourceMap[hex.terrain];
        if (resource) {
          player.resources[resource]++;
        }
      }
    });
  }

  createTradeOffer(offeringPlayerId, targetPlayerId, offering, requesting) {
    const offeringPlayer = this.players.find(p => p.id === offeringPlayerId);
    if (!offeringPlayer) return null;

    // Validate that offering player has the resources they're offering
    for (const [resource, amount] of Object.entries(offering)) {
      if (offeringPlayer.resources[resource] < amount) {
        return null; // Player doesn't have enough resources
      }
    }

    const offer = {
      id: this.nextTradeId++,
      offeringPlayerId,
      targetPlayerId, // null for offering to all players
      offering, // { wood: 1, brick: 2, ... }
      requesting, // { sheep: 1, wheat: 1, ... }
      timestamp: Date.now(),
      responses: {}, // { playerId: 'accepted' | 'rejected' | 'pending' }
      acceptedBy: [] // List of player IDs who have accepted
    };

    // Initialize responses for all eligible players
    this.players.forEach(player => {
      if (player.id !== offeringPlayerId) {
        if (!targetPlayerId || targetPlayerId === player.id) {
          offer.responses[player.id] = 'pending';
        }
      }
    });

    this.tradeOffers.push(offer);
    return offer;
  }

  respondToTrade(offerId, playerId, response) {
    const offer = this.tradeOffers.find(o => o.id === offerId);
    if (!offer) return { success: false, error: 'Trade offer not found' };

    // Check if this player can respond
    if (offer.offeringPlayerId === playerId) {
      return { success: false, error: 'Cannot respond to your own trade' };
    }

    if (!(playerId in offer.responses)) {
      return { success: false, error: 'This trade is not for you' };
    }

    // Update response
    offer.responses[playerId] = response;

    if (response === 'accepted') {
      // Check if player has resources
      const player = this.players.find(p => p.id === playerId);
      if (!player) return { success: false, error: 'Player not found' };

      for (const [resource, amount] of Object.entries(offer.requesting)) {
        if (player.resources[resource] < amount) {
          offer.responses[playerId] = 'rejected';
          return { success: false, error: 'You do not have enough resources' };
        }
      }

      if (!offer.acceptedBy.includes(playerId)) {
        offer.acceptedBy.push(playerId);
      }
    } else if (response === 'rejected') {
      // Remove from acceptedBy if they were there
      offer.acceptedBy = offer.acceptedBy.filter(id => id !== playerId);
    }

    return { success: true };
  }

  confirmTrade(offerId, offeringPlayerId, acceptingPlayerId) {
    const offer = this.tradeOffers.find(o => o.id === offerId);
    if (!offer) return { success: false, error: 'Trade offer not found' };

    // Verify the offering player is confirming
    if (offer.offeringPlayerId !== offeringPlayerId) {
      return { success: false, error: 'Only the offering player can confirm' };
    }

    // Verify the accepting player has accepted
    if (!offer.acceptedBy.includes(acceptingPlayerId)) {
      return { success: false, error: 'This player has not accepted your trade' };
    }

    // Execute the trade
    const result = this.executeTrade(offerId, acceptingPlayerId);
    return result;
  }

  executeTrade(offerId, acceptingPlayerId) {
    const offerIndex = this.tradeOffers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) return { success: false, error: 'Trade offer not found' };

    const offer = this.tradeOffers[offerIndex];

    // Check if this player can accept the trade
    if (offer.targetPlayerId && offer.targetPlayerId !== acceptingPlayerId) {
      return { success: false, error: 'This trade is not for you' };
    }

    // Cannot trade with yourself
    if (offer.offeringPlayerId === acceptingPlayerId) {
      return { success: false, error: 'Cannot trade with yourself' };
    }

    const offeringPlayer = this.players.find(p => p.id === offer.offeringPlayerId);
    const acceptingPlayer = this.players.find(p => p.id === acceptingPlayerId);

    if (!offeringPlayer || !acceptingPlayer) {
      return { success: false, error: 'Player not found' };
    }

    // Validate offering player still has resources
    for (const [resource, amount] of Object.entries(offer.offering)) {
      if (offeringPlayer.resources[resource] < amount) {
        this.tradeOffers.splice(offerIndex, 1); // Remove invalid offer
        return { success: false, error: 'Offering player no longer has those resources' };
      }
    }

    // Validate accepting player has resources
    for (const [resource, amount] of Object.entries(offer.requesting)) {
      if (acceptingPlayer.resources[resource] < amount) {
        return { success: false, error: 'You do not have the requested resources' };
      }
    }

    // Execute the trade
    for (const [resource, amount] of Object.entries(offer.offering)) {
      offeringPlayer.resources[resource] -= amount;
      acceptingPlayer.resources[resource] += amount;
    }

    for (const [resource, amount] of Object.entries(offer.requesting)) {
      acceptingPlayer.resources[resource] -= amount;
      offeringPlayer.resources[resource] += amount;
    }

    // Remove the trade offer
    this.tradeOffers.splice(offerIndex, 1);

    return {
      success: true,
      offeringPlayer: offeringPlayer.name,
      acceptingPlayer: acceptingPlayer.name
    };
  }

  cancelTradeOffer(offerId, playerId) {
    const offerIndex = this.tradeOffers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) return false;

    const offer = this.tradeOffers[offerIndex];

    // Only the offering player can cancel their own trade
    if (offer.offeringPlayerId !== playerId) return false;

    this.tradeOffers.splice(offerIndex, 1);
    return true;
  }

  rejectTradeOffer(offerId, playerId) {
    const offerIndex = this.tradeOffers.findIndex(o => o.id === offerId);
    if (offerIndex === -1) return false;

    const offer = this.tradeOffers[offerIndex];

    // Only reject if it's targeted at this player
    if (offer.targetPlayerId === playerId) {
      this.tradeOffers.splice(offerIndex, 1);
      return true;
    }

    return false;
  }

  tradeWithBank(playerId, givingResource, receivingResource, amount) {
    const player = this.players.find(p => p.id === playerId);

    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Validate resource types
    const validResources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
    if (!validResources.includes(givingResource) || !validResources.includes(receivingResource)) {
      return { success: false, error: 'Invalid resource type' };
    }

    // Get the best trade rate for this player
    const tradeRate = this.getPlayerTradeRate(playerId, givingResource);
    const requiredAmount = amount || tradeRate;

    // Check if player has enough of the giving resource
    if (player.resources[givingResource] < requiredAmount) {
      return { success: false, error: `Not enough ${givingResource}. Need ${requiredAmount}, have ${player.resources[givingResource]}` };
    }

    // Execute the trade
    player.resources[givingResource] -= requiredAmount;
    player.resources[receivingResource] += 1;

    return {
      success: true,
      playerName: player.name,
      gave: givingResource,
      gaveAmount: requiredAmount,
      received: receivingResource,
      tradeRate: `${requiredAmount}:1`
    };
  }

  getPlayerTradeRate(playerId, resource = null) {
    // Returns the best trade rate available to a player
    // Default is 4:1, can be improved by ports
    let bestRate = 4;

    if (!this.board || !this.board.ports) return bestRate;

    // Check if player has settlements/cities on any port vertices
    this.board.ports.forEach(port => {
      port.vertices.forEach(portVertex => {
        const vertex = this.board.vertices.find(v =>
          Math.abs(v.x - portVertex.x) < 0.01 && Math.abs(v.y - portVertex.y) < 0.01
        );

        if (vertex && vertex.playerId === playerId && vertex.building) {
          // Player has a settlement or city on this port
          if (port.type === '3:1') {
            // Generic 3:1 port
            bestRate = Math.min(bestRate, 3);
          } else if (port.type === '2:1' && port.resource === resource) {
            // Specific 2:1 port for this resource
            bestRate = Math.min(bestRate, 2);
          }
        }
      });
    });

    return bestRate;
  }

  getPlayerPorts(playerId) {
    // Returns all ports accessible to a player
    const accessiblePorts = [];

    if (!this.board || !this.board.ports) return accessiblePorts;

    this.board.ports.forEach(port => {
      let hasAccess = false;

      port.vertices.forEach(portVertex => {
        const vertex = this.board.vertices.find(v =>
          Math.abs(v.x - portVertex.x) < 0.01 && Math.abs(v.y - portVertex.y) < 0.01
        );

        if (vertex && vertex.playerId === playerId && vertex.building) {
          hasAccess = true;
        }
      });

      if (hasAccess) {
        accessiblePorts.push({
          type: port.type,
          resource: port.resource
        });
      }
    });

    return accessiblePorts;
  }

  getState() {
    return {
      id: this.id,
      players: this.players,
      board: this.board,
      currentPlayerIndex: this.currentPlayerIndex,
      phase: this.phase,
      turnPhase: this.turnPhase,
      diceRoll: this.diceRoll,
      setupRound: this.setupRound,
      setupSettlementPlaced: this.setupSettlementPlaced,
      setupRoadPlaced: this.setupRoadPlaced,
      tradeOffers: this.tradeOffers
    };
  }
}

module.exports = Game;
