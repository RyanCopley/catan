import { Experience } from '../types';
import { TRAINING_CONFIG } from '../config/training.config';

/**
 * Experience replay buffer for storing and sampling training data
 */
export class ReplayBuffer {
  private buffer: Experience[] = [];
  private maxSize: number;

  constructor(maxSize: number = TRAINING_CONFIG.replay.bufferSize) {
    this.maxSize = maxSize;
  }

  /**
   * Add experiences to buffer
   */
  add(experiences: Experience[]): void {
    this.buffer.push(...experiences);

    // Remove oldest experiences if buffer is full
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxSize);
    }
  }

  /**
   * Add single experience to buffer
   */
  addOne(experience: Experience): void {
    this.buffer.push(experience);

    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Sample random batch of experiences
   */
  sample(batchSize: number): Experience[] {
    if (this.buffer.length < batchSize) {
      return [...this.buffer];
    }

    const sampled: Experience[] = [];
    const indices = new Set<number>();

    while (indices.size < batchSize) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        sampled.push(this.buffer[idx]);
      }
    }

    return sampled;
  }

  /**
   * Get all experiences (for on-policy algorithms like PPO)
   */
  getAll(): Experience[] {
    return [...this.buffer];
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Check if buffer has minimum size for training
   */
  isReady(): boolean {
    return this.buffer.length >= TRAINING_CONFIG.replay.minBufferSize;
  }

  /**
   * Compute returns (discounted cumulative rewards) for all experiences
   * This is needed for advantage estimation in PPO
   */
  computeReturns(gamma: number = TRAINING_CONFIG.training.gamma): void {
    // Process experiences in reverse order to compute returns
    let runningReturn = 0;

    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const exp = this.buffer[i];

      if (exp.done) {
        runningReturn = exp.reward;
      } else {
        runningReturn = exp.reward + gamma * runningReturn;
      }

      // Store the return (we'll use this for advantage calculation)
      (exp as any).return = runningReturn;
    }
  }

  /**
   * Compute Generalized Advantage Estimation (GAE)
   * GAE is a variance-reduced advantage estimator used in PPO
   */
  computeAdvantages(
    gamma: number = TRAINING_CONFIG.training.gamma,
    lambda: number = 0.95
  ): void {
    let lastGae = 0;

    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const exp = this.buffer[i];
      const nextValue = i < this.buffer.length - 1 && !exp.done
        ? this.buffer[i + 1].value
        : 0;

      // TD error: δ = r + γ*V(s') - V(s)
      const delta = exp.reward + gamma * nextValue - exp.value;

      // GAE: A = δ + (γλ)*δ_next + (γλ)²*δ_next_next + ...
      lastGae = delta + gamma * lambda * lastGae * (exp.done ? 0 : 1);

      (exp as any).advantage = lastGae;
      (exp as any).return = lastGae + exp.value;
    }

    // Normalize advantages for stable training
    this.normalizeAdvantages();
  }

  /**
   * Normalize advantages to have mean 0 and std 1
   */
  private normalizeAdvantages(): void {
    const advantages = this.buffer.map(exp => (exp as any).advantage);

    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const variance = advantages.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / advantages.length;
    const std = Math.sqrt(variance) + 1e-8;

    for (const exp of this.buffer) {
      (exp as any).advantage = ((exp as any).advantage - mean) / std;
    }
  }

  /**
   * Get statistics about the buffer
   */
  getStats(): {
    size: number;
    avgReward: number;
    avgValue: number;
    wins: number;
    losses: number;
  } {
    if (this.buffer.length === 0) {
      return { size: 0, avgReward: 0, avgValue: 0, wins: 0, losses: 0 };
    }

    const rewards = this.buffer.map(exp => exp.reward);
    const values = this.buffer.map(exp => exp.value);

    const avgReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

    // Count terminal states
    const terminalExps = this.buffer.filter(exp => exp.done);
    const wins = terminalExps.filter(exp => exp.reward > 0.5).length;
    const losses = terminalExps.filter(exp => exp.reward < -0.5).length;

    return {
      size: this.buffer.length,
      avgReward,
      avgValue,
      wins,
      losses,
    };
  }
}
