import { Board, Player, Vertex, Edge, Coordinate, ResourceType, TerrainType } from './types';
import { hasResources, deductResources } from './playerManager';

export function buildSettlement(
  player: Player,
  board: Board,
  vertex: Coordinate,
  isSetup: boolean = false,
  setupRound: number = 1
): boolean {
  const v = board.vertices.find(vert =>
    Math.abs(vert.x - vertex.x) < 0.01 && Math.abs(vert.y - vertex.y) < 0.01
  );

  if (!v || v.building) return false;

  // Check piece limit: max 5 settlements per player
  if (player.settlements.length >= 5) return false;

  const adjacentVertices = getAdjacentVertices(v, board);
  if (adjacentVertices.some(av => av.building)) return false;

  if (isSetup) {
    v.building = 'settlement';
    v.playerId = player.id;
    player.settlements.push(vertex);

    if (setupRound === 2) {
      giveSetupResources(v, player, board);
    }

    return true;
  }

  const cost = { wood: 1, brick: 1, sheep: 1, wheat: 1 };
  if (!hasResources(player, cost)) return false;

  if (!isConnectedToPlayerRoad(v, player.id, board)) return false;

  deductResources(player, cost);

  v.building = 'settlement';
  v.playerId = player.id;
  player.settlements.push(vertex);

  return true;
}

export function buildRoad(
  player: Player,
  board: Board,
  edge: Edge,
  isSetup: boolean = false,
  lastSettlement?: Coordinate
): boolean {
  const e = board.edges.find(ed =>
    (Math.abs(ed.v1.x - edge.v1.x) < 0.01 && Math.abs(ed.v1.y - edge.v1.y) < 0.01 &&
     Math.abs(ed.v2.x - edge.v2.x) < 0.01 && Math.abs(ed.v2.y - edge.v2.y) < 0.01) ||
    (Math.abs(ed.v1.x - edge.v2.x) < 0.01 && Math.abs(ed.v1.y - edge.v2.y) < 0.01 &&
     Math.abs(ed.v2.x - edge.v1.x) < 0.01 && Math.abs(ed.v2.y - edge.v1.y) < 0.01)
  );

  if (!e || e.road) return false;

  // Check piece limit: max 15 roads per player
  if (player.roads.length >= 15) return false;

  if (isSetup) {
    if (!lastSettlement) return false;

    const isAdjacent =
      (Math.abs(e.v1.x - lastSettlement.x) < 0.01 && Math.abs(e.v1.y - lastSettlement.y) < 0.01) ||
      (Math.abs(e.v2.x - lastSettlement.x) < 0.01 && Math.abs(e.v2.y - lastSettlement.y) < 0.01);

    if (!isAdjacent) return false;

    e.road = true;
    e.playerId = player.id;
    player.roads.push(edge);
    return true;
  }

  const cost = { wood: 1, brick: 1 };
  if (!hasResources(player, cost)) return false;

  const isConnected = board.edges.some(existingEdge => {
    if (existingEdge.playerId !== player.id || !existingEdge.road) return false;
    return (Math.abs(existingEdge.v1.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v1.y) < 0.01) ||
           (Math.abs(existingEdge.v1.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v2.y) < 0.01) ||
           (Math.abs(existingEdge.v2.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v1.y) < 0.01) ||
           (Math.abs(existingEdge.v2.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v2.y) < 0.01);
  }) || board.vertices.some(v => {
    if (v.playerId !== player.id || !v.building) return false;
    return (Math.abs(v.x - e.v1.x) < 0.01 && Math.abs(v.y - e.v1.y) < 0.01) ||
           (Math.abs(v.x - e.v2.x) < 0.01 && Math.abs(v.y - e.v2.y) < 0.01);
  });

  if (!isConnected) return false;

  deductResources(player, cost);

  e.road = true;
  e.playerId = player.id;
  player.roads.push(edge);

  return true;
}

export function buildRoadFree(player: Player, board: Board, edge: Edge): boolean {
  if (!player.freeRoads || player.freeRoads <= 0) return false;

  // Check piece limit: max 15 roads per player
  if (player.roads.length >= 15) return false;

  const e = board.edges.find(ed =>
    (Math.abs(ed.v1.x - edge.v1.x) < 0.01 && Math.abs(ed.v1.y - edge.v1.y) < 0.01 &&
     Math.abs(ed.v2.x - edge.v2.x) < 0.01 && Math.abs(ed.v2.y - edge.v2.y) < 0.01) ||
    (Math.abs(ed.v1.x - edge.v2.x) < 0.01 && Math.abs(ed.v1.y - edge.v2.y) < 0.01 &&
     Math.abs(ed.v2.x - edge.v1.x) < 0.01 && Math.abs(ed.v2.y - edge.v1.y) < 0.01)
  );

  if (!e || e.road) return false;

  const isConnected = board.edges.some(existingEdge => {
    if (existingEdge.playerId !== player.id || !existingEdge.road) return false;
    return (Math.abs(existingEdge.v1.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v1.y) < 0.01) ||
           (Math.abs(existingEdge.v1.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v1.y - e.v2.y) < 0.01) ||
           (Math.abs(existingEdge.v2.x - e.v1.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v1.y) < 0.01) ||
           (Math.abs(existingEdge.v2.x - e.v2.x) < 0.01 && Math.abs(existingEdge.v2.y - e.v2.y) < 0.01);
  }) || board.vertices.some(v => {
    if (v.playerId !== player.id || !v.building) return false;
    return (Math.abs(v.x - e.v1.x) < 0.01 && Math.abs(v.y - e.v1.y) < 0.01) ||
           (Math.abs(v.x - e.v2.x) < 0.01 && Math.abs(v.y - e.v2.y) < 0.01);
  });

  if (!isConnected) return false;

  e.road = true;
  e.playerId = player.id;
  player.roads.push(edge);
  player.freeRoads--;

  return true;
}

export function buildCity(player: Player, board: Board, vertex: Coordinate): boolean {
  const v = board.vertices.find(vert =>
    Math.abs(vert.x - vertex.x) < 0.01 && Math.abs(vert.y - vertex.y) < 0.01
  );

  if (!v || v.building !== 'settlement' || v.playerId !== player.id) return false;

  // Check piece limit: max 4 cities per player
  if (player.cities.length >= 4) return false;

  const cost = { wheat: 2, ore: 3 };
  if (!hasResources(player, cost)) return false;

  deductResources(player, cost);

  v.building = 'city';
  player.cities.push(vertex);
  player.settlements = player.settlements.filter(s =>
    Math.abs(s.x - vertex.x) >= 0.01 || Math.abs(s.y - vertex.y) >= 0.01
  );

  return true;
}

export function calculateLongestRoad(players: Player[], board: Board): void {
  // Find who currently has Longest Road
  const currentHolder = players.find(p => p.longestRoad);

  // Find the player with the longest road (minimum 5 segments)
  let longestPlayer: Player | null = null;
  let longestLength = 4; // Start at 4 so we only consider players with 5+ segments

  for (const player of players) {
    const longestPath = findLongestContinuousPath(player, board);
    if (longestPath > longestLength) {
      longestLength = longestPath;
      longestPlayer = player;
    }
  }

  // Tie-breaking rule: if there's a tie, the current holder keeps it
  // Only transfer if someone has MORE road segments than the current longest length
  if (currentHolder) {
    const currentHolderLength = findLongestContinuousPath(currentHolder, board);
    if (currentHolderLength === longestLength) {
      longestPlayer = currentHolder;
    }
  }

  // Only award if someone has at least 5 road segments
  if (longestLength < 5) {
    longestPlayer = null;
  }

  // Update flags and lengths - victory points will be computed via getVictoryPoints()
  for (const player of players) {
    player.longestRoad = (player === longestPlayer);
    player.longestRoadLength = findLongestContinuousPath(player, board);
  }
}

function findLongestContinuousPath(player: Player, board: Board): number {
  if (player.roads.length === 0) return 0;

  // Build adjacency map of road connections
  const roadMap = new Map<string, Coordinate[]>();

  player.roads.forEach(road => {
    const v1Key = `${road.v1.x.toFixed(2)},${road.v1.y.toFixed(2)}`;
    const v2Key = `${road.v2.x.toFixed(2)},${road.v2.y.toFixed(2)}`;

    if (!roadMap.has(v1Key)) roadMap.set(v1Key, []);
    if (!roadMap.has(v2Key)) roadMap.set(v2Key, []);

    roadMap.get(v1Key)!.push(road.v2);
    roadMap.get(v2Key)!.push(road.v1);
  });

  // Check which vertices are blocked by opponent settlements
  const blockedVertices = new Set<string>();
  board.vertices.forEach(vertex => {
    if (vertex.building && vertex.playerId !== player.id) {
      const key = `${vertex.x.toFixed(2)},${vertex.y.toFixed(2)}`;
      blockedVertices.add(key);
    }
  });

  // DFS to find longest path from each starting vertex
  let maxLength = 0;

  for (const startKey of roadMap.keys()) {
    const visited = new Set<string>();
    const length = dfsLongestPath(startKey, roadMap, blockedVertices, visited);
    maxLength = Math.max(maxLength, length);
  }

  return maxLength;
}

function dfsLongestPath(
  currentKey: string,
  roadMap: Map<string, Coordinate[]>,
  blockedVertices: Set<string>,
  visited: Set<string>
): number {
  const neighbors = roadMap.get(currentKey) || [];
  let maxPath = 0;

  for (const neighbor of neighbors) {
    const neighborKey = `${neighbor.x.toFixed(2)},${neighbor.y.toFixed(2)}`;
    const edgeKey = [currentKey, neighborKey].sort().join('->');

    // Skip if this edge was already visited or if neighbor is blocked
    if (visited.has(edgeKey) || blockedVertices.has(neighborKey)) continue;

    visited.add(edgeKey);
    const pathLength = 1 + dfsLongestPath(neighborKey, roadMap, blockedVertices, visited);
    maxPath = Math.max(maxPath, pathLength);
    visited.delete(edgeKey);
  }

  return maxPath;
}

function getAdjacentVertices(vertex: Vertex, board: Board): Vertex[] {
  const adjacent: Vertex[] = [];
  board.edges.forEach(edge => {
    if (Math.abs(edge.v1.x - vertex.x) < 0.01 && Math.abs(edge.v1.y - vertex.y) < 0.01) {
      const v = board.vertices.find(v =>
        Math.abs(v.x - edge.v2.x) < 0.01 && Math.abs(v.y - edge.v2.y) < 0.01
      );
      if (v) adjacent.push(v);
    } else if (Math.abs(edge.v2.x - vertex.x) < 0.01 && Math.abs(edge.v2.y - vertex.y) < 0.01) {
      const v = board.vertices.find(v =>
        Math.abs(v.x - edge.v1.x) < 0.01 && Math.abs(v.y - edge.v1.y) < 0.01
      );
      if (v) adjacent.push(v);
    }
  });
  return adjacent;
}

function isConnectedToPlayerRoad(vertex: Vertex, playerId: string, board: Board): boolean {
  return board.edges.some(edge => {
    if (edge.playerId !== playerId || !edge.road) return false;
    return (Math.abs(edge.v1.x - vertex.x) < 0.01 && Math.abs(edge.v1.y - vertex.y) < 0.01) ||
           (Math.abs(edge.v2.x - vertex.x) < 0.01 && Math.abs(edge.v2.y - vertex.y) < 0.01);
  });
}

function giveSetupResources(vertex: Vertex, player: Player, board: Board): void {
  const resourceMap: Record<TerrainType, ResourceType | null> = {
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
