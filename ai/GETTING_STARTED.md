# Getting Started with Catan AI Training

## Quick Start

### 1. Prerequisites

- Node.js 16+ installed
- Catan server running on `http://localhost:3000`
- At least 8GB RAM (for neural network training)

### 2. Installation

```bash
cd ai
npm install
npm run build
```

### 3. Start the Catan Server

In a separate terminal:

```bash
cd /var/home/bazzite/Desktop/catan
npm start
```

Ensure the server is running and accessible at http://localhost:3000

### 4. Run Training

```bash
npm run train
```

This will:
1. Initialize a neural network
2. Spawn 4 AI bots per game
3. Play self-play games
4. Collect experiences
5. Train the network using PPO
6. Save checkpoints every 10 cycles

### 5. Monitor Progress

Training logs are saved to `logs/training_*.json`

You'll see output like:
```
=== Starting Self-Play Game 1 ===
Game created: abc123
Player 1 joined
Player 2 joined
Player 3 joined
Game started
...
Game finished. Collected 450 experiences

Buffer Statistics:
- Size: 1800
- Avg Reward: 0.0234
- Wins: 1, Losses: 3

=== Training Step ===
Policy Loss: 0.7234
Value Loss: 0.3421
Entropy: 2.4521
```

### 6. Checkpoints

Models are saved to `checkpoints/` every 10 training cycles:
- `checkpoints/model_cycle_10/`
- `checkpoints/model_cycle_20/`
- etc.

## Configuration

Edit `config/training.config.ts` to customize:

### Network Architecture
```typescript
network: {
  hiddenSize: 256,  // Neurons per layer
  numLayers: 3,     // Depth of network
}
```

### Training
```typescript
training: {
  learningRate: 3e-4,
  batchSize: 64,
  ppoEpochs: 4,
}
```

### Self-Play
```typescript
selfPlay: {
  gamesPerCycle: 10,  // Games before training
  botsPerGame: 4,
}
```

## Troubleshooting

### Server Connection Issues

**Problem**: Bots can't connect to server

**Solution**:
- Verify server is running: `curl http://localhost:3000`
- Check server URL in `config/training.config.ts`
- Ensure no firewall blocking port 3000

### Training Not Starting

**Problem**: "Replay buffer not ready for training"

**Solution**:
- This is normal for first few games
- Need at least 1000 experiences (configured in `replay.minBufferSize`)
- Just let more games complete

### Games Timeout

**Problem**: Games never finish

**Solution**:
- Check server logs for errors
- Verify game logic is working (play manual game first)
- Increase `maxGameLength` in orchestrator

### Out of Memory

**Problem**: Node heap out of memory

**Solution**:
- Reduce batch size in config
- Reduce network size (hiddenSize)
- Run with: `node --max-old-space-size=8192 dist/main.js`

### TensorFlow Warnings

**Problem**: Seeing TF warnings about oneDNN

**Solution**:
- These are informational only
- To disable: `export TF_ENABLE_ONEDNN_OPTS=0`
- Does not affect training

## What to Expect

### Initial Training (Cycles 1-10)
- Bots play randomly
- High loss values
- Win rate ~25% (random)

### Early Training (Cycles 10-50)
- Bots learn basic actions
- Prefer building over passing
- Win rate still ~25%

### Mid Training (Cycles 50-200)
- Bots learn simple strategies
- Prefer settlements over roads
- Win rate starts varying

### Advanced Training (Cycles 200+)
- Complex strategies emerge
- Resource management improves
- Position evaluation improves

**Note**: Catan is complex! Training to human-level may take 1000+ cycles (10,000+ games).

## Testing a Trained Model

Create a test script:

```typescript
import { CatanNet } from './models/catanNet';
import { AIPlayer } from './bot/aiPlayer';

async function playGame() {
  // Load trained model
  const network = new CatanNet();
  await network.load('./checkpoints/model_cycle_100');

  // Create bot
  const bot = new AIPlayer(network, 'TrainedBot');
  bot.setTemperature(0.1); // Deterministic play

  // Create game and wait for other players
  const gameId = await bot.createGame();
  console.log(`Join game: ${gameId}`);

  // Wait for players, then start
  // ... bot.startGame() ...
}
```

## Performance Optimization

### CPU Training
- Use all available cores
- Set `TF_NUM_INTEROP_THREADS` and `TF_NUM_INTRAOP_THREADS`

### GPU Training (if available)
1. Install CUDA and cuDNN
2. Install `@tensorflow/tfjs-node-gpu` instead of `@tensorflow/tfjs-node`
3. Much faster training

### Parallel Games
- Can run multiple training processes
- Each connects to same server
- Share model checkpoints

## Next Steps

1. **Start Training**: Let it run for 50+ cycles
2. **Monitor Metrics**: Check logs for improvements
3. **Tune Rewards**: Adjust reward shaping if needed
4. **Expand Actions**: Add trading, more dev cards
5. **Improve State**: Better encoding of game state

## Support

- Check `README.md` for architecture details
- Review `CLAUDE.md` in parent directory for server details
- File issues if you find bugs

Happy training! May your bots learn to conquer Catan!
