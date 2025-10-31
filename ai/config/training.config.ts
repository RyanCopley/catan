export const TRAINING_CONFIG = {
  // Network architecture
  network: {
    stateSize: 512, // Will be calculated by encoder
    actionSize: 500, // Approximate action space size
    hiddenSize: 256,
    numLayers: 3,
  },

  // Training hyperparameters
  training: {
    learningRate: 3e-4,
    batchSize: 64,
    gamma: 0.99, // Discount factor
    ppoEpsilon: 0.2, // PPO clipping
    ppoEpochs: 4, // PPO epochs per batch
    entropyCoef: 0.01, // Exploration bonus
    valueCoef: 0.5, // Value loss coefficient
    maxGradNorm: 0.5, // Gradient clipping
  },

  // Self-play configuration
  selfPlay: {
    gamesPerCycle: 10, // Start small for MVP
    botsPerGame: 4,
    maxGameLength: 500, // Max turns before game is terminated
  },

  // Replay buffer
  replay: {
    bufferSize: 50000,
    minBufferSize: 1000, // Minimum before training starts
  },

  // Server connection
  server: {
    url: 'http://localhost:3000',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  },

  // Checkpointing
  checkpoints: {
    saveDir: './ai/checkpoints',
    saveFrequency: 10, // Save every N training cycles
  },

  // Reward shaping
  rewards: {
    win: 1.0,
    loss: -1.0,
    victoryPoint: 0.1,
    settlement: 0.05,
    city: 0.08,
    longestRoad: 0.15,
    largestArmy: 0.15,
    resourceGained: 0.001,
    invalidAction: -0.01, // Penalty for invalid actions
  },
};

export type TrainingConfig = typeof TRAINING_CONFIG;
