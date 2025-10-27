"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRobber = handleRobber;
exports.discardCards = discardCards;
exports.checkAllDiscarded = checkAllDiscarded;
exports.moveRobber = moveRobber;
exports.getPlayersOnHex = getPlayersOnHex;
exports.stealCard = stealCard;
exports.playKnight = playKnight;
exports.calculateLargestArmy = calculateLargestArmy;
const playerManager_1 = require("./playerManager");
function handleRobber(players) {
    players.forEach(player => {
        const totalCards = (0, playerManager_1.getTotalResourceCount)(player);
        if (totalCards > 7) {
            player.mustDiscard = Math.floor(totalCards / 2);
        }
        else {
            player.mustDiscard = 0;
        }
    });
}
function discardCards(player, cardsToDiscard) {
    if (!player.mustDiscard) {
        return { success: false, error: 'No discard required' };
    }
    const totalDiscarded = Object.values(cardsToDiscard).reduce((a, b) => a + b, 0);
    if (totalDiscarded !== player.mustDiscard) {
        return { success: false, error: `Must discard exactly ${player.mustDiscard} cards` };
    }
    for (const [resource, amount] of Object.entries(cardsToDiscard)) {
        if (player.resources[resource] < amount) {
            return { success: false, error: `Not enough ${resource}` };
        }
    }
    for (const [resource, amount] of Object.entries(cardsToDiscard)) {
        player.resources[resource] -= amount;
    }
    player.mustDiscard = 0;
    return { success: true };
}
function checkAllDiscarded(players) {
    return players.every(p => !p.mustDiscard || p.mustDiscard === 0);
}
function moveRobber(board, hexCoords) {
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
function getPlayersOnHex(hex, board) {
    const playerIds = new Set();
    board.vertices.forEach(vertex => {
        if (vertex.building && vertex.adjacentHexes.some(h => h.q === hex.q && h.r === hex.r)) {
            playerIds.add(vertex.playerId);
        }
    });
    return Array.from(playerIds);
}
function stealCard(robber, target) {
    if (!target) {
        return { success: true, stolenResource: null };
    }
    const availableResources = (0, playerManager_1.getResourceCards)(target);
    if (availableResources.length === 0) {
        return { success: true, stolenResource: null };
    }
    const randomIndex = Math.floor(Math.random() * availableResources.length);
    const stolenResource = availableResources[randomIndex];
    target.resources[stolenResource]--;
    robber.resources[stolenResource]++;
    return { success: true, stolenResource };
}
function playKnight(player, board, hexCoords) {
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
function calculateLargestArmy(players) {
    let largestPlayer = null;
    let largestSize = 2;
    for (const player of players) {
        if (player.armySize > largestSize) {
            largestSize = player.armySize;
            largestPlayer = player;
        }
    }
    for (const player of players) {
        if (player.largestArmy && player !== largestPlayer) {
            player.largestArmy = false;
            player.victoryPoints -= 2;
        }
    }
    if (largestPlayer && !largestPlayer.largestArmy) {
        largestPlayer.largestArmy = true;
        largestPlayer.victoryPoints += 2;
    }
}
//# sourceMappingURL=robberManager.js.map