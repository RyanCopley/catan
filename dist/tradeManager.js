"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeManager = void 0;
exports.tradeWithBank = tradeWithBank;
exports.getPlayerTradeRate = getPlayerTradeRate;
exports.getPlayerPorts = getPlayerPorts;
const playerManager_1 = require("./playerManager");
class TradeManager {
    constructor() {
        this.tradeOffers = [];
        this.nextTradeId = 1;
    }
    createTradeOffer(players, offeringPlayerId, targetPlayerId, offering, requesting) {
        const offeringPlayer = players.find(p => p.id === offeringPlayerId);
        if (!offeringPlayer)
            return null;
        if (!(0, playerManager_1.hasResources)(offeringPlayer, offering)) {
            return null;
        }
        const offer = {
            id: this.nextTradeId++,
            offeringPlayerId,
            targetPlayerId,
            offering,
            requesting,
            timestamp: Date.now(),
            responses: {},
            acceptedBy: []
        };
        players.forEach(player => {
            if (player.id !== offeringPlayerId) {
                if (!targetPlayerId || targetPlayerId === player.id) {
                    offer.responses[player.id] = 'pending';
                }
            }
        });
        this.tradeOffers.push(offer);
        return offer;
    }
    respondToTrade(offerId, playerId, response, players) {
        const offer = this.tradeOffers.find(o => o.id === offerId);
        if (!offer)
            return { success: false, error: 'Trade offer not found' };
        if (offer.offeringPlayerId === playerId) {
            return { success: false, error: 'Cannot respond to your own trade' };
        }
        if (!(playerId in offer.responses)) {
            return { success: false, error: 'This trade is not for you' };
        }
        offer.responses[playerId] = response;
        if (response === 'accepted') {
            const player = players.find(p => p.id === playerId);
            if (!player)
                return { success: false, error: 'Player not found' };
            if (!(0, playerManager_1.hasResources)(player, offer.requesting)) {
                offer.responses[playerId] = 'rejected';
                return { success: false, error: 'You do not have enough resources' };
            }
            if (!offer.acceptedBy.includes(playerId)) {
                offer.acceptedBy.push(playerId);
            }
        }
        else if (response === 'rejected') {
            offer.acceptedBy = offer.acceptedBy.filter(id => id !== playerId);
        }
        return { success: true };
    }
    confirmTrade(offerId, offeringPlayerId, acceptingPlayerId, players) {
        const offer = this.tradeOffers.find(o => o.id === offerId);
        if (!offer)
            return { success: false, error: 'Trade offer not found' };
        if (offer.offeringPlayerId !== offeringPlayerId) {
            return { success: false, error: 'Only the offering player can confirm' };
        }
        if (!offer.acceptedBy.includes(acceptingPlayerId)) {
            return { success: false, error: 'This player has not accepted your trade' };
        }
        return this.executeTrade(offerId, acceptingPlayerId, players);
    }
    executeTrade(offerId, acceptingPlayerId, players) {
        const offerIndex = this.tradeOffers.findIndex(o => o.id === offerId);
        if (offerIndex === -1)
            return { success: false, error: 'Trade offer not found' };
        const offer = this.tradeOffers[offerIndex];
        if (offer.targetPlayerId && offer.targetPlayerId !== acceptingPlayerId) {
            return { success: false, error: 'This trade is not for you' };
        }
        if (offer.offeringPlayerId === acceptingPlayerId) {
            return { success: false, error: 'Cannot trade with yourself' };
        }
        const offeringPlayer = players.find(p => p.id === offer.offeringPlayerId);
        const acceptingPlayer = players.find(p => p.id === acceptingPlayerId);
        if (!offeringPlayer || !acceptingPlayer) {
            return { success: false, error: 'Player not found' };
        }
        if (!(0, playerManager_1.hasResources)(offeringPlayer, offer.offering)) {
            this.tradeOffers.splice(offerIndex, 1);
            return { success: false, error: 'Offering player no longer has those resources' };
        }
        if (!(0, playerManager_1.hasResources)(acceptingPlayer, offer.requesting)) {
            return { success: false, error: 'You do not have the requested resources' };
        }
        (0, playerManager_1.deductResources)(offeringPlayer, offer.offering);
        (0, playerManager_1.addResources)(acceptingPlayer, offer.offering);
        (0, playerManager_1.deductResources)(acceptingPlayer, offer.requesting);
        (0, playerManager_1.addResources)(offeringPlayer, offer.requesting);
        this.tradeOffers.splice(offerIndex, 1);
        return {
            success: true,
            offeringPlayer: offeringPlayer.name,
            acceptingPlayer: acceptingPlayer.name
        };
    }
    cancelTradeOffer(offerId, playerId) {
        const offerIndex = this.tradeOffers.findIndex(o => o.id === offerId);
        if (offerIndex === -1)
            return false;
        const offer = this.tradeOffers[offerIndex];
        if (offer.offeringPlayerId !== playerId)
            return false;
        this.tradeOffers.splice(offerIndex, 1);
        return true;
    }
    getTradeOffers() {
        return this.tradeOffers;
    }
}
exports.TradeManager = TradeManager;
function tradeWithBank(player, board, givingResource, receivingResource, amount) {
    const validResources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
    if (!validResources.includes(givingResource) || !validResources.includes(receivingResource)) {
        return { success: false, error: 'Invalid resource type' };
    }
    const tradeRate = getPlayerTradeRate(player, board, givingResource);
    const requiredAmount = amount || tradeRate;
    if (player.resources[givingResource] < requiredAmount) {
        return {
            success: false,
            error: `Not enough ${givingResource}. Need ${requiredAmount}, have ${player.resources[givingResource]}`
        };
    }
    player.resources[givingResource] -= requiredAmount;
    player.resources[receivingResource] += 1;
    return {
        success: true,
        playerName: player.name,
        gave: givingResource,
        gaveAmount: requiredAmount,
        received: receivingResource,
        tradeRate: `${requiredAmount}:1`
    };
}
function getPlayerTradeRate(player, board, resource = null) {
    let bestRate = 4;
    if (!board || !board.ports)
        return bestRate;
    board.ports.forEach(port => {
        port.vertices.forEach(portVertex => {
            const vertex = board.vertices.find(v => Math.abs(v.x - portVertex.x) < 0.01 && Math.abs(v.y - portVertex.y) < 0.01);
            if (vertex && vertex.playerId === player.id && vertex.building) {
                if (port.type === '3:1') {
                    bestRate = Math.min(bestRate, 3);
                }
                else if (port.type === '2:1' && port.resource === resource) {
                    bestRate = Math.min(bestRate, 2);
                }
            }
        });
    });
    return bestRate;
}
function getPlayerPorts(player, board) {
    const accessiblePorts = [];
    if (!board || !board.ports)
        return accessiblePorts;
    board.ports.forEach(port => {
        let hasAccess = false;
        port.vertices.forEach(portVertex => {
            const vertex = board.vertices.find(v => Math.abs(v.x - portVertex.x) < 0.01 && Math.abs(v.y - portVertex.y) < 0.01);
            if (vertex && vertex.playerId === player.id && vertex.building) {
                hasAccess = true;
            }
        });
        if (hasAccess) {
            accessiblePorts.push({
                type: port.type,
                resource: port.resource
            });
        }
    });
    return accessiblePorts;
}
//# sourceMappingURL=tradeManager.js.map