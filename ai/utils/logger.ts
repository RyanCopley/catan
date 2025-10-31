import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple logger for training metrics
 */
export class TrainingLogger {
  private logFile: string;
  private metrics: any[] = [];

  constructor(logDir: string = './ai/logs') {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logDir, `training_${timestamp}.json`);

    console.log(`Logging to: ${this.logFile}`);
  }

  /**
   * Log training metrics
   */
  log(metrics: {
    cycle: number;
    gamesPlayed: number;
    bufferSize: number;
    policyLoss?: number;
    valueLoss?: number;
    totalLoss?: number;
    entropy?: number;
    avgReward?: number;
    wins?: number;
    losses?: number;
    timestamp?: string;
  }): void {
    const entry = {
      ...metrics,
      timestamp: new Date().toISOString(),
    };

    this.metrics.push(entry);

    // Write to file
    fs.writeFileSync(this.logFile, JSON.stringify(this.metrics, null, 2));

    // Print summary
    console.log('\n--- Training Metrics ---');
    console.log(`Cycle: ${metrics.cycle}`);
    console.log(`Games Played: ${metrics.gamesPlayed}`);
    console.log(`Buffer Size: ${metrics.bufferSize}`);
    if (metrics.policyLoss !== undefined) {
      console.log(`Policy Loss: ${metrics.policyLoss.toFixed(4)}`);
      console.log(`Value Loss: ${metrics.valueLoss?.toFixed(4)}`);
      console.log(`Entropy: ${metrics.entropy?.toFixed(4)}`);
    }
    if (metrics.avgReward !== undefined) {
      console.log(`Avg Reward: ${metrics.avgReward.toFixed(4)}`);
    }
    if (metrics.wins !== undefined) {
      console.log(`Wins: ${metrics.wins}, Losses: ${metrics.losses}`);
    }
    console.log('------------------------\n');
  }

  /**
   * Get all metrics
   */
  getMetrics(): any[] {
    return this.metrics;
  }
}
