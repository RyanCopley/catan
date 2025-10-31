import { CatanNet } from './models/catanNet';
import { ReplayBuffer } from './training/replayBuffer';
import { PPOTrainer } from './training/trainer';
import { TrainingOrchestrator } from './training/orchestrator';
import { TrainingLogger } from './utils/logger';
import { TRAINING_CONFIG } from './config/training.config';
import * as fs from 'fs';

/**
 * Main training loop
 */
async function main() {
  console.log('=================================================');
  console.log('     Catan AI Training - MVP');
  console.log('=================================================\n');

  // Print configuration
  console.log('Configuration:');
  console.log(`- Games per cycle: ${TRAINING_CONFIG.selfPlay.gamesPerCycle}`);
  console.log(`- Batch size: ${TRAINING_CONFIG.training.batchSize}`);
  console.log(`- Learning rate: ${TRAINING_CONFIG.training.learningRate}`);
  console.log(`- PPO epochs: ${TRAINING_CONFIG.training.ppoEpochs}`);
  console.log(`- Server URL: ${TRAINING_CONFIG.server.url}`);
  console.log('');

  // Create checkpoint directory
  if (!fs.existsSync(TRAINING_CONFIG.checkpoints.saveDir)) {
    fs.mkdirSync(TRAINING_CONFIG.checkpoints.saveDir, { recursive: true });
  }

  // Initialize network
  console.log('Building neural network...');
  const network = new CatanNet();
  network.build(
    TRAINING_CONFIG.network.hiddenSize,
    TRAINING_CONFIG.network.numLayers
  );

  // Initialize replay buffer
  const replayBuffer = new ReplayBuffer(TRAINING_CONFIG.replay.bufferSize);

  // Initialize trainer
  const trainer = new PPOTrainer(network);

  // Initialize orchestrator
  const orchestrator = new TrainingOrchestrator(network, replayBuffer);

  // Initialize logger
  const logger = new TrainingLogger();

  console.log('\n=== Starting Training ===\n');

  // Training loop
  const maxCycles = 100; // Number of training cycles
  for (let cycle = 0; cycle < maxCycles; cycle++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CYCLE ${cycle + 1}/${maxCycles}`);
    console.log('='.repeat(60));

    // Self-play phase
    console.log('\n[Phase 1] Self-Play');
    await orchestrator.runSelfPlayCycle(TRAINING_CONFIG.selfPlay.gamesPerCycle);

    const bufferStats = replayBuffer.getStats();
    console.log('\nBuffer Statistics:');
    console.log(`- Size: ${bufferStats.size}`);
    console.log(`- Avg Reward: ${bufferStats.avgReward.toFixed(4)}`);
    console.log(`- Avg Value: ${bufferStats.avgValue.toFixed(4)}`);
    console.log(`- Wins: ${bufferStats.wins}, Losses: ${bufferStats.losses}`);

    // Training phase
    if (replayBuffer.isReady()) {
      console.log('\n[Phase 2] Training Network');
      const losses = await trainer.train(replayBuffer);

      // Log metrics
      logger.log({
        cycle: cycle + 1,
        gamesPlayed: orchestrator.getGamesPlayed(),
        bufferSize: replayBuffer.size(),
        policyLoss: losses.policyLoss,
        valueLoss: losses.valueLoss,
        totalLoss: losses.totalLoss,
        entropy: losses.entropy,
        avgReward: bufferStats.avgReward,
        wins: bufferStats.wins,
        losses: bufferStats.losses,
      });

      // Clear replay buffer (for on-policy PPO)
      replayBuffer.clear();
      console.log('Replay buffer cleared (on-policy training)');

    } else {
      console.log('\n[Phase 2] Skipping training - buffer not ready');
      logger.log({
        cycle: cycle + 1,
        gamesPlayed: orchestrator.getGamesPlayed(),
        bufferSize: replayBuffer.size(),
        avgReward: bufferStats.avgReward,
        wins: bufferStats.wins,
        losses: bufferStats.losses,
      });
    }

    // Save checkpoint
    if ((cycle + 1) % TRAINING_CONFIG.checkpoints.saveFrequency === 0) {
      const checkpointPath = `${TRAINING_CONFIG.checkpoints.saveDir}/model_cycle_${cycle + 1}`;
      console.log(`\nSaving checkpoint to ${checkpointPath}...`);
      await network.save(checkpointPath);
    }

    // Small delay between cycles
    await sleep(2000);
  }

  console.log('\n=================================================');
  console.log('     Training Complete!');
  console.log('=================================================\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run training
main().catch(error => {
  console.error('Training error:', error);
  process.exit(1);
});
