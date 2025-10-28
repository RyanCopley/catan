import { createClient } from 'redis';
import { GameState, GameHistory } from './types';
import { Game } from './game';

class GameCache {
  private client;
  private connected = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.connected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.connected = true;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
  }

  async saveGame(gameId: string, game: Game): Promise<void> {
    if (!this.connected) {
      console.warn('Redis not connected, skipping cache save');
      return;
    }

    try {
      const gameState = game.getState();
      await this.client.set(
        `game:${gameId}`,
        JSON.stringify(gameState),
        { EX: 86400 } // Expire after 24 hours
      );

      // Add to the set of active game IDs
      await this.client.sAdd('game:active', gameId);
    } catch (error) {
      console.error(`Failed to save game ${gameId} to cache:`, error);
    }
  }

  async getGame(gameId: string): Promise<GameState | null> {
    if (!this.connected) {
      console.warn('Redis not connected, skipping cache lookup');
      return null;
    }

    try {
      const data = await this.client.get(`game:${gameId}`);
      if (!data) return null;

      return JSON.parse(data) as GameState;
    } catch (error) {
      console.error(`Failed to get game ${gameId} from cache:`, error);
      return null;
    }
  }

  async deleteGame(gameId: string): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.del(`game:${gameId}`);
      // Remove from the set of active game IDs
      await this.client.sRem('game:active', gameId);
    } catch (error) {
      console.error(`Failed to delete game ${gameId} from cache:`, error);
    }
  }

  async getAllGameIds(): Promise<string[]> {
    if (!this.connected) {
      console.warn('Redis not connected, cannot retrieve game IDs');
      return [];
    }

    try {
      return await this.client.sMembers('game:active');
    } catch (error) {
      console.error('Failed to retrieve active game IDs:', error);
      return [];
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  // Game History Methods
  async saveGameHistory(history: GameHistory): Promise<void> {
    if (!this.connected) {
      console.warn('Redis not connected, skipping history save');
      return;
    }

    try {
      // Save individual game history with score in sorted set for ordering
      await this.client.zAdd('game:history', {
        score: history.completedAt,
        value: history.gameId
      });

      // Save the full history details
      await this.client.set(
        `game:history:${history.gameId}`,
        JSON.stringify(history),
        { EX: 2592000 } // Expire after 30 days
      );

      // Keep only the most recent 50 games
      const count = await this.client.zCard('game:history');
      if (count > 50) {
        await this.client.zRemRangeByRank('game:history', 0, count - 51);
      }
    } catch (error) {
      console.error(`Failed to save game history ${history.gameId}:`, error);
    }
  }

  async getGameHistory(limit: number = 10): Promise<GameHistory[]> {
    if (!this.connected) {
      console.warn('Redis not connected, cannot retrieve game history');
      return [];
    }

    try {
      // Get most recent game IDs (sorted by timestamp descending)
      const gameIds = await this.client.zRange('game:history', 0, limit - 1, { REV: true });

      // Fetch all game history details
      const histories: GameHistory[] = [];
      for (const gameId of gameIds) {
        const data = await this.client.get(`game:history:${gameId}`);
        if (data) {
          histories.push(JSON.parse(data) as GameHistory);
        }
      }

      return histories;
    } catch (error) {
      console.error('Failed to retrieve game history:', error);
      return [];
    }
  }
}

export const gameCache = new GameCache();
