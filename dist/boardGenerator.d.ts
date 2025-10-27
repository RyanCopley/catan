import { Board, Hex, Vertex, Edge, Coordinate } from './types';
export declare function generateBoard(): Board;
export declare function generateVertices(hexes: Hex[]): Vertex[];
export declare function generateEdges(hexes: Hex[]): Edge[];
export declare function getHexVertices(q: number, r: number): Coordinate[];
export declare function getHexEdges(q: number, r: number): Edge[];
//# sourceMappingURL=boardGenerator.d.ts.map