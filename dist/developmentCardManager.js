"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevelopmentCardManager = void 0;
exports.playYearOfPlenty = playYearOfPlenty;
exports.playMonopoly = playMonopoly;
exports.playRoadBuilding = playRoadBuilding;
exports.moveNewCardsToPlayable = moveNewCardsToPlayable;
const utils_1 = require("./utils");
const playerManager_1 = require("./playerManager");
class DevelopmentCardManager {
    constructor() {
        this.deck = [];
    }
    initialize() {
        const cards = [
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
        this.deck = (0, utils_1.shuffle)([...cards]);
    }
    buyCard(player) {
        const cost = { sheep: 1, wheat: 1, ore: 1 };
        if (this.deck.length === 0) {
            return { success: false, error: 'No development cards left' };
        }
        if (!(0, playerManager_1.hasResources)(player, cost)) {
            return { success: false, error: 'Not enough resources (need 1 sheep, 1 wheat, 1 ore)' };
        }
        (0, playerManager_1.deductResources)(player, cost);
        const card = this.deck.pop();
        player.newDevelopmentCards.push(card);
        if (card === 'victoryPoint') {
            player.victoryPoints++;
            player.victoryPointCards++;
            player.newDevelopmentCards = player.newDevelopmentCards.filter(c => c !== card);
        }
        return { success: true, cardType: card };
    }
    getDeckSize() {
        return this.deck.length;
    }
}
exports.DevelopmentCardManager = DevelopmentCardManager;
function playYearOfPlenty(player, resource1, resource2) {
    const cardIndex = player.developmentCards.findIndex(c => c === 'yearOfPlenty');
    if (cardIndex === -1) {
        return { success: false, error: 'You do not have a Year of Plenty card' };
    }
    const validResources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
    if (!validResources.includes(resource1) || !validResources.includes(resource2)) {
        return { success: false, error: 'Invalid resource type' };
    }
    player.developmentCards.splice(cardIndex, 1);
    player.resources[resource1]++;
    player.resources[resource2]++;
    return { success: true, resource1, resource2 };
}
function playMonopoly(player, resource, allPlayers) {
    const cardIndex = player.developmentCards.findIndex(c => c === 'monopoly');
    if (cardIndex === -1) {
        return { success: false, error: 'You do not have a Monopoly card' };
    }
    const validResources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
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
function playRoadBuilding(player) {
    const cardIndex = player.developmentCards.findIndex(c => c === 'roadBuilding');
    if (cardIndex === -1) {
        return { success: false, error: 'You do not have a Road Building card' };
    }
    player.developmentCards.splice(cardIndex, 1);
    player.freeRoads = 2;
    return { success: true };
}
function moveNewCardsToPlayable(player) {
    if (player.newDevelopmentCards.length > 0) {
        player.developmentCards.push(...player.newDevelopmentCards);
        player.newDevelopmentCards = [];
    }
}
//# sourceMappingURL=developmentCardManager.js.map