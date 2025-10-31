import { AIPlayer } from '../bot/aiPlayer';
import { CatanNet } from '../models/catanNet';
import { ReplayBuffer } from './replayBuffer';
import { TRAINING_CONFIG } from '../config/training.config';
import { Experience } from '../types';
import { exec } from 'child_process';

/**
 * Orchestrates self-play games for training
 */
export class TrainingOrchestrator {
  private network: CatanNet;
  private replayBuffer: ReplayBuffer;
  private gamesPlayed: number = 0;

  constructor(network: CatanNet, replayBuffer: ReplayBuffer) {
    this.network = network;
    this.replayBuffer = replayBuffer;
  }

  /**
   * Run a single self-play game with 4 AI players
   */
  async runSelfPlayGame(): Promise<{
    experiences: Experience[];
    winner: number;
    turns: number;
  }> {
    console.log(`\n=== Starting Self-Play Game ${this.gamesPlayed + 1} ===`);

    // Create 4 AI players
    const players: AIPlayer[] = [];
    for (let i = 0; i < TRAINING_CONFIG.selfPlay.botsPerGame; i++) {
      const player = new AIPlayer(this.network, `AI_Bot_${i}`);
      players.push(player);
      await player.waitForConnection();
    }

    // First player creates game
    const { gameId, password } = await players[0].createGame();
    console.log(`Game created: ${gameId}`);

    // Open browser to spectate (only on first game)
    if (this.gamesPlayed === 0) {
      this.openBrowserSpectate(gameId);
    }

    // Small delay
    await this.sleep(500);

    // Other players join
    for (let i = 1; i < players.length; i++) {
      await players[i].joinGame(gameId, password);
      console.log(`Player ${i} joined`);
      await this.sleep(300);
    }

    // Small delay to ensure all players are ready
    await this.sleep(500);

    // Start the game
    players[0].startGame();
    console.log('Game started');

    // Wait for game to finish
    await this.waitForGameEnd(players);

    // Collect experiences from all players
    const allExperiences: Experience[] = [];
    for (const player of players) {
      const exps = player.getExperiences();
      allExperiences.push(...exps);
    }

    console.log(`Game finished. Collected ${allExperiences.length} total experiences`);

    // Disconnect all players
    for (const player of players) {
      player.disconnect();
    }

    this.gamesPlayed++;

    return {
      experiences: allExperiences,
      winner: -1, // We don't track this for now
      turns: allExperiences.length,
    };
  }

  /**
   * Wait for game to end by polling players
   */
  private async waitForGameEnd(players: AIPlayer[]): Promise<void> {
    // Poll for game end (when all players have experiences with done=true)
    // This is a simple approach; in production you'd use better signaling

    let maxWaitTime = 120000; // 2 minutes max (reduced from 5)
    let waitTime = 0;
    const pollInterval = 1000;

    while (waitTime < maxWaitTime) {
      await this.sleep(pollInterval);
      waitTime += pollInterval;

      // Check if any player has terminal experience
      let gameEnded = false;
      for (const player of players) {
        const exps = player.getExperiences();
        if (exps.some(exp => exp.done)) {
          gameEnded = true;
          break;
        }
        // Put experiences back (this is a hack for checking)
        // In reality, we'd track game state differently
      }

      if (gameEnded) {
        // Wait a bit more to ensure all experiences are collected
        await this.sleep(2000);
        break;
      }

      if (waitTime % 10000 === 0) {
        console.log(`Waiting for game to end... (${waitTime / 1000}s)`);
      }
    }

    if (waitTime >= maxWaitTime) {
      console.warn('Game timeout - forcing end after 2 minutes');
      // Force all players to end the game
      for (const player of players) {
        player.forceGameEnd();
      }
    }
  }

  /**
   * Run multiple self-play games
   */
  async runSelfPlayCycle(numGames: number): Promise<void> {
    console.log(`\n========================================`);
    console.log(`Starting self-play cycle: ${numGames} games`);
    console.log(`========================================\n`);

    for (let i = 0; i < numGames; i++) {
      try {
        const result = await this.runSelfPlayGame();

        // Add experiences to replay buffer
        this.replayBuffer.add(result.experiences);

        console.log(`\nBuffer stats:`, this.replayBuffer.getStats());

        // Small delay between games
        await this.sleep(1000);

      } catch (error) {
        console.error(`Error in game ${i}:`, error);
        // Continue to next game
      }
    }

    console.log(`\n========================================`);
    console.log(`Self-play cycle complete`);
    console.log(`Total games played: ${this.gamesPlayed}`);
    console.log(`Buffer size: ${this.replayBuffer.size()}`);
    console.log(`========================================\n`);
  }

  /**
   * Get number of games played
   */
  getGamesPlayed(): number {
    return this.gamesPlayed;
  }

  /**
   * Open browser to spectate the game
   */
  private openBrowserSpectate(gameId: string): void {
    const spectateUrl = `http://localhost:3000/?spectate=${gameId}`;
    console.log(`\n🌐 Opening browser: ${spectateUrl}\n`);

    // Try different commands based on platform
    const platform = process.platform;
    let command: string;
    if (platform === 'darwin') {
      command = `open "${spectateUrl}"`;
    } else if (platform === 'win32') {
      command = `start "${spectateUrl}"`;
    } else {
      // Linux
      command = `xdg-open "${spectateUrl}" 2>/dev/null || firefox "${spectateUrl}" 2>/dev/null || google-chrome "${spectateUrl}" 2>/dev/null &`;
    }

    exec(command, (error) => {
      if (error) {
        console.log(`Note: Could not auto-open browser. Please visit: ${spectateUrl}`);
      }
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
