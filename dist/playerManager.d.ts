import { Player, Resources } from './types';
export declare function createPlayer(socketId: string, name: string, playerIndex: number): Player;
export declare function hasResources(player: Player, required: Partial<Resources>): boolean;
export declare function deductResources(player: Player, costs: Partial<Resources>): void;
export declare function addResources(player: Player, resources: Partial<Resources>): void;
export declare function getTotalResourceCount(player: Player): number;
export declare function getResourceCards(player: Player): string[];
//# sourceMappingURL=playerManager.d.ts.map