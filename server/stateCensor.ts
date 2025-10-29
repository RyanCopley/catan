import { GameState, Player, DevelopmentCardType } from './types';

/**
 * Creates a player-specific view of the game state, censoring sensitive information
 * that should only be visible to specific players.
 *
 * Sensitive data that gets censored:
 * - Other players' passwords
 * - Other players' exact resource counts (replaced with total count)
 * - Other players' development cards (only card count is shown)
 * - Other players' newDevelopmentCards (cards drawn this turn)
 * - Development card deck (prevents card counting)
 *
 * @param state - The full game state
 * @param requestingPlayerId - The socket ID of the player requesting the state (null for spectators)
 * @returns A censored version of the game state safe for the requesting player
 */
export function censorGameState(state: GameState, requestingPlayerId: string | null): GameState {
  // Deep clone the state to avoid mutating the original
  const censoredState: GameState = JSON.parse(JSON.stringify(state));

  // Censor player data
  censoredState.players = censoredState.players.map(player => {
    // If this is the requesting player, show all their data (already cloned)
    if (player.id === requestingPlayerId) {
      return player; // Return the cloned player as-is
    }

    // For other players, censor sensitive data while preserving public data
    // Create a new object explicitly to avoid any reference issues
    const censoredPlayer: any = {
      id: player.id,
      name: player.name,
      password: '', // Hide password
      color: player.color,
      resources: {
        wood: -1,
        brick: -1,
        sheep: -1,
        wheat: -1,
        ore: -1
      },
      developmentCards: [], // Hide dev cards
      newDevelopmentCards: [], // Hide new dev cards
      victoryPointCards: player.victoryPointCards, // Keep count (not individual cards)
      settlements: player.settlements, // Public (visible on board)
      cities: player.cities, // Public (visible on board)
      roads: player.roads, // Public (visible on board)
      victoryPoints: player.victoryPoints,
      longestRoad: player.longestRoad,
      longestRoadLength: player.longestRoadLength,
      largestArmy: player.largestArmy,
      armySize: player.armySize,
      mustDiscard: player.mustDiscard,
      freeRoads: player.freeRoads,
      disconnected: player.disconnected,
      ready: player.ready,
      spectator: player.spectator,
      // Add count fields for UI
      resourceCount: getTotalResources(player.resources),
      developmentCardCount: player.developmentCards.length,
      newDevelopmentCardCount: player.newDevelopmentCards.length
    };

    return censoredPlayer;
  });

  // Censor the development card deck to prevent card counting
  censoredState.developmentCardDeck = [];

  // Keep deck count for UI purposes
  (censoredState as any).developmentCardDeckCount = state.developmentCardDeck.length;

  return censoredState;
}

/**
 * Creates a public view of the game state suitable for spectators or the lobby.
 * This shows minimal information and hides all sensitive player data.
 */
export function censorGameStateForSpectator(state: GameState): GameState {
  return censorGameState(state, null);
}

/**
 * Calculates total resource count for a player
 */
function getTotalResources(resources: { wood: number; brick: number; sheep: number; wheat: number; ore: number }): number {
  return resources.wood + resources.brick + resources.sheep + resources.wheat + resources.ore;
}

/**
 * Creates a safe player summary for lobby listings (no sensitive data at all)
 */
export function censorPlayerForLobby(player: Player): Partial<Player> {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    ready: player.ready,
    disconnected: player.disconnected,
    spectator: player.spectator
  };
}
