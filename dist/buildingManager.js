"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSettlement = buildSettlement;
exports.buildRoad = buildRoad;
exports.buildRoadFree = buildRoadFree;
exports.buildCity = buildCity;
exports.calculateLongestRoad = calculateLongestRoad;
const playerManager_1 = require("./playerManager");
function buildSettlement(player, board, vertex, isSetup = false, setupRound = 1) {
    const v = board.vertices.find(vert => Math.abs(vert.x - vertex.x) < 0.01 && Math.abs(vert.y - vertex.y) < 0.01);
    if (!v || v.building)
        return false;
    const adjacentVertices = getAdjacentVertices(v, board);
    if (adjacentVertices.some(av => av.building))
        return false;
    if (isSetup) {
        v.building = 'settlement';
        v.playerId = player.id;
        player.settlements.push(vertex);
        player.victoryPoints++;
        if (setupRound === 2) {
            giveSetupResources(v, player, board);
        }
        return true;
    }
    const cost = { wood: 1, brick: 1, sheep: 1, wheat: 1 };
    if (!(0, playerManager_1.hasResources)(player, cost))
        return false;
    if (!isConnectedToPlayerRoad(v, player.id, board))
        return false;
    (0, playerManager_1.deductResources)(player, cost);
    v.building = 'settlement';
    v.playerId = player.id;
    player.settlements.push(vertex);
    player.victoryPoints++;
    return true;
}
function buildRoad(player, board, edge, isSetup = false, lastSettlement) {
    const e = board.edges.find(ed => (Math.abs(ed.v1.x - edge.v1.x) < 0.01 && Math.abs(ed.v1.y - edge.v1.y) < 0.01 &&
        Math.abs(ed.v2.x - edge.v2.x) < 0.01 && Math.abs(ed.v2.y - edge.v2.y) < 0.01) ||
        (Math.abs(ed.v1.x - edge.v2.x) < 0.01 && Math.abs(ed.v1.y - edge.v2.y) < 0.01 &&
            Math.abs(ed.v2.x - edge.v1.x) < 0.01 && Math.abs(ed.v2.y - edge.v1.y) < 0.01));
    if (!e || e.road)
        return false;
    if (isSetup) {
        if (!lastSettlement)
            return false;
        const isAdjacent = (Math.abs(e.v1.x - lastSettlement.x) < 0.01 && Math.abs(e.v1.y - lastSettlement.y) < 0.01) ||
            (Math.abs(e.v2.x - lastSettlement.x) < 0.01 && Math.abs(e.v2.y - lastSettlement.y) < 0.01);
        if (!isAdjacent)
            return false;
        e.road = true;
        e.playerId = player.id;
        player.roads.push(edge);
        return true;
    }
    const cost = { wood: 1, brick: 1 };
    if (!(0, playerManager_1.hasResources)(player, cost))
        return false;
    const isConnected = board.edges.some(existingEdge => {
        if (existingEdge.playerId !== player.id || !existingEdge.road)
            return false;
        return (Math.abs(existingEdge.v1.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v1.y) < 0.01) ||
            (Math.abs(existingEdge.v1.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v2.y) < 0.01) ||
            (Math.abs(existingEdge.v2.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v1.y) < 0.01) ||
            (Math.abs(existingEdge.v2.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v2.y) < 0.01);
    }) || board.vertices.some(v => {
        if (v.playerId !== player.id || !v.building)
            return false;
        return (Math.abs(v.x - e.v1.x) < 0.01 && Math.abs(v.y - e.v1.y) < 0.01) ||
            (Math.abs(v.x - e.v2.x) < 0.01 && Math.abs(v.y - e.v2.y) < 0.01);
    });
    if (!isConnected)
        return false;
    (0, playerManager_1.deductResources)(player, cost);
    e.road = true;
    e.playerId = player.id;
    player.roads.push(edge);
    return true;
}
function buildRoadFree(player, board, edge) {
    if (!player.freeRoads || player.freeRoads <= 0)
        return false;
    const e = board.edges.find(ed => (Math.abs(ed.v1.x - edge.v1.x) < 0.01 && Math.abs(ed.v1.y - edge.v1.y) < 0.01 &&
        Math.abs(ed.v2.x - edge.v2.x) < 0.01 && Math.abs(ed.v2.y - edge.v2.y) < 0.01) ||
        (Math.abs(ed.v1.x - edge.v2.x) < 0.01 && Math.abs(ed.v1.y - edge.v2.y) < 0.01 &&
            Math.abs(ed.v2.x - edge.v1.x) < 0.01 && Math.abs(ed.v2.y - edge.v1.y) < 0.01));
    if (!e || e.road)
        return false;
    const isConnected = board.edges.some(existingEdge => {
        if (existingEdge.playerId !== player.id || !existingEdge.road)
            return false;
        return (Math.abs(existingEdge.v1.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v1.y) < 0.01) ||
            (Math.abs(existingEdge.v1.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v2.y) < 0.01) ||
            (Math.abs(existingEdge.v2.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v1.y) < 0.01) ||
            (Math.abs(existingEdge.v2.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v2.y) < 0.01);
    }) || board.vertices.some(v => {
        if (v.playerId !== player.id || !v.building)
            return false;
        return (Math.abs(v.x - e.v1.x) < 0.01 && Math.abs(v.y - e.v1.y) < 0.01) ||
            (Math.abs(v.x - e.v2.x) < 0.01 && Math.abs(v.y - e.v2.y) < 0.01);
    });
    if (!isConnected)
        return false;
    e.road = true;
    e.playerId = player.id;
    player.roads.push(edge);
    player.freeRoads--;
    return true;
}
function buildCity(player, board, vertex) {
    const v = board.vertices.find(vert => Math.abs(vert.x - vertex.x) < 0.01 && Math.abs(vert.y - vertex.y) < 0.01);
    if (!v || v.building !== 'settlement' || v.playerId !== player.id)
        return false;
    const cost = { wheat: 2, ore: 3 };
    if (!(0, playerManager_1.hasResources)(player, cost))
        return false;
    (0, playerManager_1.deductResources)(player, cost);
    v.building = 'city';
    player.cities.push(vertex);
    player.settlements = player.settlements.filter(s => Math.abs(s.x - vertex.x) >= 0.01 || Math.abs(s.y - vertex.y) >= 0.01);
    player.victoryPoints++;
    return true;
}
function calculateLongestRoad(players) {
    let longestPlayer = null;
    let longestLength = 4;
    for (const player of players) {
        if (player.roads.length > longestLength) {
            longestLength = player.roads.length;
            longestPlayer = player;
        }
    }
    for (const player of players) {
        if (player.longestRoad && player !== longestPlayer) {
            player.longestRoad = false;
            player.victoryPoints -= 2;
        }
    }
    if (longestPlayer && !longestPlayer.longestRoad) {
        longestPlayer.longestRoad = true;
        longestPlayer.victoryPoints += 2;
    }
}
function getAdjacentVertices(vertex, board) {
    const adjacent = [];
    board.edges.forEach(edge => {
        if (Math.abs(edge.v1.x - vertex.x) < 0.01 && Math.abs(edge.v1.y - vertex.y) < 0.01) {
            const v = board.vertices.find(v => Math.abs(v.x - edge.v2.x) < 0.01 && Math.abs(v.y - edge.v2.y) < 0.01);
            if (v)
                adjacent.push(v);
        }
        else if (Math.abs(edge.v2.x - vertex.x) < 0.01 && Math.abs(edge.v2.y - vertex.y) < 0.01) {
            const v = board.vertices.find(v => Math.abs(v.x - edge.v1.x) < 0.01 && Math.abs(v.y - edge.v1.y) < 0.01);
            if (v)
                adjacent.push(v);
        }
    });
    return adjacent;
}
function isConnectedToPlayerRoad(vertex, playerId, board) {
    return board.edges.some(edge => {
        if (edge.playerId !== playerId || !edge.road)
            return false;
        return (Math.abs(edge.v1.x - vertex.x) < 0.01 && Math.abs(edge.v1.y - vertex.y) < 0.01) ||
            (Math.abs(edge.v2.x - vertex.x) < 0.01 && Math.abs(edge.v2.y - vertex.y) < 0.01);
    });
}
function giveSetupResources(vertex, player, board) {
    const resourceMap = {
        forest: 'wood',
        hills: 'brick',
        pasture: 'sheep',
        fields: 'wheat',
        mountains: 'ore',
        desert: null
    };
    vertex.adjacentHexes.forEach(hexCoord => {
        const hex = board.hexes.find(h => h.q === hexCoord.q && h.r === hexCoord.r);
        if (hex && hex.terrain !== 'desert') {
            const resource = resourceMap[hex.terrain];
            if (resource) {
                player.resources[resource]++;
            }
        }
    });
}
//# sourceMappingURL=buildingManager.js.map