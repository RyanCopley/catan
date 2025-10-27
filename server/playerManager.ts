import { Player, PlayerColor, Resources, Coordinate, Edge } from './types';

export function createPlayer(socketId: string, name: string, playerIndex: number): Player {
  const colors: PlayerColor[] = ['red', 'blue', 'white', 'orange'];

  return {
    id: socketId,
    name: name,
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
