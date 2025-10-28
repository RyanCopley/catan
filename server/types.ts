export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type TerrainType = 'forest' | 'hills' | 'pasture' | 'fields' | 'mountains' | 'desert';
export type BuildingType = 'settlement' | 'city';
export type DevelopmentCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'monopoly' | 'yearOfPlenty';
export type GamePhase = 'waiting' | 'setup' | 'playing' | 'finished';
export type TurnPhase = 'roll' | 'build' | 'trade' | 'robber' | 'place';
export type PlayerColor = 'red' | 'blue' | 'white' | 'orange';
export type PortType = '3:1' | '2:1';
export type TradeResponse = 'pending' | 'accepted' | 'rejected';

export interface Resources {
  wood: number;
  brick: number;
  sheep: number;
  wheat: number;
  ore: number;
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface HexCoordinate {
  q: number;
  r: number;
}

export interface Hex extends HexCoordinate {
  terrain: TerrainType;
  number: number | null;
  hasRobber: boolean;
}

export interface Vertex extends Coordinate {
  adjacentHexes: HexCoordinate[];
  building: BuildingType | null;
  playerId: string | null;
}

export interface Edge {
  v1: Coordinate;
  v2: Coordinate;
  road: boolean | null;
  playerId: string | null;
}

export interface Port {
  type: PortType;
  resource: ResourceType | null;
  vertices: Coordinate[];
  hex: HexCoordinate;
}

export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
  robber: Hex;
}

export interface Player {
  id: string;
  name: string;
  password: string;
  color: PlayerColor;
  resources: Resources;
  developmentCards: DevelopmentCardType[];
  newDevelopmentCards: DevelopmentCardType[];
  victoryPointCards: number;
  settlements: Coordinate[];
  cities: Coordinate[];
  roads: Edge[];
  victoryPoints: number;
  longestRoad: boolean;
  longestRoadLength: number;
  largestArmy: boolean;
  armySize: number;
  mustDiscard?: number;
  freeRoads?: number;
  disconnected?: boolean;
}

export interface TradeOffer {
  id: number;
  offeringPlayerId: string;
  targetPlayerId: string | null;
  offering: Partial<Resources>;
  requesting: Partial<Resources>;
  timestamp: number;
  responses: Record<string, TradeResponse>;
  acceptedBy: string[];
}

export interface GameHistory {
  gameId: string;
  winner: {
    name: string;
    color: PlayerColor;
    victoryPoints: number;
  };
  players: {
    name: string;
    color: PlayerColor;
    victoryPoints: number;
  }[];
  completedAt: number;
  duration?: number;
}

export interface GameState {
  id: string;
  players: Player[];
  board: Board | null;
  currentPlayerIndex: number;
  phase: GamePhase;
  turnPhase: TurnPhase;
  diceRoll: number | null;
  setupRound: number;
  setupSettlementPlaced: boolean;
  setupRoadPlaced: boolean;
  tradeOffers: TradeOffer[];
  developmentCardDeck: DevelopmentCardType[];
}

export interface DiceResult {
  die1: number;
  die2: number;
  total: number;
}
