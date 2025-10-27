"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlayer = createPlayer;
exports.hasResources = hasResources;
exports.deductResources = deductResources;
exports.addResources = addResources;
exports.getTotalResourceCount = getTotalResourceCount;
exports.getResourceCards = getResourceCards;
function createPlayer(socketId, name, playerIndex) {
    const colors = ['red', 'blue', 'white', 'orange'];
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
function hasResources(player, required) {
    for (const [resource, amount] of Object.entries(required)) {
        if (player.resources[resource] < amount) {
            return false;
        }
    }
    return true;
}
function deductResources(player, costs) {
    for (const [resource, amount] of Object.entries(costs)) {
        player.resources[resource] -= amount;
    }
}
function addResources(player, resources) {
    for (const [resource, amount] of Object.entries(resources)) {
        player.resources[resource] += amount;
    }
}
function getTotalResourceCount(player) {
    return Object.values(player.resources).reduce((sum, count) => sum + count, 0);
}
function getResourceCards(player) {
    const cards = [];
    for (const [resource, amount] of Object.entries(player.resources)) {
        for (let i = 0; i < amount; i++) {
            cards.push(resource);
        }
    }
    return cards;
}
//# sourceMappingURL=playerManager.js.map