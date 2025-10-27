import { DevelopmentCardType, Player, ResourceType } from './types';
import { shuffle } from './utils';
import { hasResources, deductResources } from './playerManager';

export class DevelopmentCardManager {
  private deck: DevelopmentCardType[] = [];

  initialize(): void {
    const cards: DevelopmentCardType[] = [
      // Knights (14)
      'knight', 'knight', 'knight', 'knight', 'knight',
      'knight', 'knight', 'knight', 'knight', 'knight',
      'knight', 'knight', 'knight', 'knight',
      // Victory Points (5)
      'victoryPoint', 'victoryPoint', 'victoryPoint', 'victoryPoint', 'victoryPoint',
      // Road Building (2)
      'roadBuilding', 'roadBuilding',
      // Monopoly (2)
      'monopoly', 'monopoly',
      // Year of Plenty (2)
      'yearOfPlenty', 'yearOfPlenty'
    ];

    this.deck = shuffle([...cards]);
  }

  buyCard(player: Player): { success: boolean; error?: string; cardType?: DevelopmentCardType } {
    const cost = { sheep: 1, wheat: 1, ore: 1 };

    if (this.deck.length === 0) {
      return { success: false, error: 'No development cards left' };
    }

    if (!hasResources(player, cost)) {
      return { success: false, error: 'Not enough resources (need 1 sheep, 1 wheat, 1 ore)' };
    }

    deductResources(player, cost);

    const card = this.deck.pop()!;
    player.newDevelopmentCards.push(card);

    if (card === 'victoryPoint') {
      player.victoryPointCards++;
      player.newDevelopmentCards = player.newDevelopmentCards.filter(c => c !== card);
    }

    return { success: true, cardType: card };
  }

  getDeckSize(): number {
    return this.deck.length;
  }
}

export function playYearOfPlenty(
  player: Player,
  resource1: ResourceType,
  resource2: ResourceType
): { success: boolean; error?: string; resource1?: ResourceType; resource2?: ResourceType } {
  const cardIndex = player.developmentCards.findIndex(c => c === 'yearOfPlenty');
  if (cardIndex === -1) {
    return { success: false, error: 'You do not have a Year of Plenty card' };
  }

  const validResources: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  if (!validResources.includes(resource1) || !validResources.includes(resource2)) {
    return { success: false, error: 'Invalid resource type' };
  }

  player.developmentCards.splice(cardIndex, 1);
  player.resources[resource1]++;
  player.resources[resource2]++;

  return { success: true, resource1, resource2 };
}

export function playMonopoly(
  player: Player,
  resource: ResourceType,
  allPlayers: Player[]
): { success: boolean; error?: string; resource?: ResourceType; totalTaken?: number } {
  const cardIndex = player.developmentCards.findIndex(c => c === 'monopoly');
  if (cardIndex === -1) {
    return { success: false, error: 'You do not have a Monopoly card' };
  }

  const validResources: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  if (!validResources.includes(resource)) {
    return { success: false, error: 'Invalid resource type' };
  }

  player.developmentCards.splice(cardIndex, 1);

  let totalTaken = 0;
  allPlayers.forEach(otherPlayer => {
    if (otherPlayer.id !== player.id) {
      const amount = otherPlayer.resources[resource];
      if (amount > 0) {
        player.resources[resource] += amount;
        otherPlayer.resources[resource] = 0;
        totalTaken += amount;
      }
    }
  });

  return { success: true, resource, totalTaken };
}

export function playRoadBuilding(player: Player): { success: boolean; error?: string } {
  const cardIndex = player.developmentCards.findIndex(c => c === 'roadBuilding');
  if (cardIndex === -1) {
    return { success: false, error: 'You do not have a Road Building card' };
  }

  player.developmentCards.splice(cardIndex, 1);
  player.freeRoads = 2;

  return { success: true };
}

export function moveNewCardsToPlayable(player: Player): void {
  if (player.newDevelopmentCards.length > 0) {
    player.developmentCards.push(...player.newDevelopmentCards);
    player.newDevelopmentCards = [];
  }
}
