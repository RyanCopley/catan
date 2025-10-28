import { Server } from 'socket.io';
import { Game } from './game';
import { gameCache } from './cache';

const CLEANUP_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ABANDONED_GAME_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export class GameCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private io: Server;
  private games: Map<string, Game>;

  constructor(io: Server, games: Map<string, Game>) {
    this.io = io;
    this.games = games;
  }

  start(): void {
    if (this.cleanupInterval) {
      console.log('Game cleanup service already running');
      return;
    }

    console.log('Starting game cleanup service (checks every 5 minutes)');

    // Run initial cleanup after 1 minute
    setTimeout(() => {
      this.runCleanup().catch(err => {
        console.error('Initial game cleanup failed:', err);
      });
    }, 60 * 1000);

    // Then run periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch(err => {
        console.error('Periodic game cleanup failed:', err);
      });
    }, CLEANUP_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('Game cleanup service stopped');
    }
  }

  private async runCleanup(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [gameId, game] of this.games.entries()) {
      // Skip lobby games (handled by existing lobby health check)
      if (game.phase === 'waiting') {
        continue;
      }

      // For finished games, clean up after 30 minutes regardless of disconnect status
      if (game.phase === 'finished') {
        const inactiveDuration = now - game.lastActivityAt;

        if (inactiveDuration >= ABANDONED_GAME_THRESHOLD_MS) {
          console.log(`Cleaning up finished game ${gameId}:`);
          console.log(`  Players: ${game.players.map(p => p.name).join(', ')}`);
          console.log(`  Finished for: ${Math.round(inactiveDuration / 60000)} minutes`);

          // Remove from memory and cache
          this.games.delete(gameId);
          await gameCache.deleteGame(gameId);

          cleanedCount++;
        }
        continue;
      }

      // For active games (setup/playing), check if all players are disconnected
      const allPlayersDisconnected = game.players.every(p => p.disconnected === true);

      if (!allPlayersDisconnected) {
        continue;
      }

      // Check if game has been inactive for threshold period
      const inactiveDuration = now - game.lastActivityAt;

      if (inactiveDuration >= ABANDONED_GAME_THRESHOLD_MS) {
        console.log(`Cleaning up abandoned game ${gameId}:`);
        console.log(`  Phase: ${game.phase}`);
        console.log(`  Players: ${game.players.map(p => p.name).join(', ')}`);
        console.log(`  Inactive for: ${Math.round(inactiveDuration / 60000)} minutes`);

        // Remove from memory and cache
        this.games.delete(gameId);
        await gameCache.deleteGame(gameId);

        // Notify any remaining socket connections (edge case)
        this.io.to(gameId).emit('gameAbandoned', {
          message: 'This game was abandoned due to inactivity'
        });

        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Game cleanup: removed ${cleanedCount} abandoned game(s)`);
    }
  }

  // Manual cleanup trigger for testing or admin use
  async triggerCleanup(): Promise<{ cleaned: number; checked: number }> {
    const before = this.games.size;
    await this.runCleanup();
    const after = this.games.size;

    return {
      checked: before,
      cleaned: before - after
    };
  }

  // Get stats about game inactivity
  getInactivityStats(): Array<{
    gameId: string;
    phase: string;
    playerCount: number;
    allDisconnected: boolean;
    inactiveMinutes: number;
    willBeCleanedIn: number | null;
  }> {
    const now = Date.now();
    const stats: Array<any> = [];

    for (const [gameId, game] of this.games.entries()) {
      if (game.phase === 'waiting') {
        continue;
      }

      const allDisconnected = game.players.every(p => p.disconnected === true);
      const inactiveDuration = now - game.lastActivityAt;
      const inactiveMinutes = Math.round(inactiveDuration / 60000);

      let willBeCleanedIn: number | null = null;

      // Finished games are cleaned up after 30 minutes regardless of disconnect status
      if (game.phase === 'finished') {
        const remaining = ABANDONED_GAME_THRESHOLD_MS - inactiveDuration;
        willBeCleanedIn = remaining > 0 ? Math.round(remaining / 60000) : 0;
      }
      // Active games only cleaned up if all players are disconnected
      else if (allDisconnected) {
        const remaining = ABANDONED_GAME_THRESHOLD_MS - inactiveDuration;
        willBeCleanedIn = remaining > 0 ? Math.round(remaining / 60000) : 0;
      }

      stats.push({
        gameId,
        phase: game.phase,
        playerCount: game.players.length,
        allDisconnected,
        inactiveMinutes,
        willBeCleanedIn
      });
    }

    return stats;
  }
}
