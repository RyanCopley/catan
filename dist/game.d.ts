import { GameState, Board, Player, DiceResult, Coordinate, Edge, HexCoordinate, ResourceType, GamePhase, TurnPhase, Resources } from './types';
export declare class Game {
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
    devCardPlayedThisTurn: boolean;
    private tradeManager;
    private devCardManager;
    constructor(id: string);
    addPlayer(socketId: string, name: string): void;
    hasPlayer(socketId: string): boolean;
    reconnectPlayer(oldSocketId: string, newSocketId: string): boolean;
    start(): boolean;
    rollDice(playerId: string): DiceResult | null;
    private distributeResources;
    buildSettlement(playerId: string, vertex: Coordinate): boolean;
    buildRoad(playerId: string, edge: Edge): boolean;
    buildRoadFree(playerId: string, edge: Edge): boolean;
    buildCity(playerId: string, vertex: Coordinate): boolean;
    discardCards(playerId: string, cardsToDiscard: Partial<Resources>): {
        success: boolean;
        error?: string;
    };
    moveRobber(playerId: string, hexCoords: HexCoordinate): {
        success: boolean;
        error?: string;
        stealableTargets?: string[];
    };
    stealCard(robberId: string, targetPlayerId: string | null): {
        success: boolean;
        error?: string;
        stolenResource?: ResourceType | null;
    };
    buyDevelopmentCard(playerId: string): {
        success: boolean;
        error?: string;
        cardType?: string;
    };
    playKnight(playerId: string, hexCoords: HexCoordinate): {
        success: boolean;
        error?: string;
        stealableTargets?: string[];
    };
    playYearOfPlenty(playerId: string, resource1: ResourceType, resource2: ResourceType): {
        success: boolean;
        error?: string;
        resource1?: ResourceType;
        resource2?: ResourceType;
    };
    playMonopoly(playerId: string, resource: ResourceType): {
        success: boolean;
        error?: string;
        resource?: ResourceType;
        totalTaken?: number;
    };
    playRoadBuilding(playerId: string): {
        success: boolean;
        error?: string;
    };
    createTradeOffer(offeringPlayerId: string, targetPlayerId: string | null, offering: Partial<Resources>, requesting: Partial<Resources>): import("./types").TradeOffer | null;
    respondToTrade(offerId: number, playerId: string, response: 'accepted' | 'rejected'): {
        success: boolean;
        error?: string;
    };
    confirmTrade(offerId: number, offeringPlayerId: string, acceptingPlayerId: string): {
        success: boolean;
        error?: string;
        offeringPlayer?: string;
        acceptingPlayer?: string;
    };
    cancelTradeOffer(offerId: number, playerId: string): boolean;
    tradeWithBank(playerId: string, givingResource: ResourceType, receivingResource: ResourceType, amount?: number): {
        success: boolean;
        error?: string;
        playerName?: string;
        gave?: ResourceType;
        gaveAmount?: number;
        received?: ResourceType;
        tradeRate?: string;
    };
    endTurn(playerId: string): boolean;
    private handleSetupTurn;
    getState(): GameState;
}
//# sourceMappingURL=game.d.ts.map