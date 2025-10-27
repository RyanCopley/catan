import { Board, Player, Hex, HexCoordinate, ResourceType } from './types';
import { getTotalResourceCount, getResourceCards } from './playerManager';

export function handleRobber(players: Player[]): void {
  players.forEach(player => {
    const totalCards = getTotalResourceCount(player);
    if (totalCards >= 8) {
      player.mustDiscard = Math.floor(totalCards / 2);
    } else {
      player.mustDiscard = 0;
    }
  });
}

export function discardCards(
  player: Player,
  cardsToDiscard: Partial<Record<ResourceType, number>>
): { success: boolean; error?: string } {
  if (!player.mustDiscard) {
    return { success: false, error: 'No discard required' };
  }

  const totalDiscarded = Object.values(cardsToDiscard).reduce((a, b) => a + b, 0);
  if (totalDiscarded !== player.mustDiscard) {
    return { success: false, error: `Must discard exactly ${player.mustDiscard} cards` };
  }

  for (const [resource, amount] of Object.entries(cardsToDiscard)) {
    if (player.resources[resource as ResourceType] < amount) {
      return { success: false, error: `Not enough ${resource}` };
    }
  }

  for (const [resource, amount] of Object.entries(cardsToDiscard)) {
    player.resources[resource as ResourceType] -= amount;
  }

  player.mustDiscard = 0;
  return { success: true };
}

export function checkAllDiscarded(players: Player[]): boolean {
  return players.every(p => !p.mustDiscard || p.mustDiscard === 0);
}

export function moveRobber(
  board: Board,
  hexCoords: HexCoordinate
): { success: boolean; error?: string; stealableTargets?: string[] } {
  const hex = board.hexes.find(h => h.q === hexCoords.q && h.r === hexCoords.r);
  if (!hex) {
    return { success: false, error: 'Invalid hex' };
  }

  if (hex.hasRobber) {
    return { success: false, error: 'Robber is already there' };
  }

  board.hexes.forEach(h => h.hasRobber = false);
  hex.hasRobber = true;
  board.robber = hex;

  const playersOnHex = getPlayersOnHex(hex, board);
  return { success: true, stealableTargets: playersOnHex };
}

export function getPlayersOnHex(hex: Hex, board: Board): string[] {
  const playerIds = new Set<string>();

  board.vertices.forEach(vertex => {
    if (vertex.building && vertex.adjacentHexes.some(h => h.q === hex.q && h.r === hex.r)) {
      playerIds.add(vertex.playerId!);
    }
  });

  return Array.from(playerIds);
}

export function stealCard(
  robber: Player,
  target: Player | null
): { success: boolean; error?: string; stolenResource?: ResourceType | null } {
  if (!target) {
    return { success: true, stolenResource: null };
  }

  const availableResources = getResourceCards(target);

  if (availableResources.length === 0) {
    return { success: true, stolenResource: null };
  }

  const randomIndex = Math.floor(Math.random() * availableResources.length);
  const stolenResource = availableResources[randomIndex] as ResourceType;

  target.resources[stolenResource]--;
  robber.resources[stolenResource]++;

  return { success: true, stolenResource };
}

export function playKnight(
  player: Player,
  board: Board,
  hexCoords: HexCoordinate
): { success: boolean; error?: string; stealableTargets?: string[] } {
  const cardIndex = player.developmentCards.findIndex(c => c === 'knight');
  if (cardIndex === -1) {
    return { success: false, error: 'You do not have a knight card to play' };
  }

  player.developmentCards.splice(cardIndex, 1);
  player.armySize++;

  const hex = board.hexes.find(h => h.q === hexCoords.q && h.r === hexCoords.r);
  if (!hex) {
    return { success: false, error: 'Invalid hex' };
  }

  if (hex.hasRobber) {
    return { success: false, error: 'Robber is already there' };
  }

  board.hexes.forEach(h => h.hasRobber = false);
  hex.hasRobber = true;
  board.robber = hex;

  const playersOnHex = getPlayersOnHex(hex, board);
  const stealableTargets = playersOnHex.filter(p => p !== player.id);

  return { success: true, stealableTargets };
}

export function calculateLargestArmy(players: Player[]): void {
  // Find who currently has Largest Army
  const currentHolder = players.find(p => p.largestArmy);

  // Find the player with the largest army (minimum 3 knights)
  let largestPlayer: Player | null = null;
  let largestSize = 2; // Start at 2 so we only consider players with 3+ knights

  for (const player of players) {
    if (player.armySize > largestSize) {
      largestSize = player.armySize;
      largestPlayer = player;
    }
  }

  // Tie-breaking rule: if there's a tie, the current holder keeps it
  // Only transfer if someone has MORE knights than the current largest size
  if (currentHolder && currentHolder.armySize === largestSize) {
    largestPlayer = currentHolder;
  }

  // Only award if someone has at least 3 knights
  if (largestSize < 3) {
    largestPlayer = null;
  }

  // Update flags only - victory points will be computed via getVictoryPoints()
  for (const player of players) {
    player.largestArmy = (player === largestPlayer);
  }
}
