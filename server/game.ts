import {
  GameState, Board, Player, DiceResult, Coordinate, Edge, HexCoordinate,
  ResourceType, GamePhase, TurnPhase, Resources, GameHistory
} from './types';
import { generateBoard } from './boardGenerator';
import { createPlayer, getVictoryPoints } from './playerManager';
import { TradeManager, tradeWithBank } from './tradeManager';
import { DevelopmentCardManager, playYearOfPlenty, playMonopoly, playRoadBuilding, moveNewCardsToPlayable } from './developmentCardManager';
import { buildSettlement, buildRoad, buildCity, buildRoadFree, calculateLongestRoad } from './buildingManager';
import {
  handleRobber, discardCards, checkAllDiscarded, moveRobber,
  stealCard, playKnight, calculateLargestArmy
} from './robberManager';
import { censorGameState, censorGameStateForSpectator } from './stateCensor';

export class Game {
  id: string;
  players: Player[];
  spectators: Set<string>;
  board: Board | null;
  currentPlayerIndex: number;
  phase: GamePhase;
  turnPhase: TurnPhase;
  diceRoll: number | null;
  lastDiceResult: DiceResult | null;
  setupRound: number;
  setupSettlementPlaced: boolean;
  setupRoadPlaced: boolean;
  devCardPlayedThisTurn: boolean;
  startedAt: number | null;
  lastActivityAt: number;

  private tradeManager: TradeManager;
  private devCardManager: DevelopmentCardManager;

  constructor(id: string) {
    this.id = id;
    this.players = [];
    this.spectators = new Set();
    this.board = null;
    this.currentPlayerIndex = 0;
    this.phase = 'waiting';
    this.turnPhase = 'roll';
    this.diceRoll = null;
    this.lastDiceResult = null;
    this.setupRound = 1;
    this.setupSettlementPlaced = false;
    this.setupRoadPlaced = false;
    this.devCardPlayedThisTurn = false;
    this.startedAt = null;
    this.lastActivityAt = Date.now();

    this.tradeManager = new TradeManager();
    this.devCardManager = new DevelopmentCardManager();
  }

  addPlayer(socketId: string, name: string, password: string): void {
    const player = createPlayer(socketId, name, this.players.length, password);
    this.players.push(player);
  }

  removePlayer(playerId: string): boolean {
    if (this.phase !== 'waiting') return false;

    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return false;

    this.players.splice(index, 1);

    if (this.players.length === 0) {
      this.currentPlayerIndex = 0;
    } else if (this.currentPlayerIndex >= this.players.length) {
      this.currentPlayerIndex = 0;
    }

    return true;
  }

  hasPlayer(socketId: string): boolean {
    return this.players.some(p => p.id === socketId);
  }

  addSpectator(socketId: string): void {
    this.spectators.add(socketId);
  }

  removeSpectator(socketId: string): void {
    this.spectators.delete(socketId);
  }

  hasSpectator(socketId: string): boolean {
    return this.spectators.has(socketId);
  }

  reconnectPlayer(oldSocketId: string, newSocketId: string): boolean {
    const player = this.players.find(p => p.id === oldSocketId);
    if (!player) return false;

    player.id = newSocketId;
    this.lastActivityAt = Date.now();

    if (this.board) {
      this.board.vertices.forEach(v => {
        if (v.playerId === oldSocketId) {
          v.playerId = newSocketId;
        }
      });

      this.board.edges.forEach(e => {
        if (e.playerId === oldSocketId) {
          e.playerId = newSocketId;
        }
      });
    }

    return true;
  }

  toggleReady(playerId: string): boolean {
    if (this.phase !== 'waiting') return false;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    player.ready = !player.ready;
    return true;
  }

  areAllPlayersReady(): boolean {
    if (this.players.length < 2) return false;
    return this.players.every(p => p.ready === true);
  }

  start(): boolean {
    if (this.players.length < 2) return false;

    this.board = generateBoard();
    this.devCardManager.initialize();
    this.phase = 'setup';
    this.turnPhase = 'place';
    this.lastDiceResult = null;
    this.startedAt = Date.now();
    return true;
  }

  rollDice(playerId: string): DiceResult | null {
    if (this.phase !== 'playing') return null;
    if (this.players[this.currentPlayerIndex].id !== playerId) return null;
    if (this.turnPhase !== 'roll') return null;

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    this.diceRoll = die1 + die2;
    this.lastDiceResult = { die1, die2, total: this.diceRoll };

    if (this.diceRoll === 7) {
      handleRobber(this.players);
      this.turnPhase = 'robber';
    } else {
      this.distributeResources(this.diceRoll);
      this.turnPhase = 'build';
    }

    return { die1, die2, total: this.diceRoll };
  }

  private distributeResources(number: number): void {
    if (!this.board) return;

    const resourceMap: Record<string, ResourceType> = {
      forest: 'wood',
      hills: 'brick',
      pasture: 'sheep',
      fields: 'wheat',
      mountains: 'ore'
    };

    this.board.hexes.forEach(hex => {
      if (hex.number === number && !hex.hasRobber) {
        this.board!.vertices.forEach(vertex => {
          if (vertex.building && vertex.adjacentHexes.some(h => h.q === hex.q && h.r === hex.r)) {
            const player = this.players.find(p => p.id === vertex.playerId);
            if (player) {
              const resource = resourceMap[hex.terrain];
              if (resource) {
                const amount = vertex.building === 'city' ? 2 : 1;
                player.resources[resource] += amount;
              }
            }
          }
        });
      }
    });
  }

  buildSettlement(playerId: string, vertex: Coordinate): boolean {
    if (!this.board) return false;
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    if (this.phase === 'setup') {
      if (this.setupSettlementPlaced) return false;
      const success = buildSettlement(player, this.board, vertex, true, this.setupRound);
      if (success) {
        this.setupSettlementPlaced = true;
      }
      return success;
    }

    return buildSettlement(player, this.board, vertex, false);
  }

  buildRoad(playerId: string, edge: Edge): boolean {
    if (!this.board) return false;
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    if (this.phase === 'setup') {
      if (!this.setupSettlementPlaced) return false;
      if (this.setupRoadPlaced) return false;

      const lastSettlement = player.settlements[player.settlements.length - 1];
      const success = buildRoad(player, this.board, edge, true, lastSettlement);
      if (success) {
        this.setupRoadPlaced = true;
        // Calculate longest road even during setup so UI shows correct road count
        calculateLongestRoad(this.players, this.board);
      }
      return success;
    }

    const success = buildRoad(player, this.board, edge, false);
    if (success) {
      calculateLongestRoad(this.players, this.board);
    }
    return success;
  }

  buildRoadFree(playerId: string, edge: Edge): boolean {
    if (!this.board) return false;
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    const success = buildRoadFree(player, this.board, edge);
    if (success) {
      calculateLongestRoad(this.players, this.board);
    }
    return success;
  }

  buildCity(playerId: string, vertex: Coordinate): boolean {
    if (!this.board) return false;

    // Only the current player can build cities during their turn
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    // Cities can only be built during the build phase of the playing phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') return false;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    return buildCity(player, this.board, vertex);
  }

  discardCards(playerId: string, cardsToDiscard: Partial<Resources>): { success: boolean; error?: string } {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    return discardCards(player, cardsToDiscard);
  }

  moveRobber(playerId: string, hexCoords: HexCoordinate): { success: boolean; error?: string; stealableTargets?: string[] } {
    if (!this.board) return { success: false, error: 'No board' };
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.turnPhase !== 'robber') {
      return { success: false, error: 'Cannot move robber now' };
    }

    if (!checkAllDiscarded(this.players)) {
      return { success: false, error: 'Waiting for players to discard' };
    }

    return moveRobber(this.board, hexCoords);
  }

  stealCard(robberId: string, targetPlayerId: string | null): { success: boolean; error?: string; stolenResource?: ResourceType | null } {
    const robber = this.players.find(p => p.id === robberId);
    const target = targetPlayerId ? this.players.find(p => p.id === targetPlayerId) || null : null;

    if (!robber) {
      return { success: false, error: 'Robber not found' };
    }

    const result = stealCard(robber, target);
    if (result.success) {
      this.turnPhase = 'build';
    }
    return result;
  }

  buyDevelopmentCard(playerId: string): { success: boolean; error?: string; cardType?: string } {
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only buy cards during build phase' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    return this.devCardManager.buyCard(player);
  }

  playKnight(playerId: string, hexCoords: HexCoordinate): { success: boolean; error?: string; stealableTargets?: string[] } {
    if (!this.board) return { success: false, error: 'No board' };
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const result = playKnight(player, this.board, hexCoords);
    if (result.success) {
      this.devCardPlayedThisTurn = true;
      calculateLargestArmy(this.players);
    }
    return result;
  }

  playYearOfPlenty(playerId: string, resource1: ResourceType, resource2: ResourceType): { success: boolean; error?: string; resource1?: ResourceType; resource2?: ResourceType } {
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const result = playYearOfPlenty(player, resource1, resource2);
    if (result.success) {
      this.devCardPlayedThisTurn = true;
    }
    return result;
  }

  playMonopoly(playerId: string, resource: ResourceType): { success: boolean; error?: string; resource?: ResourceType; totalTaken?: number } {
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const result = playMonopoly(player, resource, this.players);
    if (result.success) {
      this.devCardPlayedThisTurn = true;
    }
    return result;
  }

  playRoadBuilding(playerId: string): { success: boolean; error?: string } {
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only play cards during build phase' };
    }

    if (this.devCardPlayedThisTurn) {
      return { success: false, error: 'You can only play one development card per turn' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const result = playRoadBuilding(player);
    if (result.success) {
      this.devCardPlayedThisTurn = true;
    }
    return result;
  }

  createTradeOffer(offeringPlayerId: string, targetPlayerId: string | null, offering: Partial<Resources>, requesting: Partial<Resources>) {
    // Only the current player can initiate trades during their turn
    if (this.players[this.currentPlayerIndex].id !== offeringPlayerId) {
      return null;
    }

    // Trading is only allowed during the build phase of the playing phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return null;
    }

    return this.tradeManager.createTradeOffer(this.players, offeringPlayerId, targetPlayerId, offering, requesting);
  }

  respondToTrade(offerId: number, playerId: string, response: 'accepted' | 'rejected') {
    return this.tradeManager.respondToTrade(offerId, playerId, response, this.players);
  }

  confirmTrade(offerId: number, offeringPlayerId: string, acceptingPlayerId: string) {
    return this.tradeManager.confirmTrade(offerId, offeringPlayerId, acceptingPlayerId, this.players);
  }

  cancelTradeOffer(offerId: number, playerId: string): boolean {
    return this.tradeManager.cancelTradeOffer(offerId, playerId);
  }

  tradeWithBank(playerId: string, givingResource: ResourceType, receivingResource: ResourceType, amount?: number) {
    if (!this.board) return { success: false, error: 'No board' };

    // Only the current player can trade with the bank during their turn
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Bank trading is only allowed during the build phase of the playing phase
    if (this.phase !== 'playing' || this.turnPhase !== 'build') {
      return { success: false, error: 'Can only trade with bank during build phase' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    return tradeWithBank(player, this.board, givingResource, receivingResource, amount);
  }

  endTurn(playerId: string): boolean {
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;

    if (this.phase === 'setup') {
      if (!this.setupSettlementPlaced || !this.setupRoadPlaced) return false;
      this.handleSetupTurn();
    } else {
      const player = this.players[this.currentPlayerIndex];
      moveNewCardsToPlayable(player);
      this.devCardPlayedThisTurn = false;

      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      this.turnPhase = 'roll';
      this.diceRoll = null;
    }

    const winner = this.players.find(p => getVictoryPoints(p) >= 10);
    if (winner) {
      this.phase = 'finished';
    }

    return true;
  }

  private handleSetupTurn(): void {
    this.setupSettlementPlaced = false;
    this.setupRoadPlaced = false;

    if (this.setupRound === 1) {
      if (this.currentPlayerIndex < this.players.length - 1) {
        this.currentPlayerIndex++;
      } else {
        this.setupRound = 2;
      }
    } else if (this.setupRound === 2) {
      if (this.currentPlayerIndex > 0) {
        this.currentPlayerIndex--;
      } else {
        this.phase = 'playing';
        this.currentPlayerIndex = 0;
        this.turnPhase = 'roll';
      }
    }
  }

  /**
   * Get the full, uncensored game state.
   * ONLY use this internally for saving to cache or when you need the complete state.
   * For sending to clients, use getStateForPlayer() or getStateForSpectator() instead.
   */
  getState(): GameState {
    // Compute victory points for all players before returning state
    const playersWithVP = this.players.map(player => ({
      ...player,
      victoryPoints: getVictoryPoints(player)
    }));

    return {
      id: this.id,
      players: playersWithVP,
      board: this.board,
      currentPlayerIndex: this.currentPlayerIndex,
      phase: this.phase,
      turnPhase: this.turnPhase,
      diceRoll: this.diceRoll,
      lastDiceResult: this.lastDiceResult,
      setupRound: this.setupRound,
      setupSettlementPlaced: this.setupSettlementPlaced,
      setupRoadPlaced: this.setupRoadPlaced,
      tradeOffers: this.tradeManager.getTradeOffers(),
      developmentCardDeck: this.devCardManager.getDeck()
    };
  }

  /**
   * Get a censored game state for a specific player.
   * This hides sensitive information like other players' cards and passwords.
   *
   * @param playerId - The socket ID of the player requesting the state
   * @returns A censored game state safe for this player
   */
  getStateForPlayer(playerId: string): GameState {
    const fullState = this.getState();
    return censorGameState(fullState, playerId);
  }

  /**
   * Get a censored game state for spectators.
   * This hides all sensitive information.
   *
   * @returns A censored game state safe for spectators
   */
  getStateForSpectator(): GameState {
    const fullState = this.getState();
    return censorGameStateForSpectator(fullState);
  }

  updateActivity(): void {
    this.lastActivityAt = Date.now();
  }

  restoreState(state: GameState): void {
    this.players = state.players;
    this.board = state.board;
    this.currentPlayerIndex = state.currentPlayerIndex;
    this.phase = state.phase;
    this.turnPhase = state.turnPhase;
    this.diceRoll = state.diceRoll;
    this.lastDiceResult = state.lastDiceResult ?? null;
    this.setupRound = state.setupRound;
    this.setupSettlementPlaced = state.setupSettlementPlaced;
    this.setupRoadPlaced = state.setupRoadPlaced;

    // Restore trade offers
    if (state.tradeOffers) {
      this.tradeManager.restoreTradeOffers(state.tradeOffers);
    }

    // Restore development card deck
    if (state.developmentCardDeck && state.developmentCardDeck.length > 0) {
      // Deck exists in saved state, restore it
      this.devCardManager.setDeck(state.developmentCardDeck);
    } else if (this.phase === 'waiting' || (this.phase === 'setup' && state.developmentCardDeck === undefined)) {
      // Old save from before dev card deck was persisted, or brand new game
      // Re-initialize the deck
      console.warn(`Game ${this.id}: Development card deck missing, re-initializing`);
      this.devCardManager.initialize();
    }
    // else: deck is intentionally empty (all cards drawn), keep it empty
  }

  createGameHistory(): GameHistory | null {
    if (this.phase !== 'finished') return null;

    const winner = this.players.find(p => getVictoryPoints(p) >= 10);
    if (!winner) return null;

    const completedAt = Date.now();
    const duration = this.startedAt ? completedAt - this.startedAt : undefined;

    return {
      gameId: this.id,
      winner: {
        name: winner.name,
        color: winner.color,
        victoryPoints: getVictoryPoints(winner)
      },
      players: this.players.map(p => ({
        name: p.name,
        color: p.color,
        victoryPoints: getVictoryPoints(p)
      })),
      completedAt,
      duration
    };
  }
}
