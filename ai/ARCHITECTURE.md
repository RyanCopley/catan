# Catan AI Architecture Deep Dive

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRAINING SYSTEM                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Training Orchestrator (main.ts)                │   │
│  │  - Manages training cycles                                  │   │
│  │  - Coordinates self-play and learning                       │   │
│  └────────┬───────────────────────────────────┬─────────────────┘   │
│           │                                   │                     │
│           ▼                                   ▼                     │
│  ┌─────────────────┐               ┌──────────────────┐           │
│  │   Self-Play     │               │   PPO Trainer    │           │
│  │  Orchestrator   │               │                  │           │
│  │                 │               │ - Computes GAE   │           │
│  │ - Spawns bots   │──────────────▶│ - Updates network│           │
│  │ - Runs games    │  experiences  │ - Clips gradients│           │
│  │ - Collects data │               │                  │           │
│  └────────┬────────┘               └────────┬─────────┘           │
│           │                                   │                     │
│           │                                   │                     │
└───────────┼───────────────────────────────────┼─────────────────────┘
            │                                   │
            │                                   │ updates weights
            ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       NEURAL NETWORK (CatanNet)                       │
│                                                                       │
│   Input: Game State (1084 features)                                  │
│      │                                                                │
│      ├──▶ Shared Dense(256) + BN + ReLU                             │
│      ├──▶ Shared Dense(256) + BN + ReLU                             │
│      ├──▶ Shared Dense(256) + BN + ReLU                             │
│      │                                                                │
│      ├──────────────┬─────────────────────────┐                     │
│      │              │                         │                     │
│      ▼              ▼                         ▼                     │
│  Policy Head    Value Head              Action Mask                 │
│  Dense(128)     Dense(128)              (from game rules)           │
│  Dense(333)     Dense(1)                                            │
│      │              │                         │                     │
│      │              │                         │                     │
│      └──────┬───────┴─────────────────────────┘                     │
│             │                                                        │
│   Output: Action Probs (333) + Value Estimate                       │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           │ action selection
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      AI BOT INSTANCES                                 │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ AI Bot 1 │  │ AI Bot 2 │  │ AI Bot 3 │  │ AI Bot 4 │           │
│  │          │  │          │  │          │  │          │           │
│  │ - Encode │  │ - Encode │  │ - Encode │  │ - Encode │           │
│  │   state  │  │   state  │  │   state  │  │   state  │           │
│  │ - Query  │  │ - Query  │  │ - Query  │  │ - Query  │           │
│  │   network│  │   network│  │   network│  │   network│           │
│  │ - Execute│  │ - Execute│  │ - Execute│  │ - Execute│           │
│  │   action │  │   action │  │   action │  │   action │           │
│  │ - Record │  │ - Record │  │ - Record │  │ - Record │           │
│  │   exp    │  │   exp    │  │   exp    │  │   exp    │           │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘           │
│        │             │             │             │                  │
│        │   Socket.IO Events (WebSocket)          │                  │
│        │             │             │             │                  │
└────────┼─────────────┼─────────────┼─────────────┼──────────────────┘
         │             │             │             │
         └─────────────┴─────────────┴─────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    CATAN SERVER (Existing)                            │
│                                                                       │
│  Socket.IO Server (server/index.ts)                                  │
│      │                                                                │
│      ├──▶ Game Logic (server/game.ts)                               │
│      ├──▶ Building Manager                                           │
│      ├──▶ Trade Manager                                              │
│      ├──▶ Dev Card Manager                                           │
│      └──▶ Robber Manager                                             │
│                                                                       │
│  No modifications needed - bots are just clients!                    │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. State Encoding Pipeline

```
Game State (from server)
    │
    ├─▶ Board Hexes (19)
    │   ├─ Terrain type (6 one-hot)
    │   ├─ Number token (1 normalized)
    │   └─ Has robber (1 binary)
    │   = 19 × 8 = 152 features
    │
    ├─▶ Vertices (54)
    │   ├─ Settlement per player (4)
    │   ├─ City per player (4)
    │   └─ Empty (1)
    │   = 54 × 9 = 486 features
    │
    ├─▶ Edges (72)
    │   ├─ Road per player (4)
    │   └─ Empty (1)
    │   = 72 × 5 = 360 features
    │
    ├─▶ Player Resources (4 players)
    │   = 4 × 5 = 20 features
    │
    ├─▶ Development Cards (4 players)
    │   = 4 × 6 = 24 features
    │
    ├─▶ Buildings (4 players)
    │   = 4 × 3 = 12 features
    │
    ├─▶ Player Stats (4 players)
    │   = 4 × 5 = 20 features
    │
    └─▶ Game State
        = 10 features

TOTAL: 1084 features
```

### 2. Action Encoding

```
Action Index Range          Action Type
───────────────────────────────────────
0-53                       Build Settlement (Setup)
54-125                     Build Road (Setup)
126-179                    Build Settlement (Main)
180-233                    Build City
234-305                    Build Road (Main)
306                        Buy Dev Card
307                        Play Knight
308-326                    Move Robber (19 hexes)
327-330                    Steal Card (4 players)
331                        End Turn
332                        Roll Dice

TOTAL: 333 discrete actions
```

### 3. Training Data Flow

```
Self-Play Game
    │
    ├─▶ Turn 1: (s₁, a₁, r₁, s₂)
    ├─▶ Turn 2: (s₂, a₂, r₂, s₃)
    ├─▶ Turn 3: (s₃, a₃, r₃, s₄)
    ├─▶ ...
    └─▶ Turn N: (sₙ, aₙ, rₙ, s_terminal)
        │
        ▼
    Compute Returns & Advantages (GAE)
        │
        ├─▶ Return: R_t = Σ(γⁱ × r_{t+i})
        └─▶ Advantage: A_t = δ_t + (γλ)δ_{t+1} + ...
        │
        ▼
    Store in Replay Buffer
        │
        ▼
    Sample Mini-Batch (64 experiences)
        │
        ▼
    PPO Update
        │
        ├─▶ Policy Loss: -min(ratio×A, clip(ratio)×A)
        ├─▶ Value Loss: MSE(V(s), R)
        └─▶ Entropy Bonus: -Σ(p×log(p))
        │
        ▼
    Gradient Descent (Adam)
        │
        ▼
    Updated Network Weights
```

### 4. PPO Algorithm Detail

```python
for epoch in PPO_EPOCHS:
    for batch in mini_batches:
        # Forward pass
        π_new, V_new = network(states)

        # Compute ratio
        ratio = π_new(a) / π_old(a)

        # Clipped objective
        L_clip = min(ratio × A, clip(ratio, 1-ε, 1+ε) × A)

        # Value loss
        L_value = (V_new - R)²

        # Entropy bonus
        H = -Σ(π_new × log(π_new))

        # Total loss
        L = -L_clip + c₁×L_value - c₂×H

        # Update
        θ ← θ - α×∇L
```

## Component Interactions

### Bot Decision Loop

```
1. Receive game_update from server
    ├─▶ Extract GameState
    │
2. Check if my turn
    ├─▶ If not my turn: wait
    ├─▶ If my turn: continue
    │
3. Encode current state
    ├─▶ StateEncoder.encode(gameState, myIndex)
    ├─▶ Returns: Float32Array[1084]
    │
4. Create action mask
    ├─▶ ActionEncoder.createActionMask(gameState, myIndex)
    ├─▶ Returns: boolean[333]
    │
5. Query network
    ├─▶ network.sampleAction(state, mask, temperature)
    ├─▶ Returns: {actionIndex, logProb, value}
    │
6. Decode action
    ├─▶ ActionEncoder.decode(actionIndex, gameState)
    ├─▶ Returns: {type, data}
    │
7. Execute on server
    ├─▶ socket.emit(actionType, actionData)
    │
8. Record experience
    ├─▶ Store: (state, action, reward, logProb, value)
    │
9. Wait for next game_update
    └─▶ Loop back to step 1
```

### Training Cycle

```
CYCLE N:
│
├─▶ PHASE 1: Self-Play (20-50 min)
│   │
│   ├─ Create Game 1
│   │   ├─ Spawn 4 bots
│   │   ├─ Play to completion
│   │   └─ Collect ~400 experiences
│   │
│   ├─ Create Game 2
│   │   └─ ... (repeat 10 times)
│   │
│   └─ Total: ~4000 experiences collected
│
├─▶ PHASE 2: Training (2-5 min)
│   │
│   ├─ Compute GAE for all experiences
│   │   ├─ Calculate returns
│   │   └─ Estimate advantages
│   │
│   ├─ For each PPO epoch (4 epochs):
│   │   ├─ Shuffle experiences
│   │   ├─ For each mini-batch (64 samples):
│   │   │   ├─ Forward pass
│   │   │   ├─ Compute losses
│   │   │   ├─ Backprop
│   │   │   └─ Update weights
│   │
│   └─ Clear replay buffer (on-policy)
│
├─▶ PHASE 3: Checkpointing
│   │
│   └─ If N % 10 == 0:
│       └─ Save model to disk
│
└─▶ Repeat for next cycle
```

## Key Design Decisions

### Why Actor-Critic?
- **Policy Head**: Learns which actions are good
- **Value Head**: Learns how good states are
- **Together**: More stable than pure policy gradient
- **Shared Features**: Efficiency + better representations

### Why PPO?
- **Stable**: Clipping prevents destructive updates
- **On-Policy**: Uses fresh data from current policy
- **Sample Efficient**: Multiple epochs per batch
- **No target network**: Simpler than DQN/A3C

### Why Action Masking?
- **Invalid Actions**: Some moves always illegal (occupied vertex)
- **Without Masking**: Network wastes capacity learning "don't do this"
- **With Masking**: Set invalid actions to -∞ before softmax
- **Result**: Network only considers legal moves

### Why GAE?
- **Bias-Variance Tradeoff**: Pure returns have high variance
- **TD Bootstrap**: Value estimates reduce variance
- **Lambda Parameter**: Balances bias vs variance
- **Result**: More stable advantage estimates

### Why Self-Play?
- **No Human Data**: Don't have expert game logs
- **Curriculum**: Opponents improve as agent improves
- **Unlimited Games**: Can generate infinite training data
- **Exploration**: Multiple policies explore strategy space

## Scalability

### Current Performance
- **Games/hour**: ~2-3 (CPU, sequential)
- **Training speed**: ~5 min per cycle
- **Memory**: ~2GB per process

### Optimization Options

1. **Parallel Self-Play**
```
Process 1: Games 1-3
Process 2: Games 4-6    }  Parallel
Process 3: Games 7-9
Process 4: Game 10

All write to shared replay buffer
```

2. **GPU Acceleration**
```
CPU: Self-play (game logic)
GPU: Training (backprop)
    ├─▶ 5-10x faster
    └─▶ Larger batches
```

3. **Distributed Training**
```
Workers: Self-play games
Master: Aggregate experiences + train
    ├─▶ Horizontal scaling
    └─▶ 100+ games/hour
```

## Future Architecture Improvements

### 1. Hierarchical Actions
```
Level 1: Action Type (build, trade, end turn)
    │
    ├─▶ If Build:
    │   Level 2: Building Type (settlement, city, road)
    │       │
    │       └─▶ If Settlement:
    │           Level 3: Which Vertex? (54 options)
```
**Benefit**: Smaller action spaces per level, easier to learn

### 2. Attention Mechanisms
```
Input: Board State
    │
    ├─▶ Hex Embeddings
    │   └─▶ Self-Attention (hex-hex relationships)
    │
    ├─▶ Player Embeddings
    │   └─▶ Cross-Attention (player-hex relationships)
    │
    └─▶ Combined Representation
```
**Benefit**: Better spatial reasoning

### 3. Opponent Modeling
```
For each opponent:
    ├─▶ Predict resources (classification)
    ├─▶ Predict next action (policy)
    └─▶ Predict strategy (embedding)
```
**Benefit**: Counter-strategies, better trading

### 4. Recurrent State
```
LSTM/GRU to track:
    ├─▶ Recent dice rolls
    ├─▶ Opponent action patterns
    └─▶ Game trajectory
```
**Benefit**: Temporal reasoning, adaptation

## Conclusion

This architecture provides:
- ✅ **Complete Training Pipeline**: Self-play → data → training → evaluation
- ✅ **Scalable Design**: Easy to parallelize and optimize
- ✅ **Modular Components**: Each piece can be improved independently
- ✅ **No Server Changes**: Pure client-side AI
- ✅ **Extensible**: Easy to add features (trading, dev cards, etc.)

Ready for experimentation and iteration!
