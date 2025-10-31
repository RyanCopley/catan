// Re-export types from server
export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type TerrainType = 'forest' | 'hills' | 'pasture' | 'fields' | 'mountains' | 'desert';
export type BuildingType = 'settlement' | 'city';
export type DevelopmentCardType = 'knight' | 'victory_point' | 'road_building' | 'year_of_plenty' | 'monopoly';

export interface GameState {
  id: string;
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  turnPhase: 'roll' | 'robber' | 'discard' | 'build' | 'place';
  currentPlayerIndex: number;
  players: Player[];
  board: Board | null;
  longestRoadPlayer: number | null;
  largestArmyPlayer: number | null;
  lastDiceRoll: number | null;
  diceRoll: number | null;
  winner: number | null;
  setupSettlementPlaced: boolean;
  setupRoadPlaced: boolean;
  setupRound: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  resources: Record<ResourceType, number>;
  developmentCards: DevelopmentCardType[];
  newDevelopmentCards: DevelopmentCardType[];
  settlements: Coordinate[]; // Server sends cartesian coordinates
  cities: Coordinate[]; // Server sends cartesian coordinates
  roads: ServerEdge[]; // Server sends cartesian edges
  victoryPoints: number;
  armySize: number; // Server uses armySize, not knightsPlayed
  largestArmy: boolean;
  longestRoad: boolean;
  longestRoadLength: number;
  mustDiscard?: number; // Number of cards that must be discarded
}

// Coordinate type matches server's cartesian coordinates
export interface Coordinate {
  x: number;
  y: number;
}

// Server edge type (cartesian)
export interface ServerEdge {
  v1: Coordinate;
  v2: Coordinate;
  road: boolean | null;
  playerId: string | null;
}

export interface Board {
  hexes: Hex[];
  vertices: ServerVertex[]; // Server uses cartesian coordinates
  edges: ServerEdge[]; // Server uses cartesian coordinates
  ports: Port[];
  robber: Hex;
}

// Server vertex type (cartesian, not used by AI directly)
export interface ServerVertex {
  x: number;
  y: number;
  adjacentHexes: Hex[];
  building: BuildingType | null;
  playerId: string | null;
}

export interface Hex {
  q: number;
  r: number;
  terrain: TerrainType;
  number: number | null;
}

// AI's internal hex-based vertex representation
export interface Vertex {
  q: number;
  r: number;
  direction: 'N' | 'S';
}

// AI's internal hex-based edge representation
export interface Edge {
  q: number;
  r: number;
  direction: 'NE' | 'E' | 'SE';
}

export interface Port {
  vertex: Vertex;
  type: ResourceType | 'any';
  ratio: number;
}

// AI-specific types
export interface Experience {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
  actionMask: boolean[];
  logProb: number;
  value: number;
}

export interface ActionOutput {
  actionIndex: number;
  logProb: number;
  value: number;
}

export enum ActionType {
  // Setup phase
  BUILD_SETTLEMENT_SETUP = 0,
  BUILD_ROAD_SETUP = 100,

  // Main phase - building
  BUILD_SETTLEMENT = 200,
  BUILD_CITY = 300,
  BUILD_ROAD = 400,
  BUY_DEV_CARD = 500,

  // Development cards
  PLAY_KNIGHT = 600,
  PLAY_ROAD_BUILDING = 700,
  PLAY_YEAR_OF_PLENTY = 800,
  PLAY_MONOPOLY = 900,

  // Bank trading (simplified: each resource pair)
  BANK_TRADE = 1000,

  // Robber
  MOVE_ROBBER = 1100,
  STEAL_CARD = 1200,

  // Discard
  DISCARD = 1300,

  // Basic actions
  ROLL_DICE = 1400,
  END_TURN = 1401,
}

export interface DecodedAction {
  type: ActionType;
  data: any;
}
