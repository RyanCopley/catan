import { Board, Player, Edge, Coordinate } from './types';
export declare function buildSettlement(player: Player, board: Board, vertex: Coordinate, isSetup?: boolean, setupRound?: number): boolean;
export declare function buildRoad(player: Player, board: Board, edge: Edge, isSetup?: boolean, lastSettlement?: Coordinate): boolean;
export declare function buildRoadFree(player: Player, board: Board, edge: Edge): boolean;
export declare function buildCity(player: Player, board: Board, vertex: Coordinate): boolean;
export declare function calculateLongestRoad(players: Player[]): void;
//# sourceMappingURL=buildingManager.d.ts.map