"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBoard = generateBoard;
exports.generateVertices = generateVertices;
exports.generateEdges = generateEdges;
exports.getHexVertices = getHexVertices;
exports.getHexEdges = getHexEdges;
const utils_1 = require("./utils");
function generateBoard() {
    const terrainTypes = [
        'forest', 'forest', 'forest', 'forest',
        'pasture', 'pasture', 'pasture', 'pasture',
        'fields', 'fields', 'fields', 'fields',
        'hills', 'hills', 'hills',
        'mountains', 'mountains', 'mountains',
        'desert'
    ];
    const numberTokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    const shuffledTerrain = (0, utils_1.shuffle)([...terrainTypes]);
    const shuffledNumbers = (0, utils_1.shuffle)([...numberTokens]);
    const hexes = generateHexes(shuffledTerrain, shuffledNumbers);
    const vertices = generateVertices(hexes);
    const edges = generateEdges(hexes);
    const ports = generatePorts(hexes, vertices);
    return {
        hexes,
        vertices,
        edges,
        ports,
        robber: hexes.find(h => h.hasRobber)
    };
}
function generateHexes(terrainTypes, shuffledNumbers) {
    const layout = [
        { row: 0, positions: [{ q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }] },
        { row: 1, positions: [{ q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 }] },
        { row: 2, positions: [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }] },
        { row: 3, positions: [{ q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }] },
        { row: 4, positions: [{ q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }] }
    ];
    const hexes = [];
    let index = 0;
    let numberIndex = 0;
    layout.forEach(row => {
        row.positions.forEach(pos => {
            const terrain = terrainTypes[index];
            const hex = {
                q: pos.q,
                r: pos.r,
                terrain: terrain,
                number: terrain === 'desert' ? null : shuffledNumbers[numberIndex],
                hasRobber: terrain === 'desert'
            };
            if (terrain !== 'desert')
                numberIndex++;
            hexes.push(hex);
            index++;
        });
    });
    return hexes;
}
function generateVertices(hexes) {
    const vertices = new Map();
    hexes.forEach(hex => {
        const hexVertices = getHexVertices(hex.q, hex.r);
        hexVertices.forEach(v => {
            const key = `${v.x},${v.y}`;
            if (!vertices.has(key)) {
                vertices.set(key, {
                    x: v.x,
                    y: v.y,
                    adjacentHexes: [],
                    building: null,
                    playerId: null
                });
            }
            vertices.get(key).adjacentHexes.push({ q: hex.q, r: hex.r });
        });
    });
    return Array.from(vertices.values());
}
function generateEdges(hexes) {
    const edges = new Map();
    hexes.forEach(hex => {
        const hexEdges = getHexEdges(hex.q, hex.r);
        hexEdges.forEach(e => {
            const key = `${Math.min(e.v1.x, e.v2.x)},${Math.min(e.v1.y, e.v2.y)}-${Math.max(e.v1.x, e.v2.x)},${Math.max(e.v1.y, e.v2.y)}`;
            if (!edges.has(key)) {
                edges.set(key, {
                    v1: e.v1,
                    v2: e.v2,
                    road: null,
                    playerId: null
                });
            }
        });
    });
    return Array.from(edges.values());
}
function generatePorts(hexes, vertices) {
    const portTypes = [
        { type: '3:1', resource: null },
        { type: '3:1', resource: null },
        { type: '3:1', resource: null },
        { type: '3:1', resource: null },
        { type: '2:1', resource: 'wood' },
        { type: '2:1', resource: 'brick' },
        { type: '2:1', resource: 'sheep' },
        { type: '2:1', resource: 'wheat' },
        { type: '2:1', resource: 'ore' }
    ];
    const shuffledPorts = (0, utils_1.shuffle)([...portTypes]);
    const portLocations = [
        { hexQ: 0, hexR: -2, vertices: [3, 4] },
        { hexQ: 2, hexR: -2, vertices: [4, 5] },
        { hexQ: 2, hexR: -1, vertices: [5, 0] },
        { hexQ: 2, hexR: 0, vertices: [0, 1] },
        { hexQ: 1, hexR: 1, vertices: [0, 1] },
        { hexQ: 0, hexR: 2, vertices: [1, 2] },
        { hexQ: -2, hexR: 2, vertices: [2, 3] },
        { hexQ: -2, hexR: 1, vertices: [2, 3] },
        { hexQ: -1, hexR: -1, vertices: [3, 4] }
    ];
    const ports = [];
    for (let i = 0; i < Math.min(portLocations.length, shuffledPorts.length); i++) {
        const location = portLocations[i];
        const portType = shuffledPorts[i];
        const hex = hexes.find(h => h.q === location.hexQ && h.r === location.hexR);
        if (!hex)
            continue;
        const hexVertices = getHexVertices(location.hexQ, location.hexR);
        const portVertex1 = hexVertices[location.vertices[0]];
        const portVertex2 = hexVertices[location.vertices[1]];
        const vertex1 = vertices.find(v => Math.abs(v.x - portVertex1.x) < 0.01 && Math.abs(v.y - portVertex1.y) < 0.01);
        const vertex2 = vertices.find(v => Math.abs(v.x - portVertex2.x) < 0.01 && Math.abs(v.y - portVertex2.y) < 0.01);
        if (vertex1 && vertex2) {
            ports.push({
                type: portType.type,
                resource: portType.resource,
                vertices: [
                    { x: vertex1.x, y: vertex1.y },
                    { x: vertex2.x, y: vertex2.y }
                ],
                hex: { q: location.hexQ, r: location.hexR }
            });
        }
    }
    return ports;
}
function getHexVertices(q, r) {
    const size = 1;
    const x = size * (3 / 2 * q);
    const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        vertices.push({
            x: parseFloat((x + size * Math.cos(angle)).toFixed(3)),
            y: parseFloat((y + size * Math.sin(angle)).toFixed(3))
        });
    }
    return vertices;
}
function getHexEdges(q, r) {
    const vertices = getHexVertices(q, r);
    const edges = [];
    for (let i = 0; i < 6; i++) {
        edges.push({
            v1: vertices[i],
            v2: vertices[(i + 1) % 6],
            road: null,
            playerId: null
        });
    }
    return edges;
}
//# sourceMappingURL=boardGenerator.js.map