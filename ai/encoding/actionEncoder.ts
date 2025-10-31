import { GameState, ActionType, DecodedAction, Vertex, Edge, ResourceType } from '../types';

/**
 * Encodes and decodes actions for the neural network
 * Maps between discrete action indices and actual game actions
 */
export class ActionEncoder {
  private static readonly VERTEX_COUNT = 38; // Actual vertices in hex range (-2,2) with constraint |q+r|<=2
  private static readonly EDGE_COUNT = 57; // Actual edges in hex range
  private static readonly HEX_COUNT = 19;

  // Action space offsets
  private static readonly OFFSETS = {
    BUILD_SETTLEMENT_SETUP: 0,                  // 38 actions
    BUILD_ROAD_SETUP: 38,                       // 57 actions, starts after 38 vertices
    BUILD_SETTLEMENT: 95,                       // 38 actions, after setup (38+57=95)
    BUILD_CITY: 133,                            // 38 actions, after BUILD_SETTLEMENT
    BUILD_ROAD: 171,                            // 57 actions, after BUILD_CITY
    BUY_DEV_CARD: 228,                          // 1 action, after BUILD_ROAD
    PLAY_KNIGHT: 229,                           // 1 action
    MOVE_ROBBER: 230,                           // 19 actions, after PLAY_KNIGHT
    STEAL_CARD: 249,                            // 4 actions, after MOVE_ROBBER (19 hexes)
    END_TURN: 253,                              // 1 action, after STEAL_CARD (4 players)
    ROLL_DICE: 254,                             // 1 action
  };

  /**
   * Get total action space size
   */
  static getActionSize(): number {
    return 255; // Total: 38+57+38+38+57+1+1+19+4+1+1 = 255
  }

  /**
   * Decode action index to game action
   */
  static decode(actionIndex: number, gameState: GameState): DecodedAction | null {
    const { OFFSETS } = this;

    // Setup phase - build settlement
    if (actionIndex >= OFFSETS.BUILD_SETTLEMENT_SETUP && actionIndex < OFFSETS.BUILD_ROAD_SETUP) {
      const vertexIndex = actionIndex - OFFSETS.BUILD_SETTLEMENT_SETUP;
      const vertex = this.getVertexByIndex(vertexIndex);
      return {
        type: ActionType.BUILD_SETTLEMENT_SETUP,
        data: { vertex },
      };
    }

    // Setup phase - build road
    if (actionIndex >= OFFSETS.BUILD_ROAD_SETUP && actionIndex < OFFSETS.BUILD_SETTLEMENT) {
      const edgeIndex = actionIndex - OFFSETS.BUILD_ROAD_SETUP;
      const edge = this.getEdgeByIndex(edgeIndex);
      return {
        type: ActionType.BUILD_ROAD_SETUP,
        data: { edge },
      };
    }

    // Main phase - build settlement
    if (actionIndex >= OFFSETS.BUILD_SETTLEMENT && actionIndex < OFFSETS.BUILD_CITY) {
      const vertexIndex = actionIndex - OFFSETS.BUILD_SETTLEMENT;
      const vertex = this.getVertexByIndex(vertexIndex);
      return {
        type: ActionType.BUILD_SETTLEMENT,
        data: { vertex },
      };
    }

    // Main phase - build city
    if (actionIndex >= OFFSETS.BUILD_CITY && actionIndex < OFFSETS.BUILD_ROAD) {
      const vertexIndex = actionIndex - OFFSETS.BUILD_CITY;
      const vertex = this.getVertexByIndex(vertexIndex);
      return {
        type: ActionType.BUILD_CITY,
        data: { vertex },
      };
    }

    // Main phase - build road
    if (actionIndex >= OFFSETS.BUILD_ROAD && actionIndex < OFFSETS.BUY_DEV_CARD) {
      const edgeIndex = actionIndex - OFFSETS.BUILD_ROAD;
      const edge = this.getEdgeByIndex(edgeIndex);
      return {
        type: ActionType.BUILD_ROAD,
        data: { edge },
      };
    }

    // Buy development card
    if (actionIndex === OFFSETS.BUY_DEV_CARD) {
      return {
        type: ActionType.BUY_DEV_CARD,
        data: {},
      };
    }

    // Play knight
    if (actionIndex === OFFSETS.PLAY_KNIGHT) {
      return {
        type: ActionType.PLAY_KNIGHT,
        data: {},
      };
    }

    // Move robber
    if (actionIndex >= OFFSETS.MOVE_ROBBER && actionIndex < OFFSETS.STEAL_CARD) {
      const hexIndex = actionIndex - OFFSETS.MOVE_ROBBER;
      const hex = this.getHexByIndex(hexIndex, gameState);
      if (!hex) {
        console.error(`[ActionEncoder] Failed to get hex for index ${hexIndex}, returning null`);
        return null;
      }
      return {
        type: ActionType.MOVE_ROBBER,
        data: { hex },
      };
    }

    // Steal card
    if (actionIndex >= OFFSETS.STEAL_CARD && actionIndex < OFFSETS.END_TURN) {
      const playerIndex = actionIndex - OFFSETS.STEAL_CARD;
      return {
        type: ActionType.STEAL_CARD,
        data: { playerIndex },
      };
    }

    // End turn
    if (actionIndex === OFFSETS.END_TURN) {
      return {
        type: ActionType.END_TURN,
        data: {},
      };
    }

    // Roll dice
    if (actionIndex === OFFSETS.ROLL_DICE) {
      return {
        type: ActionType.ROLL_DICE,
        data: {},
      };
    }

    return null;
  }

  /**
   * Get all valid vertices
   */
  private static getAllVertices(): Vertex[] {
    const vertices: Vertex[] = [];
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Math.abs(q + r) <= 2) {
          vertices.push({ q, r, direction: 'N' });
          vertices.push({ q, r, direction: 'S' });
        }
      }
    }
    return vertices.sort((a, b) =>
      a.q !== b.q ? a.q - b.q : a.r !== b.r ? a.r - b.r : a.direction.localeCompare(b.direction)
    );
  }

  /**
   * Get all valid edges
   */
  private static getAllEdges(): Edge[] {
    const edges: Edge[] = [];
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Math.abs(q + r) <= 2) {
          edges.push({ q, r, direction: 'NE' });
          edges.push({ q, r, direction: 'E' });
          edges.push({ q, r, direction: 'SE' });
        }
      }
    }
    return edges.sort((a, b) =>
      a.q !== b.q ? a.q - b.q : a.r !== b.r ? a.r - b.r : a.direction.localeCompare(b.direction)
    );
  }

  /**
   * Get vertex by index
   */
  private static getVertexByIndex(index: number): Vertex {
    const vertices = this.getAllVertices();
    return vertices[index];
  }

  /**
   * Get edge by index
   */
  private static getEdgeByIndex(index: number): Edge {
    const edges = this.getAllEdges();
    return edges[index];
  }

  /**
   * Get hex by index
   */
  private static getHexByIndex(index: number, gameState: GameState) {
    if (!gameState.board) {
      return { q: 0, r: 0 }; // Fallback
    }
    const sortedHexes = [...gameState.board.hexes].sort((a, b) =>
      a.q !== b.q ? a.q - b.q : a.r - b.r
    );
    // Bounds check
    if (index < 0 || index >= sortedHexes.length) {
      console.error(`[ActionEncoder] Invalid hex index: ${index}, max: ${sortedHexes.length - 1}`);
      return sortedHexes[0] || { q: 0, r: 0 }; // Fallback to first hex
    }
    return sortedHexes[index];
  }

  /**
   * Create action mask based on current game state
   * Returns boolean array where true = valid action
   */
  static createActionMask(gameState: GameState, playerIndex: number, robberMovedThisTurn: boolean = false): boolean[] {
    const mask = new Array(this.getActionSize()).fill(false);
    const player = gameState.players[playerIndex];

    // Not current player - no valid actions
    if (gameState.currentPlayerIndex !== playerIndex) {
      return mask;
    }

    // Setup phase
    if (gameState.phase === 'setup') {
      if (gameState.turnPhase === 'place') {
        // In setup, player must place settlement first, then road, then end turn
        if (!gameState.setupSettlementPlaced) {
          // Can build settlements on empty vertices that follow distance rule
          this.maskSettlementActions(gameState, playerIndex, mask, this.OFFSETS.BUILD_SETTLEMENT_SETUP, true);
        } else if (!gameState.setupRoadPlaced) {
          // Must build road after settlement
          this.maskRoadActions(gameState, playerIndex, mask, this.OFFSETS.BUILD_ROAD_SETUP, true);
        } else {
          // Both settlement and road placed - can end turn
          mask[this.OFFSETS.END_TURN] = true;
        }

        const validActions = mask.filter(m => m).length;
        console.log(`[ActionMask] Setup phase - Player ${playerIndex} has ${validActions} valid actions (settlementPlaced: ${gameState.setupSettlementPlaced}, roadPlaced: ${gameState.setupRoadPlaced})`);
      }
      return mask;
    }

    // Main game phase
    if (gameState.phase === 'playing') {
      // Roll phase - can only roll
      if (gameState.turnPhase === 'roll') {
        mask[this.OFFSETS.ROLL_DICE] = true;
        return mask;
      }

      // Robber phase - must move robber then steal (or skip stealing)
      if (gameState.turnPhase === 'robber') {
        if (!robberMovedThisTurn) {
          // Must move robber first - can move to any hex except current position
          let canMoveRobber = false;
          for (let i = 0; i < this.HEX_COUNT; i++) {
            const hex = this.getHexByIndex(i, gameState);
            if (!gameState.board?.robber || hex.q !== gameState.board.robber.q || hex.r !== gameState.board.robber.r) {
              mask[this.OFFSETS.MOVE_ROBBER + i] = true;
              canMoveRobber = true;
            }
          }
          console.log(`[ActionMask] Robber phase - Player ${playerIndex}: must move robber, canMove=${canMoveRobber}`);
        } else {
          // Robber already moved, now can steal from adjacent players (or pass)
          for (let i = 0; i < gameState.players.length; i++) {
            if (i !== playerIndex) {
              mask[this.OFFSETS.STEAL_CARD + i] = true;
            }
          }
          console.log(`[ActionMask] Robber phase - Player ${playerIndex}: robber moved, can steal`);
        }
        return mask;
      }

      // Build phase - can build, buy dev cards, play dev cards, or end turn
      if (gameState.turnPhase === 'build') {
        // Building actions
        this.maskSettlementActions(gameState, playerIndex, mask, this.OFFSETS.BUILD_SETTLEMENT, false);
        this.maskCityActions(gameState, playerIndex, mask);
        this.maskRoadActions(gameState, playerIndex, mask, this.OFFSETS.BUILD_ROAD, false);

        // Buy development card (if can afford: 1 ore, 1 sheep, 1 wheat)
        if (player.resources.ore >= 1 && player.resources.sheep >= 1 && player.resources.wheat >= 1) {
          mask[this.OFFSETS.BUY_DEV_CARD] = true;
        }

        // Play knight - DISABLED for now (requires hex selection which is complex)
        // TODO: Implement proper knight card with hex selection
        // if (player.developmentCards.includes('knight')) {
        //   mask[this.OFFSETS.PLAY_KNIGHT] = true;
        // }

        // Always can end turn
        mask[this.OFFSETS.END_TURN] = true;
      }
    }

    return mask;
  }

  private static maskSettlementActions(
    gameState: GameState,
    playerIndex: number,
    mask: boolean[],
    offset: number,
    isSetup: boolean
  ) {
    const player = gameState.players[playerIndex];
    const vertices = this.getAllVertices();

    // Check resources (not needed in setup)
    if (!isSetup) {
      if (player.resources.wood < 1 || player.resources.brick < 1 ||
          player.resources.sheep < 1 || player.resources.wheat < 1) {
        return;
      }
    }

    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      const cartesian = this.vertexToCartesian(vertex);

      // Check if vertex is empty (compare cartesian coordinates)
      const isEmpty = !gameState.players.some(p =>
        p.settlements.some(v => Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01) ||
        p.cities.some(v => Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01)
      );

      if (isEmpty) {
        // Check distance rule (no settlements within distance 1)
        const meetsDistanceRule = this.checkDistanceRule(vertex, gameState);

        // In setup, just need distance rule
        if (isSetup && meetsDistanceRule) {
          mask[offset + i] = true;
        }
        // In main game, need distance rule AND connection to road
        else if (!isSetup && meetsDistanceRule && this.hasAdjacentRoad(vertex, player)) {
          mask[offset + i] = true;
        }
      }
    }
  }

  private static maskCityActions(gameState: GameState, playerIndex: number, mask: boolean[]) {
    const player = gameState.players[playerIndex];

    // Check resources: 3 ore, 2 wheat
    if (player.resources.ore < 3 || player.resources.wheat < 2) {
      return;
    }

    const vertices = this.getAllVertices();
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      const cartesian = this.vertexToCartesian(vertex);

      // Can upgrade if we have a settlement there
      const hasSettlement = player.settlements.some(v =>
        Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01
      );

      if (hasSettlement) {
        mask[this.OFFSETS.BUILD_CITY + i] = true;
      }
    }
  }

  private static maskRoadActions(
    gameState: GameState,
    playerIndex: number,
    mask: boolean[],
    offset: number,
    isSetup: boolean
  ) {
    const player = gameState.players[playerIndex];
    const edges = this.getAllEdges();

    // Check resources (not needed in setup)
    if (!isSetup) {
      if (player.resources.wood < 1 || player.resources.brick < 1) {
        return;
      }
    }

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const cartesian = this.edgeToCartesian(edge);

      // Check if edge is empty (compare cartesian coordinates)
      const isEmpty = !gameState.players.some(p =>
        p.roads.some(e => this.edgesMatch(e, cartesian))
      );

      if (isEmpty) {
        // During setup, road must connect to the last settlement placed
        if (isSetup) {
          if (player.settlements.length > 0) {
            const lastSettlement = player.settlements[player.settlements.length - 1];
            const edgeConnectsToSettlement = this.edgeConnectsToVertex(cartesian, lastSettlement);
            if (edgeConnectsToSettlement) {
              mask[offset + i] = true;
            }
          }
        } else {
          // During main game, road must connect to our roads or settlements
          const isConnected = this.isEdgeConnected(edge, player);
          if (isConnected) {
            mask[offset + i] = true;
          }
        }
      }
    }
  }

  private static checkDistanceRule(vertex: Vertex, gameState: GameState): boolean {
    const cartesian = this.vertexToCartesian(vertex);

    // Check distance to all existing settlements and cities
    for (const player of gameState.players) {
      // Check settlements
      for (const settlement of player.settlements) {
        if (this.verticesAreAdjacent(cartesian, settlement)) {
          return false; // Too close to another settlement
        }
      }
      // Check cities
      for (const city of player.cities) {
        if (this.verticesAreAdjacent(cartesian, city)) {
          return false; // Too close to another city
        }
      }
    }

    return true;
  }

  /**
   * Check if two vertices are adjacent (within distance 1 edge)
   * In a hex grid, vertices are adjacent if they share an edge
   */
  private static verticesAreAdjacent(v1: { x: number; y: number }, v2: { x: number; y: number }): boolean {
    const tolerance = 0.01;
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // On a standard hex grid with size 1, adjacent vertices are ~1.0 apart
    // Same vertex is 0, adjacent is ~1.0, distance-2 is ~1.732
    return distance < 1.1; // Allow some tolerance for floating point
  }

  private static hasAdjacentRoad(vertex: Vertex, player: any): boolean {
    const cartesianVertex = this.vertexToCartesian(vertex);

    // Check if any of our roads connect to this vertex
    for (const road of player.roads) {
      if (this.edgeConnectsToVertex(road, cartesianVertex)) {
        return true;
      }
    }

    return false;
  }

  private static isEdgeConnected(edge: Edge, player: any): boolean {
    const cartesianEdge = this.edgeToCartesian(edge);

    // Check if this edge connects to any of our settlements or cities
    for (const settlement of player.settlements) {
      if (this.edgeConnectsToVertex(cartesianEdge, settlement)) {
        return true;
      }
    }
    for (const city of player.cities) {
      if (this.edgeConnectsToVertex(cartesianEdge, city)) {
        return true;
      }
    }

    // Check if this edge connects to any of our roads
    for (const road of player.roads) {
      if (this.edgesAreAdjacent(cartesianEdge, road)) {
        return true;
      }
    }

    // Debug: Log why connection failed
    if (player.roads.length === 0 && player.settlements.length === 0) {
      console.log(`[isEdgeConnected] Player has no roads or settlements yet`);
    }

    return false;
  }

  /**
   * Check if two edges are adjacent (share a vertex)
   */
  private static edgesAreAdjacent(e1: { v1: { x: number; y: number }; v2: { x: number; y: number } }, e2: { v1: { x: number; y: number }; v2: { x: number; y: number } }): boolean {
    const tolerance = 0.01; // Match the tolerance used in edgesMatch

    // Check if any vertex of e1 matches any vertex of e2
    return (
      (Math.abs(e1.v1.x - e2.v1.x) < tolerance && Math.abs(e1.v1.y - e2.v1.y) < tolerance) ||
      (Math.abs(e1.v1.x - e2.v2.x) < tolerance && Math.abs(e1.v1.y - e2.v2.y) < tolerance) ||
      (Math.abs(e1.v2.x - e2.v1.x) < tolerance && Math.abs(e1.v2.y - e2.v1.y) < tolerance) ||
      (Math.abs(e1.v2.x - e2.v2.x) < tolerance && Math.abs(e1.v2.y - e2.v2.y) < tolerance)
    );
  }

  /**
   * Convert hex vertex to cartesian coordinates
   * Must match the server's coordinate system
   */
  private static vertexToCartesian(vertex: Vertex): { x: number; y: number } {
    const size = 1;
    const hexX = size * (3/2 * vertex.q);
    const hexY = size * (Math.sqrt(3)/2 * vertex.q + Math.sqrt(3) * vertex.r);

    let vertexIndex: number;
    if (vertex.direction === 'N') {
      vertexIndex = 1;
    } else if (vertex.direction === 'S') {
      vertexIndex = 4;
    } else {
      vertexIndex = 0;
    }

    const angle = Math.PI / 3 * vertexIndex;
    const x = parseFloat((hexX + size * Math.cos(angle)).toFixed(3));
    const y = parseFloat((hexY + size * Math.sin(angle)).toFixed(3));

    return { x, y };
  }

  /**
   * Convert hex edge to cartesian coordinates
   * Must match the server's coordinate system
   */
  private static edgeToCartesian(edge: Edge): { v1: { x: number; y: number }; v2: { x: number; y: number } } {
    const size = 1;
    const hexX = size * (3/2 * edge.q);
    const hexY = size * (Math.sqrt(3)/2 * edge.q + Math.sqrt(3) * edge.r);

    let v1Index: number, v2Index: number;
    switch (edge.direction) {
      case 'NE':
        v1Index = 0;
        v2Index = 1;
        break;
      case 'E':
        v1Index = 5;
        v2Index = 0;
        break;
      case 'SE':
        v1Index = 4;
        v2Index = 5;
        break;
      default:
        v1Index = 0;
        v2Index = 1;
    }

    const angle1 = Math.PI / 3 * v1Index;
    const angle2 = Math.PI / 3 * v2Index;

    const v1 = {
      x: parseFloat((hexX + size * Math.cos(angle1)).toFixed(3)),
      y: parseFloat((hexY + size * Math.sin(angle1)).toFixed(3))
    };

    const v2 = {
      x: parseFloat((hexX + size * Math.cos(angle2)).toFixed(3)),
      y: parseFloat((hexY + size * Math.sin(angle2)).toFixed(3))
    };

    return { v1, v2 };
  }

  /**
   * Check if two edges match (order doesn't matter)
   */
  private static edgesMatch(e1: any, e2: any): boolean {
    const tolerance = 0.01;
    return (
      (Math.abs(e1.v1.x - e2.v1.x) < tolerance && Math.abs(e1.v1.y - e2.v1.y) < tolerance &&
       Math.abs(e1.v2.x - e2.v2.x) < tolerance && Math.abs(e1.v2.y - e2.v2.y) < tolerance) ||
      (Math.abs(e1.v1.x - e2.v2.x) < tolerance && Math.abs(e1.v1.y - e2.v2.y) < tolerance &&
       Math.abs(e1.v2.x - e2.v1.x) < tolerance && Math.abs(e1.v2.y - e2.v1.y) < tolerance)
    );
  }

  /**
   * Check if an edge connects to a vertex
   */
  private static edgeConnectsToVertex(edge: any, vertex: any): boolean {
    const tolerance = 0.01; // Match the tolerance used in edgesMatch
    return (
      (Math.abs(edge.v1.x - vertex.x) < tolerance && Math.abs(edge.v1.y - vertex.y) < tolerance) ||
      (Math.abs(edge.v2.x - vertex.x) < tolerance && Math.abs(edge.v2.y - vertex.y) < tolerance)
    );
  }
}
