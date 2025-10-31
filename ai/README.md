# Catan AI - Neural Network Player

A neural network-based AI player for Settlers of Catan that uses Proximal Policy Optimization (PPO) and self-play training.

## Architecture

```
┌─────────────────────────────────────────────┐
│         Training Orchestrator               │
│  - Manages self-play games                  │
│  - Collects training experiences            │
└─────────────┬───────────────────────────────┘
              │
              ├────> AI Bot 1 ──┐
              ├────> AI Bot 2 ──┤
              ├────> AI Bot 3 ──┼──> Catan Server (Socket.IO)
              └────> AI Bot 4 ──┘
                      │
                      ▼
              ┌──────────────────┐
              │  Neural Network  │
              │  - Policy Head   │
              │  - Value Head    │
              └──────────────────┘
                      │
                      ▼
              ┌──────────────────┐
              │  PPO Trainer     │
              │  - Experience    │
              │    Replay        │
              │  - Gradient      │
              │    Updates       │
              └──────────────────┘
```

## Components

### 1. State Encoding (`encoding/stateEncoder.ts`)
- Converts game state to fixed-size feature vector
- Encodes: board hexes, vertices, edges, player resources, buildings, game phase
- Output: ~2000-dimensional state vector

### 2. Action Encoding (`encoding/actionEncoder.ts`)
- Maps neural network outputs to game actions
- Action space: ~333 discrete actions
- Includes action masking for invalid moves

### 3. Neural Network (`models/catanNet.ts`)
- Actor-Critic architecture
- Policy head: outputs action probabilities
- Value head: estimates win probability
- Uses batch normalization and ReLU activation

### 4. AI Bot (`bot/aiPlayer.ts`)
- Connects to server via Socket.IO
- Observes game state and selects actions
- Collects experience tuples for training

### 5. Training (`training/`)
- **Replay Buffer**: Stores experiences with GAE
- **PPO Trainer**: Implements PPO algorithm
- **Orchestrator**: Manages self-play games

## Setup

1. Install dependencies:
```bash
cd ai
npm install
```

2. Ensure Catan server is running:
```bash
cd ..
npm start
```

3. Run training:
```bash
npm run train
```

## Configuration

Edit `config/training.config.ts` to adjust:

- **Network size**: `hiddenSize`, `numLayers`
- **Learning rate**: `learningRate`
- **Self-play**: `gamesPerCycle`, `botsPerGame`
- **PPO parameters**: `ppoEpsilon`, `entropyCoef`
- **Rewards**: Win/loss rewards, building rewards

## Training Process

1. **Self-Play**: 4 bots play against each other
2. **Data Collection**: Store (state, action, reward, next_state) tuples
3. **Advantage Estimation**: Compute GAE for each experience
4. **Training**: Update network using PPO
5. **Repeat**: Continue for many cycles

## Monitoring

Training metrics are logged to `logs/training_*.json`:
- Policy loss
- Value loss
- Entropy (exploration)
- Average reward
- Win/loss counts

Model checkpoints are saved to `checkpoints/` every N cycles.

## Action Space (Simplified for MVP)

- **Setup Phase**:
  - Build settlement (54 vertices)
  - Build road (72 edges)

- **Main Phase**:
  - Roll dice
  - Build settlement
  - Build city (upgrade settlement)
  - Build road
  - Buy development card
  - Play knight
  - Move robber (19 hexes)
  - Steal from player (4 players)
  - End turn

**Note**: Trading is not included in MVP but can be added later.

## State Features

- **Board**: Terrain types, number tokens, robber position
- **Vertices**: Settlements/cities per player
- **Edges**: Roads per player
- **Resources**: Your hand (visible), opponents (total only)
- **Development Cards**: Counts per player
- **Game State**: Phase, turn number, current player

## Hyperparameters

Default values (tuned for MVP):
- Learning rate: 3e-4
- Batch size: 64
- Discount factor (γ): 0.99
- PPO clip (ε): 0.2
- Entropy coefficient: 0.01
- Hidden size: 256 neurons
- Network depth: 3 layers

## Future Enhancements

1. **Trading**: Add player-to-player and bank trading
2. **More Dev Cards**: Road building, Year of Plenty, Monopoly
3. **Better State Encoding**: CNN for board, attention mechanisms
4. **Curriculum Learning**: Start with simpler scenarios
5. **Multi-Agent Learning**: Different exploration strategies
6. **Transfer Learning**: Pre-train on specific scenarios
7. **Opponent Modeling**: Predict opponent resources/strategy

## Troubleshooting

**Issue**: Bots aren't taking actions
- Check server is running and accessible
- Verify socket connection in bot logs
- Check action masking isn't blocking all actions

**Issue**: Training loss not decreasing
- Reduce learning rate
- Increase batch size
- Check reward shaping is appropriate
- Ensure experiences are diverse

**Issue**: Games timeout
- Increase `maxGameLength` in config
- Check for infinite loops in game logic
- Verify bots are ending turns

## Performance Tips

- Run on GPU for faster training (requires TensorFlow GPU setup)
- Increase `gamesPerCycle` for more data per training step
- Use larger networks for better performance (requires more data)
- Tune reward shaping based on desired behavior

## Testing a Trained Model

To play against a trained model:

```typescript
import { CatanNet } from './models/catanNet';
import { AIPlayer } from './bot/aiPlayer';

const network = new CatanNet();
await network.load('./checkpoints/model_cycle_100');

const bot = new AIPlayer(network, 'Trained_Bot');
bot.setTemperature(0.1); // Low temperature = more deterministic

await bot.createGame();
// ... other players join ...
bot.startGame();
```

## License

Same as parent Catan project.
