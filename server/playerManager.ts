import { Player, PlayerColor, Resources, Coordinate, Edge } from './types';

export function createPlayer(socketId: string, name: string, playerIndex: number, password: string): Player {
  const colors: PlayerColor[] = ['red', 'blue', 'white', 'orange'];

  return {
    id: socketId,
    name: name,
    password: password,
    color: colors[playerIndex],
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    developmentCards: [],
    newDevelopmentCards: [],
    victoryPointCards: 0,
    settlements: [],
    cities: [],
    roads: [],
    victoryPoints: 0,
    longestRoad: false,
    longestRoadLength: 0,
    largestArmy: false,
    armySize: 0
  };
}

export function hasResources(player: Player, required: Partial<Resources>): boolean {
  for (const [resource, amount] of Object.entries(required)) {
    if (player.resources[resource as keyof Resources] < amount) {
      return false;
    }
  }
  return true;
}

export function deductResources(player: Player, costs: Partial<Resources>): void {
  for (const [resource, amount] of Object.entries(costs)) {
    player.resources[resource as keyof Resources] -= amount;
  }
}

export function addResources(player: Player, resources: Partial<Resources>): void {
  for (const [resource, amount] of Object.entries(resources)) {
    player.resources[resource as keyof Resources] += amount;
  }
}

export function getTotalResourceCount(player: Player): number {
  return Object.values(player.resources).reduce((sum, count) => sum + count, 0);
}

export function getResourceCards(player: Player): string[] {
  const cards: string[] = [];
  for (const [resource, amount] of Object.entries(player.resources)) {
    for (let i = 0; i < amount; i++) {
      cards.push(resource);
    }
  }
  return cards;
}

export function getVictoryPoints(player: Player): number {
  let points = 0;

  // Points from settlements (1 point each)
  points += player.settlements.length;

  // Points from cities (2 points each)
  points += player.cities.length * 2;

  // Points from victory point development cards
  points += player.victoryPointCards;

  // Bonus points from longest road (2 points)
  if (player.longestRoad) {
    points += 2;
  }

  // Bonus points from largest army (2 points)
  if (player.largestArmy) {
    points += 2;
  }

  return points;
}
