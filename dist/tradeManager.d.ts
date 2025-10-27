import { Player, TradeOffer, Resources, Board, ResourceType } from './types';
export declare class TradeManager {
    private tradeOffers;
    private nextTradeId;
    createTradeOffer(players: Player[], offeringPlayerId: string, targetPlayerId: string | null, offering: Partial<Resources>, requesting: Partial<Resources>): TradeOffer | null;
    respondToTrade(offerId: number, playerId: string, response: 'accepted' | 'rejected', players: Player[]): {
        success: boolean;
        error?: string;
    };
    confirmTrade(offerId: number, offeringPlayerId: string, acceptingPlayerId: string, players: Player[]): {
        success: boolean;
        error?: string;
        offeringPlayer?: string;
        acceptingPlayer?: string;
    };
    executeTrade(offerId: number, acceptingPlayerId: string, players: Player[]): {
        success: boolean;
        error?: string;
        offeringPlayer?: string;
        acceptingPlayer?: string;
    };
    cancelTradeOffer(offerId: number, playerId: string): boolean;
    getTradeOffers(): TradeOffer[];
}
export declare function tradeWithBank(player: Player, board: Board, givingResource: ResourceType, receivingResource: ResourceType, amount?: number): {
    success: boolean;
    error?: string;
    playerName?: string;
    gave?: ResourceType;
    gaveAmount?: number;
    received?: ResourceType;
    tradeRate?: string;
};
export declare function getPlayerTradeRate(player: Player, board: Board, resource?: ResourceType | null): number;
export declare function getPlayerPorts(player: Player, board: Board): Array<{
    type: string;
    resource: ResourceType | null;
}>;
//# sourceMappingURL=tradeManager.d.ts.map