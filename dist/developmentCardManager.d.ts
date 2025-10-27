import { DevelopmentCardType, Player, ResourceType } from './types';
export declare class DevelopmentCardManager {
    private deck;
    initialize(): void;
    buyCard(player: Player): {
        success: boolean;
        error?: string;
        cardType?: DevelopmentCardType;
    };
    getDeckSize(): number;
}
export declare function playYearOfPlenty(player: Player, resource1: ResourceType, resource2: ResourceType): {
    success: boolean;
    error?: string;
    resource1?: ResourceType;
    resource2?: ResourceType;
};
export declare function playMonopoly(player: Player, resource: ResourceType, allPlayers: Player[]): {
    success: boolean;
    error?: string;
    resource?: ResourceType;
    totalTaken?: number;
};
export declare function playRoadBuilding(player: Player): {
    success: boolean;
    error?: string;
};
export declare function moveNewCardsToPlayable(player: Player): void;
//# sourceMappingURL=developmentCardManager.d.ts.map