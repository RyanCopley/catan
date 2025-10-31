#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { TRAINING_CONFIG } from './config/training.config';

/**
 * Find the best trained model based on training logs
 *
 * Usage: npm run find-best-model
 */

interface ModelInfo {
  path: string;
  cycle: number;
  exists: boolean;
}

function main() {
  console.log('=================================================');
  console.log('     Finding Best Model');
  console.log('=================================================\n');

  const checkpointsDir = TRAINING_CONFIG.checkpoints.saveDir;

  if (!fs.existsSync(checkpointsDir)) {
    console.log('❌ No checkpoints directory found');
    console.log(`   Expected: ${checkpointsDir}`);
    process.exit(1);
  }

  // List all model directories
  const files = fs.readdirSync(checkpointsDir);
  const modelDirs = files
    .filter(f => {
      const fullPath = path.join(checkpointsDir, f);
      return fs.statSync(fullPath).isDirectory();
    })
    .filter(f => f.startsWith('model_cycle_'));

  if (modelDirs.length === 0) {
    console.log('❌ No trained models found');
    console.log(`   Train a model first with: npm run train`);
    process.exit(1);
  }

  // Extract cycle numbers and sort
  const models: ModelInfo[] = modelDirs
    .map(dir => {
      const match = dir.match(/model_cycle_(\d+)/);
      const cycle = match ? parseInt(match[1]) : 0;
      return {
        path: path.join(checkpointsDir, dir),
        cycle,
        exists: true,
      };
    })
    .sort((a, b) => b.cycle - a.cycle);

  console.log(`Found ${models.length} trained models:\n`);

  models.forEach((model, idx) => {
    const size = getDirectorySize(model.path);
    console.log(`${idx + 1}. Cycle ${model.cycle.toString().padEnd(6)} (${size})`);
    console.log(`   ${model.path}`);
  });

  console.log('\n=================================================');
  console.log('Recommendation:');
  console.log('=================================================\n');

  // Most recent model is usually best for RL
  const latest = models[0];
  console.log(`✨ Latest Model (recommended): Cycle ${latest.cycle}`);
  console.log(`   ${latest.path}\n`);

  console.log('To use this model in a game:\n');
  console.log(`   npm run play <gameId> <password> ${latest.path}\n`);
  console.log('Example:\n');
  console.log(`   npm run play abc123 mypass ${latest.path} "SmartBot"\n`);

  // Check if there's a training log
  const logPath = path.join(process.cwd(), 'training_log.json');
  if (fs.existsSync(logPath)) {
    console.log('📊 Training logs found. Analyzing performance...\n');
    analyzeTrainingLogs(logPath, models);
  }
}

/**
 * Get human-readable directory size
 */
function getDirectorySize(dirPath: string): string {
  let totalSize = 0;

  function getSize(p: string) {
    const stats = fs.statSync(p);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(p);
      files.forEach(file => getSize(path.join(p, file)));
    } else {
      totalSize += stats.size;
    }
  }

  getSize(dirPath);

  // Convert to human readable
  if (totalSize < 1024) return `${totalSize} B`;
  if (totalSize < 1024 * 1024) return `${(totalSize / 1024).toFixed(1)} KB`;
  return `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Analyze training logs to find best performing model
 */
function analyzeTrainingLogs(logPath: string, models: ModelInfo[]) {
  try {
    const logContent = fs.readFileSync(logPath, 'utf-8');
    const logs = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    // Find model with best win rate
    const modelPerf = logs
      .filter(log => log.wins !== undefined)
      .map(log => ({
        cycle: log.cycle,
        winRate: log.wins / (log.wins + log.losses || 1),
        wins: log.wins,
        losses: log.losses,
        avgReward: log.avgReward,
      }))
      .sort((a, b) => b.winRate - a.winRate);

    if (modelPerf.length > 0) {
      const best = modelPerf[0];
      console.log(`📈 Best Win Rate: Cycle ${best.cycle}`);
      console.log(`   Win Rate: ${(best.winRate * 100).toFixed(1)}% (${best.wins}W / ${best.losses}L)`);
      console.log(`   Avg Reward: ${best.avgReward.toFixed(3)}\n`);

      const bestModel = models.find(m => m.cycle === best.cycle);
      if (bestModel) {
        console.log(`To use this model:\n`);
        console.log(`   npm run play <gameId> <password> ${bestModel.path}\n`);
      }
    }

    // Show recent performance
    const recent = logs.slice(-5);
    if (recent.length > 0) {
      console.log('📊 Recent Performance (last 5 cycles):');
      recent.forEach(log => {
        const wr = log.wins / (log.wins + log.losses || 1);
        console.log(`   Cycle ${log.cycle}: WR ${(wr * 100).toFixed(1)}%, Reward ${log.avgReward?.toFixed(3) || 'N/A'}`);
      });
      console.log('');
    }

  } catch (error) {
    console.log('⚠ Could not analyze training logs:', (error as Error).message);
  }
}

main();
