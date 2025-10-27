"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const boardGenerator_1 = require("./boardGenerator");
const playerManager_1 = require("./playerManager");
const tradeManager_1 = require("./tradeManager");
const developmentCardManager_1 = require("./developmentCardManager");
const buildingManager_1 = require("./buildingManager");
const robberManager_1 = require("./robberManager");
class Game {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.board = null;
        this.currentPlayerIndex = 0;
        this.phase = 'waiting';
        this.turnPhase = 'roll';
        this.diceRoll = null;
        this.setupRound = 1;
        this.setupSettlementPlaced = false;
        this.setupRoadPlaced = false;
        this.devCardPlayedThisTurn = false;
        this.tradeManager = new tradeManager_1.TradeManager();
        this.devCardManager = new developmentCardManager_1.DevelopmentCardManager();
    }
    addPlayer(socketId, name) {
        const player = (0, playerManager_1.createPlayer)(socketId, name, this.players.length);
        this.players.push(player);
    }
    hasPlayer(socketId) {
        return this.players.some(p => p.id === socketId);
    }
    reconnectPlayer(oldSocketId, newSocketId) {
        const player = this.players.find(p => p.id === oldSocketId);
        if (!player)
            return false;
        player.id = newSocketId;
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
    start() {
        if (this.players.length < 2)
            return false;
        this.board = (0, boardGenerator_1.generateBoard)();
        this.devCardManager.initialize();
        this.phase = 'setup';
        this.turnPhase = 'place';
        return true;
    }
    rollDice(playerId) {
        if (this.phase !== 'playing')
            return null;
        if (this.players[this.currentPlayerIndex].id !== playerId)
            return null;
        if (this.turnPhase !== 'roll')
            return null;
        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        this.diceRoll = die1 + die2;
        if (this.diceRoll === 7) {
            (0, robberManager_1.handleRobber)(this.players);
            this.turnPhase = 'robber';
        }
        else {
            this.distributeResources(this.diceRoll);
            this.turnPhase = 'build';
        }
        return { die1, die2, total: this.diceRoll };
    }
    distributeResources(number) {
        if (!this.board)
            return;
        const resourceMap = {
            forest: 'wood',
            hills: 'brick',
            pasture: 'sheep',
            fields: 'wheat',
            mountains: 'ore'
        };
        this.board.hexes.forEach(hex => {
            if (hex.number === number && !hex.hasRobber) {
                this.board.vertices.forEach(vertex => {
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
    buildSettlement(playerId, vertex) {
        if (!this.board)
            return false;
        if (this.players[this.currentPlayerIndex].id !== playerId)
            return false;
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return false;
        if (this.phase === 'setup') {
            if (this.setupSettlementPlaced)
                return false;
            const success = (0, buildingManager_1.buildSettlement)(player, this.board, vertex, true, this.setupRound);
            if (success) {
                this.setupSettlementPlaced = true;
            }
            return success;
        }
        return (0, buildingManager_1.buildSettlement)(player, this.board, vertex, false);
    }
    buildRoad(playerId, edge) {
        if (!this.board)
            return false;
        if (this.players[this.currentPlayerIndex].id !== playerId)
            return false;
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return false;
        if (this.phase === 'setup') {
            if (!this.setupSettlementPlaced)
                return false;
            if (this.setupRoadPlaced)
                return false;
            const lastSettlement = player.settlements[player.settlements.length - 1];
            const success = (0, buildingManager_1.buildRoad)(player, this.board, edge, true, lastSettlement);
            if (success) {
                this.setupRoadPlaced = true;
            }
            return success;
        }
        const success = (0, buildingManager_1.buildRoad)(player, this.board, edge, false);
        if (success) {
            (0, buildingManager_1.calculateLongestRoad)(this.players);
        }
        return success;
    }
    buildRoadFree(playerId, edge) {
        if (!this.board)
            return false;
        if (this.players[this.currentPlayerIndex].id !== playerId)
            return false;
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return false;
        const success = (0, buildingManager_1.buildRoadFree)(player, this.board, edge);
        if (success) {
            (0, buildingManager_1.calculateLongestRoad)(this.players);
        }
        return success;
    }
    buildCity(playerId, vertex) {
        if (!this.board)
            return false;
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return false;
        return (0, buildingManager_1.buildCity)(player, this.board, vertex);
    }
    discardCards(playerId, cardsToDiscard) {
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return { success: false, error: 'Player not found' };
        return (0, robberManager_1.discardCards)(player, cardsToDiscard);
    }
    moveRobber(playerId, hexCoords) {
        if (!this.board)
            return { success: false, error: 'No board' };
        if (this.players[this.currentPlayerIndex].id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }
        if (this.turnPhase !== 'robber') {
            return { success: false, error: 'Cannot move robber now' };
        }
        if (!(0, robberManager_1.checkAllDiscarded)(this.players)) {
            return { success: false, error: 'Waiting for players to discard' };
        }
        return (0, robberManager_1.moveRobber)(this.board, hexCoords);
    }
    stealCard(robberId, targetPlayerId) {
        const robber = this.players.find(p => p.id === robberId);
        const target = targetPlayerId ? this.players.find(p => p.id === targetPlayerId) || null : null;
        if (!robber) {
            return { success: false, error: 'Robber not found' };
        }
        const result = (0, robberManager_1.stealCard)(robber, target);
        if (result.success) {
            this.turnPhase = 'build';
        }
        return result;
    }
    buyDevelopmentCard(playerId) {
        if (this.players[this.currentPlayerIndex].id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }
        if (this.phase !== 'playing' || this.turnPhase !== 'build') {
            return { success: false, error: 'Can only buy cards during build phase' };
        }
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return { success: false, error: 'Player not found' };
        return this.devCardManager.buyCard(player);
    }
    playKnight(playerId, hexCoords) {
        if (!this.board)
            return { success: false, error: 'No board' };
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
        if (!player)
            return { success: false, error: 'Player not found' };
        const result = (0, robberManager_1.playKnight)(player, this.board, hexCoords);
        if (result.success) {
            this.devCardPlayedThisTurn = true;
            (0, robberManager_1.calculateLargestArmy)(this.players);
        }
        return result;
    }
    playYearOfPlenty(playerId, resource1, resource2) {
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
        if (!player)
            return { success: false, error: 'Player not found' };
        const result = (0, developmentCardManager_1.playYearOfPlenty)(player, resource1, resource2);
        if (result.success) {
            this.devCardPlayedThisTurn = true;
        }
        return result;
    }
    playMonopoly(playerId, resource) {
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
        if (!player)
            return { success: false, error: 'Player not found' };
        const result = (0, developmentCardManager_1.playMonopoly)(player, resource, this.players);
        if (result.success) {
            this.devCardPlayedThisTurn = true;
        }
        return result;
    }
    playRoadBuilding(playerId) {
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
        if (!player)
            return { success: false, error: 'Player not found' };
        const result = (0, developmentCardManager_1.playRoadBuilding)(player);
        if (result.success) {
            this.devCardPlayedThisTurn = true;
        }
        return result;
    }
    createTradeOffer(offeringPlayerId, targetPlayerId, offering, requesting) {
        return this.tradeManager.createTradeOffer(this.players, offeringPlayerId, targetPlayerId, offering, requesting);
    }
    respondToTrade(offerId, playerId, response) {
        return this.tradeManager.respondToTrade(offerId, playerId, response, this.players);
    }
    confirmTrade(offerId, offeringPlayerId, acceptingPlayerId) {
        return this.tradeManager.confirmTrade(offerId, offeringPlayerId, acceptingPlayerId, this.players);
    }
    cancelTradeOffer(offerId, playerId) {
        return this.tradeManager.cancelTradeOffer(offerId, playerId);
    }
    tradeWithBank(playerId, givingResource, receivingResource, amount) {
        if (!this.board)
            return { success: false, error: 'No board' };
        const player = this.players.find(p => p.id === playerId);
        if (!player)
            return { success: false, error: 'Player not found' };
        return (0, tradeManager_1.tradeWithBank)(player, this.board, givingResource, receivingResource, amount);
    }
    endTurn(playerId) {
        if (this.players[this.currentPlayerIndex].id !== playerId)
            return false;
        if (this.phase === 'setup') {
            if (!this.setupSettlementPlaced || !this.setupRoadPlaced)
                return false;
            this.handleSetupTurn();
        }
        else {
            const player = this.players[this.currentPlayerIndex];
            (0, developmentCardManager_1.moveNewCardsToPlayable)(player);
            this.devCardPlayedThisTurn = false;
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            this.turnPhase = 'roll';
            this.diceRoll = null;
        }
        const winner = this.players.find(p => p.victoryPoints >= 10);
        if (winner) {
            this.phase = 'finished';
        }
        return true;
    }
    handleSetupTurn() {
        this.setupSettlementPlaced = false;
        this.setupRoadPlaced = false;
        if (this.setupRound === 1) {
            if (this.currentPlayerIndex < this.players.length - 1) {
                this.currentPlayerIndex++;
            }
            else {
                this.setupRound = 2;
            }
        }
        else if (this.setupRound === 2) {
            if (this.currentPlayerIndex > 0) {
                this.currentPlayerIndex--;
            }
            else {
                this.phase = 'playing';
                this.currentPlayerIndex = 0;
                this.turnPhase = 'roll';
            }
        }
    }
    getState() {
        return {
            id: this.id,
            players: this.players,
            board: this.board,
            currentPlayerIndex: this.currentPlayerIndex,
            phase: this.phase,
            turnPhase: this.turnPhase,
            diceRoll: this.diceRoll,
            setupRound: this.setupRound,
            setupSettlementPlaced: this.setupSettlementPlaced,
            setupRoadPlaced: this.setupRoadPlaced,
            tradeOffers: this.tradeManager.getTradeOffers()
        };
    }
}
exports.Game = Game;
//# sourceMappingURL=game.js.map