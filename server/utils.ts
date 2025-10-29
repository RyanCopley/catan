import { Coordinate } from './types';

/**
 * Epsilon value for floating-point coordinate comparisons.
 * Coordinates within this tolerance are considered equal.
 */
export const COORDINATE_EPSILON = 0.01;

/**
 * Checks if two coordinates are equal within floating-point tolerance.
 * @param c1 - First coordinate
 * @param c2 - Second coordinate
 * @returns true if coordinates are equal within COORDINATE_EPSILON
 */
export function coordinatesEqual(c1: Coordinate, c2: Coordinate): boolean {
  return Math.abs(c1.x - c2.x) < COORDINATE_EPSILON &&
         Math.abs(c1.y - c2.y) < COORDINATE_EPSILON;
}

/**
 * Generates a unique string key for a coordinate that can be used in Maps/Sets.
 * @param coord - The coordinate to convert to a key
 * @returns A string key representing the coordinate
 */
export function coordinateToKey(coord: Coordinate): string {
  return `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`;
}

/**
 * Finds a coordinate in an array that matches the given coordinate within tolerance.
 * @param coords - Array of coordinates to search
 * @param target - Coordinate to find
 * @returns The matching coordinate or undefined if not found
 */
export function findCoordinate(coords: Coordinate[], target: Coordinate): Coordinate | undefined {
  return coords.find(c => coordinatesEqual(c, target));
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateGameId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
