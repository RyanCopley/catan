import * as tf from '@tensorflow/tfjs-node';
import { GameState, Player, Hex, ResourceType, TerrainType } from '../types';

/**
 * Encodes game state into a fixed-size feature vector for neural network input
 */
export class StateEncoder {
  // Feature dimensions
  private static readonly HEX_COUNT = 19;
  private static readonly VERTEX_COUNT = 38; // Actual vertices in hex range (-2,2) with constraint |q+r|<=2
  private static readonly EDGE_COUNT = 57; // Actual edges in hex range
  private static readonly MAX_PLAYERS = 4;
  private static readonly RESOURCE_TYPES = 5;
  private static readonly TERRAIN_TYPES = 6;

  /**
   * Calculate total state size
   */
  static getStateSize(): number {
    // Board encoding
    const hexFeatures = this.HEX_COUNT * (this.TERRAIN_TYPES + 1 + 1); // terrain one-hot + number + hasRobber
    const vertexFeatures = this.VERTEX_COUNT * (this.MAX_PLAYERS * 2 + 1); // settlement/city per player + empty
    const edgeFeatures = this.EDGE_COUNT * (this.MAX_PLAYERS + 1); // road per player + empty

    // Player encoding (for each player)
    const resourceFeatures = this.MAX_PLAYERS * this.RESOURCE_TYPES; // resource counts
    const devCardFeatures = this.MAX_PLAYERS * 6; // total cards, knights, vp, road_building, yop, monopoly
    const buildingCounts = this.MAX_PLAYERS * 3; // settlements, cities, roads
    const playerStats = this.MAX_PLAYERS * 5; // VP, knights played, has longest road, has largest army, is current player

    // Game state
    const gameStateFeatures = 11; // phase encoding, turn phase, setup round, turn number normalized, etc.

    return hexFeatures + vertexFeatures + edgeFeatures +
           resourceFeatures + devCardFeatures + buildingCounts +
           playerStats + gameStateFeatures;
  }

  /**
   * Encode game state for a specific player's perspective
   */
  static encode(gameState: GameState, playerIndex: number): Float32Array {
    const features: number[] = [];

    // 1. Encode board hexes
    const hexFeat = this.encodeHexes(gameState);
    features.push(...hexFeat);
    if (hexFeat.some(isNaN)) console.error('[StateEnc] NaN in hexes');

    // 2. Encode vertices (settlements/cities)
    const vertFeat = this.encodeVertices(gameState);
    features.push(...vertFeat);
    if (vertFeat.some(isNaN)) console.error('[StateEnc] NaN in vertices');

    // 3. Encode edges (roads)
    const edgeFeat = this.encodeEdges(gameState);
    features.push(...edgeFeat);
    if (edgeFeat.some(isNaN)) console.error('[StateEnc] NaN in edges');

    // 4. Encode resources (from player's perspective)
    const resFeat = this.encodeResources(gameState, playerIndex);
    features.push(...resFeat);
    if (resFeat.some(isNaN)) console.error('[StateEnc] NaN in resources');

    // 5. Encode development cards
    const devFeat = this.encodeDevelopmentCards(gameState, playerIndex);
    features.push(...devFeat);
    if (devFeat.some(isNaN)) console.error('[StateEnc] NaN in dev cards');

    // 6. Encode building counts
    const bldgFeat = this.encodeBuildingCounts(gameState);
    features.push(...bldgFeat);
    if (bldgFeat.some(isNaN)) console.error('[StateEnc] NaN in building counts');

    // 7. Encode player stats
    const statsFeat = this.encodePlayerStats(gameState, playerIndex);
    features.push(...statsFeat);
    if (statsFeat.some(isNaN)) console.error('[StateEnc] NaN in player stats');

    // 8. Encode game state
    const gameFeat = this.encodeGameState(gameState);
    features.push(...gameFeat);
    if (gameFeat.some(isNaN)) console.error('[StateEnc] NaN in game state');

    return new Float32Array(features);
  }

  private static encodeHexes(gameState: GameState): number[] {
    const features: number[] = [];
    const terrainToIndex: Record<TerrainType, number> = {
      forest: 0, hills: 1, pasture: 2, fields: 3, mountains: 4, desert: 5
    };

    // Board might be null if game hasn't started
    if (!gameState.board) {
      // Return zero features for empty board
      return new Array(this.HEX_COUNT * 8).fill(0);
    }

    // Sort hexes by q, r for consistency
    const sortedHexes = [...gameState.board.hexes].sort((a, b) =>
      a.q !== b.q ? a.q - b.q : a.r - b.r
    );

    for (const hex of sortedHexes) {
      // One-hot encode terrain
      const terrainOneHot = new Array(6).fill(0);
      terrainOneHot[terrainToIndex[hex.terrain]] = 1;
      features.push(...terrainOneHot);

      // Number token (normalized)
      features.push(hex.number ? hex.number / 12 : 0);

      // Has robber
      const hasRobber = (gameState.board.robber &&
                        gameState.board.robber.q === hex.q &&
                        gameState.board.robber.r === hex.r) ? 1 : 0;
      features.push(hasRobber);
    }

    return features;
  }

  private static encodeVertices(gameState: GameState): number[] {
    const features: number[] = [];
    const vertices = this.getAllVertices();

    for (const vertex of vertices) {
      // Convert our hex vertex to cartesian coordinates to match against server data
      const cartesian = this.vertexToCartesian(vertex);

      // For each player, encode: has settlement (0/1), has city (0/1)
      for (let i = 0; i < this.MAX_PLAYERS; i++) {
        if (i < gameState.players.length) {
          const player = gameState.players[i];
          const hasSettlement = player.settlements.some(v =>
            Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01
          );
          const hasCity = player.cities.some(v =>
            Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01
          );
          features.push(hasSettlement ? 1 : 0);
          features.push(hasCity ? 1 : 0);
        } else {
          features.push(0, 0); // No player
        }
      }
      // Is empty
      const isEmpty = !gameState.players.some(p =>
        p.settlements.some(v => Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01) ||
        p.cities.some(v => Math.abs(v.x - cartesian.x) < 0.01 && Math.abs(v.y - cartesian.y) < 0.01)
      );
      features.push(isEmpty ? 1 : 0);
    }

    return features;
  }

  private static encodeEdges(gameState: GameState): number[] {
    const features: number[] = [];
    const edges = this.getAllEdges();

    for (const edge of edges) {
      // Convert our hex edge to cartesian coordinates to match against server data
      const cartesian = this.edgeToCartesian(edge);

      // For each player, encode: has road (0/1)
      for (let i = 0; i < this.MAX_PLAYERS; i++) {
        if (i < gameState.players.length) {
          const player = gameState.players[i];
          const hasRoad = player.roads.some(e =>
            this.edgesMatch(e, cartesian)
          );
          features.push(hasRoad ? 1 : 0);
        } else {
          features.push(0); // No player
        }
      }
      // Is empty
      const isEmpty = !gameState.players.some(p =>
        p.roads.some(e => this.edgesMatch(e, cartesian))
      );
      features.push(isEmpty ? 1 : 0);
    }

    return features;
  }

  private static encodeResources(gameState: GameState, playerIndex: number): number[] {
    const features: number[] = [];
    const resources: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

    for (let i = 0; i < this.MAX_PLAYERS; i++) {
      if (i < gameState.players.length) {
        const player = gameState.players[i];

        // For current player, show exact counts; for others, show total only
        if (i === playerIndex) {
          for (const resource of resources) {
            features.push(player.resources[resource] / 10); // Normalize
          }
        } else {
          // For other players, just show total resources
          const total = Object.values(player.resources).reduce((a, b) => a + b, 0);
          features.push(total / 10); // One feature per opponent
          features.push(0, 0, 0, 0); // Pad to same size
        }
      } else {
        features.push(0, 0, 0, 0, 0); // No player
      }
    }

    return features;
  }

  private static encodeDevelopmentCards(gameState: GameState, playerIndex: number): number[] {
    const features: number[] = [];

    for (let i = 0; i < this.MAX_PLAYERS; i++) {
      if (i < gameState.players.length) {
        const player = gameState.players[i];

        if (i === playerIndex) {
          // For current player, show card details
          const totalCards = player.developmentCards.length + player.newDevelopmentCards.length;
          const knights = player.developmentCards.filter(c => c === 'knight').length;
          const vp = player.developmentCards.filter(c => c === 'victory_point').length;
          const roadBuilding = player.developmentCards.filter(c => c === 'road_building').length;
          const yop = player.developmentCards.filter(c => c === 'year_of_plenty').length;
          const monopoly = player.developmentCards.filter(c => c === 'monopoly').length;

          features.push(totalCards / 5, knights / 3, vp / 2, roadBuilding / 2, yop / 2, monopoly / 2);
        } else {
          // For other players, just show total
          const totalCards = player.developmentCards.length + player.newDevelopmentCards.length;
          features.push(totalCards / 5, 0, 0, 0, 0, 0);
        }
      } else {
        features.push(0, 0, 0, 0, 0, 0); // No player
      }
    }

    return features;
  }

  private static encodeBuildingCounts(gameState: GameState): number[] {
    const features: number[] = [];

    for (let i = 0; i < this.MAX_PLAYERS; i++) {
      if (i < gameState.players.length) {
        const player = gameState.players[i];
        features.push(
          player.settlements.length / 5,
          player.cities.length / 4,
          player.roads.length / 15
        );
      } else {
        features.push(0, 0, 0); // No player
      }
    }

    return features;
  }

  private static encodePlayerStats(gameState: GameState, playerIndex: number): number[] {
    const features: number[] = [];

    for (let i = 0; i < this.MAX_PLAYERS; i++) {
      if (i < gameState.players.length) {
        const player = gameState.players[i];
        const vp = (player.victoryPoints ?? 0) / 10;
        const army = (player.armySize ?? 0) / 5;  // Fixed: use armySize instead of knightsPlayed
        const longest = gameState.longestRoadPlayer === i ? 1 : 0;
        const largest = gameState.largestArmyPlayer === i ? 1 : 0;
        const isCurrent = gameState.currentPlayerIndex === i ? 1 : 0;

        // Debug NaN
        if (isNaN(vp)) console.error(`[StateEnc] Player ${i} VP is NaN:`, player.victoryPoints);
        if (isNaN(army)) console.error(`[StateEnc] Player ${i} army is NaN:`, player.armySize);

        features.push(vp, army, longest, largest, isCurrent);
      } else {
        features.push(0, 0, 0, 0, 0); // No player
      }
    }

    return features;
  }

  private static encodeGameState(gameState: GameState): number[] {
    const features: number[] = [];

    // Game phase one-hot
    const phases = ['waiting', 'setup', 'playing', 'finished'];
    const phaseOneHot = phases.map(p => p === gameState.phase ? 1 : 0);
    features.push(...phaseOneHot);

    // Turn phase one-hot
    const turnPhases = ['roll', 'robber', 'discard', 'build'];
    const turnPhaseOneHot = turnPhases.map(p => p === gameState.turnPhase ? 1 : 0);
    features.push(...turnPhaseOneHot);

    // Setup round (normalized: 0 = not in setup, 0.5 = round 1, 1 = round 2)
    const setupRoundNorm = gameState.phase === 'setup' ? (gameState.setupRound / 2) : 0;
    features.push(setupRoundNorm);

    // Last dice roll
    features.push(gameState.lastDiceRoll ? gameState.lastDiceRoll / 12 : 0);

    // Game progress (estimated turn number - we'd need to track this)
    features.push(0.5); // Placeholder

    return features;
  }

  // Helper to get all possible vertices in standard Catan board
  private static getAllVertices() {
    const vertices = [];
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Math.abs(q + r) <= 2) {
          vertices.push({ q, r, direction: 'N' as const });
          vertices.push({ q, r, direction: 'S' as const });
        }
      }
    }
    return vertices.sort((a, b) =>
      a.q !== b.q ? a.q - b.q : a.r !== b.r ? a.r - b.r : a.direction.localeCompare(b.direction)
    );
  }

  // Helper to get all possible edges in standard Catan board
  private static getAllEdges() {
    const edges = [];
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Math.abs(q + r) <= 2) {
          edges.push({ q, r, direction: 'NE' as const });
          edges.push({ q, r, direction: 'E' as const });
          edges.push({ q, r, direction: 'SE' as const });
        }
      }
    }
    return edges.sort((a, b) =>
      a.q !== b.q ? a.q - b.q : a.r !== b.r ? a.r - b.r : a.direction.localeCompare(b.direction)
    );
  }

  /**
   * Convert hex vertex to cartesian coordinates
   * Must match the server's coordinate system
   */
  private static vertexToCartesian(vertex: any): { x: number; y: number } {
    const size = 1;
    const hexX = size * (3/2 * vertex.q);
    const hexY = size * (Math.sqrt(3)/2 * vertex.q + Math.sqrt(3) * vertex.r);

    // Map direction to vertex index (0-5)
    let vertexIndex: number;
    if (vertex.direction === 'N') {
      vertexIndex = 1; // Top-left vertex
    } else if (vertex.direction === 'S') {
      vertexIndex = 4; // Bottom-left vertex
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
  private static edgeToCartesian(edge: any): { v1: { x: number; y: number }; v2: { x: number; y: number } } {
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
}
