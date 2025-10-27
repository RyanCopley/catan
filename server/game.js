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
  }

  addPlayer(socketId, name) {
    const colors = ['red', 'blue', 'white', 'orange'];
    const player = {
      id: socketId,
      name: name,
      color: colors[this.players.length],
      resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      developmentCards: [],
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
    this.phase = 'setup';
    this.turnPhase = 'place';
    return true;
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

    return { hexes, vertices, edges, robber: hexes.find(h => h.hasRobber) };
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
    } else {
      this.distributeResources(this.diceRoll);
    }

    this.turnPhase = 'build';
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
      }
    });
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
      player.victoryPoints++;
      return true;
    }

    return false;
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

  executeTrade(offerId, acceptingPlayerId) {
    // Simplified trade execution
    // In a full implementation, track trade offers and execute them
    return true;
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
      setupRoadPlaced: this.setupRoadPlaced
    };
  }
}

module.exports = Game;
