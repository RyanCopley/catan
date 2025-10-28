import { Board, Hex, Vertex, Edge, Port, HexCoordinate, Coordinate, TerrainType, ResourceType } from './types';
import { shuffle } from './utils';

export function generateBoard(): Board {
  const terrainTypes: TerrainType[] = [
    'forest', 'forest', 'forest', 'forest',
    'pasture', 'pasture', 'pasture', 'pasture',
    'fields', 'fields', 'fields', 'fields',
    'hills', 'hills', 'hills',
    'mountains', 'mountains', 'mountains',
    'desert'
  ];

  const numberTokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

  const shuffledTerrain = shuffle([...terrainTypes]);
  const shuffledNumbers = shuffle([...numberTokens]);

  const hexes = generateHexes(shuffledTerrain, shuffledNumbers);
  const vertices = generateVertices(hexes);
  const edges = generateEdges(hexes);
  const ports = generatePorts(hexes, vertices);

  return {
    hexes,
    vertices,
    edges,
    ports,
    robber: hexes.find(h => h.hasRobber)!
  };
}

function generateHexes(terrainTypes: TerrainType[], shuffledNumbers: number[]): Hex[] {
  const layout = [
    { row: 0, positions: [{ q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }] },
    { row: 1, positions: [{ q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 }] },
    { row: 2, positions: [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }] },
    { row: 3, positions: [{ q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }] },
    { row: 4, positions: [{ q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }] }
  ];

  const hexes: Hex[] = [];
  let index = 0;
  let numberIndex = 0;

  layout.forEach(row => {
    row.positions.forEach(pos => {
      const terrain = terrainTypes[index];
      const hex: Hex = {
        q: pos.q,
        r: pos.r,
        terrain: terrain,
        number: terrain === 'desert' ? null : shuffledNumbers[numberIndex],
        hasRobber: terrain === 'desert'
      };

      if (terrain !== 'desert') numberIndex++;
      hexes.push(hex);
      index++;
    });
  });

  return hexes;
}

export function generateVertices(hexes: Hex[]): Vertex[] {
  const vertices = new Map<string, Vertex>();

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
      vertices.get(key)!.adjacentHexes.push({ q: hex.q, r: hex.r });
    });
  });

  return Array.from(vertices.values());
}

export function generateEdges(hexes: Hex[]): Edge[] {
  const edges = new Map<string, Edge>();

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

function generatePorts(hexes: Hex[], vertices: Vertex[]): Port[] {
  const portTypes: Array<{ type: '3:1' | '2:1', resource: ResourceType | null }> = [
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

  const shuffledPorts = shuffle([...portTypes]);

  // Generate all border edges for all border hexes
  const allBorderEdges = getAllBorderEdges(hexes);

  // Filter to valid port configuration (9 ports, no adjacent edges)
  const selectedEdges = selectPortLocations(allBorderEdges, 9);

  const ports: Port[] = [];

  // Create ports at selected locations
  selectedEdges.forEach((location, i) => {
    const portType = shuffledPorts[i];

    const hex = hexes.find(h => h.q === location.hexQ && h.r === location.hexR);
    if (!hex) return;

    const hexVertices = getHexVertices(location.hexQ, location.hexR);
    const portVertex1 = hexVertices[location.vertices[0]];
    const portVertex2 = hexVertices[location.vertices[1]];

    const vertex1 = vertices.find(v =>
      Math.abs(v.x - portVertex1.x) < 0.01 && Math.abs(v.y - portVertex1.y) < 0.01
    );
    const vertex2 = vertices.find(v =>
      Math.abs(v.x - portVertex2.x) < 0.01 && Math.abs(v.y - portVertex2.y) < 0.01
    );

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
  });

  return ports;
}

// Select port locations ensuring no adjacent edges and good distribution
function selectPortLocations(
  allEdges: Array<{ hexQ: number, hexR: number, vertices: number[] }>,
  targetCount: number
): Array<{ hexQ: number, hexR: number, vertices: number[] }> {
  // First, order the edges in a circular path around the border
  const orderedEdges = orderBorderEdgesCircularly(allEdges);

  const totalEdges = orderedEdges.length;
  // Minimum spacing of 4 edges means ports are at least 3 edges apart
  const minSpacing = 4;
  const spacing = Math.max(minSpacing, Math.floor(totalEdges / targetCount)); // At least 4 edges apart

  // Start at a random offset to add variety
  const startOffset = Math.floor(Math.random() * spacing);

  const selected: Array<{ hexQ: number, hexR: number, vertices: number[] }> = [];

  // Select ports with even spacing (at least 4 edges apart)
  for (let i = 0; i < targetCount && i * spacing + startOffset < totalEdges; i++) {
    const index = (i * spacing + startOffset) % totalEdges;
    selected.push(orderedEdges[index]);
  }

  // If we didn't get enough ports (due to rounding), fill in the gaps
  let idx = 0;
  while (selected.length < targetCount && idx < totalEdges) {
    const edge = orderedEdges[idx];

    // Check if this edge is far enough from existing ports (at least 3 edges away)
    const tooClose = selected.some(selectedEdge => {
      const dist = getCircularDistance(orderedEdges, edge, selectedEdge);
      return dist < 3;
    });

    if (!tooClose) {
      selected.push(edge);
    }
    idx++;
  }

  return selected;
}

// Get circular distance between two edges in the ordered list
function getCircularDistance(
  orderedEdges: Array<{ hexQ: number, hexR: number, vertices: number[] }>,
  edge1: { hexQ: number, hexR: number, vertices: number[] },
  edge2: { hexQ: number, hexR: number, vertices: number[] }
): number {
  const idx1 = orderedEdges.findIndex(e =>
    e.hexQ === edge1.hexQ && e.hexR === edge1.hexR && e.vertices[0] === edge1.vertices[0]
  );
  const idx2 = orderedEdges.findIndex(e =>
    e.hexQ === edge2.hexQ && e.hexR === edge2.hexR && e.vertices[0] === edge2.vertices[0]
  );

  if (idx1 === -1 || idx2 === -1) return Infinity;

  const totalEdges = orderedEdges.length;
  const directDist = Math.abs(idx1 - idx2);
  const wrapDist = totalEdges - directDist;

  return Math.min(directDist, wrapDist);
}

// Order border edges in a circular path around the board
function orderBorderEdgesCircularly(
  edges: Array<{ hexQ: number, hexR: number, vertices: number[] }>
): Array<{ hexQ: number, hexR: number, vertices: number[] }> {
  if (edges.length === 0) return [];

  const ordered: Array<{ hexQ: number, hexR: number, vertices: number[] }> = [];
  const remaining = [...edges];

  // Start with an edge from a corner (top-left corner is a good starting point)
  // Find the edge with the minimum q value, then minimum r value
  let startIndex = 0;
  let minQ = remaining[0].hexQ;
  let minR = remaining[0].hexR;

  for (let i = 1; i < remaining.length; i++) {
    if (remaining[i].hexQ < minQ || (remaining[i].hexQ === minQ && remaining[i].hexR < minR)) {
      minQ = remaining[i].hexQ;
      minR = remaining[i].hexR;
      startIndex = i;
    }
  }

  ordered.push(remaining.splice(startIndex, 1)[0]);

  // Build a circular chain by always finding the next adjacent edge
  while (remaining.length > 0) {
    const lastEdge = ordered[ordered.length - 1];

    // Find an edge that shares a vertex with the last edge
    const nextIndex = remaining.findIndex(edge =>
      areEdgesAdjacent(lastEdge, edge)
    );

    if (nextIndex !== -1) {
      ordered.push(remaining.splice(nextIndex, 1)[0]);
    } else {
      // If no adjacent edge found, we might have completed the loop
      // Try to find an edge adjacent to the first edge to close the loop
      const firstEdge = ordered[0];
      const loopCloseIndex = remaining.findIndex(edge =>
        areEdgesAdjacent(firstEdge, edge)
      );

      if (loopCloseIndex !== -1) {
        // Insert at the beginning to maintain circular order
        ordered.unshift(remaining.splice(loopCloseIndex, 1)[0]);
      } else {
        // Fallback: just add remaining edges
        ordered.push(remaining.shift()!);
      }
    }
  }

  return ordered;
}

// Check if two edges are adjacent (share a vertex)
function areEdgesAdjacent(
  edge1: { hexQ: number, hexR: number, vertices: number[] },
  edge2: { hexQ: number, hexR: number, vertices: number[] }
): boolean {
  // If they're on the same hex, check if vertices are adjacent
  if (edge1.hexQ === edge2.hexQ && edge1.hexR === edge2.hexR) {
    // Edges are adjacent if they share a vertex
    // Edge vertices are [n, n+1], so edges are adjacent if they differ by 1 (mod 6)
    const v1Start = edge1.vertices[0];
    const v2Start = edge2.vertices[0];
    const diff = Math.abs(v1Start - v2Start);
    return diff === 1 || diff === 5; // Adjacent edges differ by 1 or 5 (wrapping around)
  }

  // If they're on different hexes, check if they share a vertex by coordinates
  const hex1Vertices = getHexVertices(edge1.hexQ, edge1.hexR);
  const hex2Vertices = getHexVertices(edge2.hexQ, edge2.hexR);

  const edge1Coords = [
    hex1Vertices[edge1.vertices[0]],
    hex1Vertices[edge1.vertices[1]]
  ];

  const edge2Coords = [
    hex2Vertices[edge2.vertices[0]],
    hex2Vertices[edge2.vertices[1]]
  ];

  // Check if any vertices match (within floating point tolerance)
  for (const v1 of edge1Coords) {
    for (const v2 of edge2Coords) {
      if (Math.abs(v1.x - v2.x) < 0.01 && Math.abs(v1.y - v2.y) < 0.01) {
        return true;
      }
    }
  }

  return false;
}

// Helper function to identify all border edges
function getAllBorderEdges(hexes: Hex[]): Array<{ hexQ: number, hexR: number, vertices: number[] }> {
  const borderEdges: Array<{ hexQ: number, hexR: number, vertices: number[] }> = [];

  // For each hex, check each of its 6 edges to see if it's a border edge
  hexes.forEach(hex => {
    for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
      if (isBorderEdge(hex, edgeIndex, hexes)) {
        borderEdges.push({
          hexQ: hex.q,
          hexR: hex.r,
          vertices: [edgeIndex, (edgeIndex + 1) % 6]
        });
      }
    }
  });

  return borderEdges;
}

// Check if a specific edge of a hex is a border edge (no neighbor on that side)
function isBorderEdge(hex: Hex, edgeIndex: number, hexes: Hex[]): boolean {
  // Get the neighbor hex coordinate for this edge
  // Vertices are numbered 0-5 starting from the right (angle 0) going counter-clockwise
  // Edge N connects vertex N to vertex N+1
  // The neighbor sharing edge N is in a specific direction based on flat-top hex orientation
  // In axial coordinates with flat-top orientation:
  // Edge 0 (vertices 0-1, top-right): neighbor at (q, r-1)
  // Edge 1 (vertices 1-2, top-left): neighbor at (q-1, r)
  // Edge 2 (vertices 2-3, left): neighbor at (q-1, r+1)
  // Edge 3 (vertices 3-4, bottom-left): neighbor at (q, r+1)
  // Edge 4 (vertices 4-5, bottom-right): neighbor at (q+1, r)
  // Edge 5 (vertices 5-0, right): neighbor at (q+1, r-1)

  const neighborOffsets = [
    { q: 1, r: 0 },    // Edge 0
    { q: 0, r: 1 },    // Edge 1
    { q: -1, r: 1 },   // Edge 2
    { q: -1, r: 0 },   // Edge 3
    { q: 0, r: -1 },   // Edge 4
    { q: 1, r: -1 }    // Edge 5
  ];

  const offset = neighborOffsets[edgeIndex];
  const neighborQ = hex.q + offset.q;
  const neighborR = hex.r + offset.r;

  // Check if this neighbor exists in the hex list
  const hasNeighbor = hexes.some(h => h.q === neighborQ && h.r === neighborR);

  // It's a border edge if there's no neighbor
  return !hasNeighbor;
}

export function getHexVertices(q: number, r: number): Coordinate[] {
  const size = 1;
  const x = size * (3/2 * q);
  const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

  const vertices: Coordinate[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i;
    vertices.push({
      x: parseFloat((x + size * Math.cos(angle)).toFixed(3)),
      y: parseFloat((y + size * Math.sin(angle)).toFixed(3))
    });
  }
  return vertices;
}

export function getHexEdges(q: number, r: number): Edge[] {
  const vertices = getHexVertices(q, r);
  const edges: Edge[] = [];
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
