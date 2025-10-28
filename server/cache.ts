import { createClient } from 'redis';
import { GameState } from './types';
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
}

export const gameCache = new GameCache();
