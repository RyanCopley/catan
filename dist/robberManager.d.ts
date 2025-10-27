import { Board, Player, Hex, HexCoordinate, ResourceType } from './types';
export declare function handleRobber(players: Player[]): void;
export declare function discardCards(player: Player, cardsToDiscard: Partial<Record<ResourceType, number>>): {
    success: boolean;
    error?: string;
};
export declare function checkAllDiscarded(players: Player[]): boolean;
export declare function moveRobber(board: Board, hexCoords: HexCoordinate): {
    success: boolean;
    error?: string;
    stealableTargets?: string[];
};
export declare function getPlayersOnHex(hex: Hex, board: Board): string[];
export declare function stealCard(robber: Player, target: Player | null): {
    success: boolean;
    error?: string;
    stolenResource?: ResourceType | null;
};
export declare function playKnight(player: Player, board: Board, hexCoords: HexCoordinate): {
    success: boolean;
    error?: string;
    stealableTargets?: string[];
};
export declare function calculateLargestArmy(players: Player[]): void;
//# sourceMappingURL=robberManager.d.ts.map