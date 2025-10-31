#!/usr/bin/env ts-node
import { AIPlayer } from './bot/aiPlayer';
import { CatanNet } from './models/catanNet';
import { TRAINING_CONFIG } from './config/training.config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Standalone script to run a trained AI bot in a real game
 *
 * Usage:
 *   npm run play <gameId> <password> [modelPath] [botName]
 *
 * Examples:
 *   npm run play abc123 mypassword
 *   npm run play abc123 mypassword ./checkpoints/model_cycle_100 "SmartBot"
 */

interface Args {
  gameId: string;
  password: string;
  modelPath?: string;
  botName?: string;
  serverUrl?: string;
  temperature?: number;
}

async function main() {
  // Parse command line arguments
  const args = parseArgs();

  console.log('=================================================');
  console.log('     Catan AI Bot - Play Mode');
  console.log('=================================================\n');
  console.log(`Game ID: ${args.gameId}`);
  console.log(`Bot Name: ${args.botName}`);
  console.log(`Server: ${args.serverUrl}`);
  console.log(`Model: ${args.modelPath || 'Untrained (random policy)'}`);
  console.log(`Temperature: ${args.temperature}`);
  console.log('');

  // Initialize network
  console.log('Initializing neural network...');
  const network = new CatanNet();
  network.build(
    TRAINING_CONFIG.network.hiddenSize,
    TRAINING_CONFIG.network.numLayers
  );

  // Load model if path provided
  if (args.modelPath) {
    if (!fs.existsSync(args.modelPath)) {
      console.error(`Error: Model path does not exist: ${args.modelPath}`);
      console.log('\nAvailable models:');
      listAvailableModels();
      process.exit(1);
    }

    console.log(`Loading model from ${args.modelPath}...`);
    try {
      await network.load(args.modelPath);
      console.log('✓ Model loaded successfully\n');
    } catch (error) {
      console.error('Failed to load model:', error);
      process.exit(1);
    }
  } else {
    console.log('⚠ No model specified - using untrained network (random play)\n');
  }

  // Create AI player
  const bot = new AIPlayer(network, args.botName, args.serverUrl);
  bot.setTemperature(args.temperature!);

  console.log('Connecting to server...');
  await bot.waitForConnection();
  console.log('✓ Connected\n');

  // Join the game
  console.log(`Joining game ${args.gameId}...`);
  try {
    await bot.joinGame(args.gameId, args.password);
    console.log('✓ Successfully joined game\n');
  } catch (error) {
    console.error('Failed to join game:', error);
    bot.disconnect();
    process.exit(1);
  }

  console.log('Bot is now active and playing!');
  console.log('Press Ctrl+C to disconnect\n');

  // Wait for game to end
  await waitForGameEnd(bot);

  // Disconnect
  console.log('\nGame ended. Disconnecting...');
  bot.disconnect();

  console.log('Done!');
  process.exit(0);
}

/**
 * Parse command line arguments
 */
function parseArgs(): Args {
  const argv = process.argv.slice(2);

  if (argv.length < 2) {
    console.error('Usage: npm run play <gameId> <password> [modelPath] [botName]');
    console.error('\nExamples:');
    console.error('  npm run play abc123 mypassword');
    console.error('  npm run play abc123 mypassword ./checkpoints/model_cycle_100');
    console.error('  npm run play abc123 mypassword ./checkpoints/best_model "MasterBot"');
    console.error('\nAvailable models:');
    listAvailableModels();
    process.exit(1);
  }

  return {
    gameId: argv[0],
    password: argv[1],
    modelPath: argv[2],
    botName: argv[3] || 'AI_Bot',
    serverUrl: process.env.SERVER_URL || TRAINING_CONFIG.server.url,
    temperature: parseFloat(process.env.TEMPERATURE || '0.5'), // Lower temp = more deterministic
  };
}

/**
 * List available trained models
 */
function listAvailableModels() {
  const checkpointsDir = TRAINING_CONFIG.checkpoints.saveDir;

  if (!fs.existsSync(checkpointsDir)) {
    console.log('  (No checkpoints directory found)');
    return;
  }

  const files = fs.readdirSync(checkpointsDir);
  const modelDirs = files.filter(f => {
    const fullPath = path.join(checkpointsDir, f);
    return fs.statSync(fullPath).isDirectory();
  });

  if (modelDirs.length === 0) {
    console.log('  (No saved models found)');
    return;
  }

  modelDirs
    .sort()
    .forEach(dir => {
      console.log(`  - ${path.join(checkpointsDir, dir)}`);
    });
}

/**
 * Wait for game to end by polling
 */
async function waitForGameEnd(bot: AIPlayer): Promise<void> {
  return new Promise((resolve) => {
    // Check experiences periodically for terminal state
    const checkInterval = setInterval(() => {
      const experiences = bot.getExperiences();
      const hasTerminal = experiences.some(exp => exp.done);

      // Put experiences back (hackish but works for checking)
      if (hasTerminal) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 2000);

    // Also handle process termination
    process.on('SIGINT', () => {
      console.log('\n\nReceived interrupt signal...');
      clearInterval(checkInterval);
      resolve();
    });
  });
}

// Run the script
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
