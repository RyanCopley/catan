import * as tf from '@tensorflow/tfjs-node';
import { StateEncoder } from '../encoding/stateEncoder';
import { ActionEncoder } from '../encoding/actionEncoder';

/**
 * Neural network for Catan AI
 * Uses actor-critic architecture with policy and value heads
 */
export class CatanNet {
  private model: tf.LayersModel | null = null;
  private stateSize: number;
  private actionSize: number;

  constructor() {
    this.stateSize = StateEncoder.getStateSize();
    this.actionSize = ActionEncoder.getActionSize();
  }

  /**
   * Build the neural network architecture
   */
  build(hiddenSize: number = 256, numLayers: number = 3): void {
    // Input layer
    const input = tf.input({ shape: [this.stateSize] });

    // Shared layers (feature extraction)
    let x: tf.SymbolicTensor = input;

    for (let i = 0; i < numLayers; i++) {
      x = tf.layers.dense({
        units: hiddenSize,
        activation: 'relu',
        kernelInitializer: 'heNormal',
        name: `shared_dense_${i}`,
      }).apply(x) as tf.SymbolicTensor;

      // Batch normalization removed - causes NaN with untrained weights
      // Can be added back during actual training
    }

    // Policy head (actor)
    let policyX = tf.layers.dense({
      units: hiddenSize / 2,
      activation: 'relu',
      kernelInitializer: 'heNormal',
      name: 'policy_dense',
    }).apply(x) as tf.SymbolicTensor;

    const policyOutput = tf.layers.dense({
      units: this.actionSize,
      activation: 'linear', // Will apply softmax with masking later
      kernelInitializer: 'glorotUniform',
      name: 'policy_output',
    }).apply(policyX) as tf.SymbolicTensor;

    // Value head (critic)
    let valueX = tf.layers.dense({
      units: hiddenSize / 2,
      activation: 'relu',
      kernelInitializer: 'heNormal',
      name: 'value_dense',
    }).apply(x) as tf.SymbolicTensor;

    const valueOutput = tf.layers.dense({
      units: 1,
      activation: 'tanh', // Output in [-1, 1] range
      kernelInitializer: 'glorotUniform',
      name: 'value_output',
    }).apply(valueX) as tf.SymbolicTensor;

    // Create model with two outputs
    this.model = tf.model({
      inputs: input,
      outputs: [policyOutput, valueOutput],
      name: 'catan_net',
    });

    console.log('Network built successfully');
    console.log(`State size: ${this.stateSize}`);
    console.log(`Action size: ${this.actionSize}`);
    this.model.summary();
  }

  /**
   * Forward pass through the network
   * Returns policy logits and value estimate
   */
  predict(state: Float32Array): { policyLogits: Float32Array; value: number } {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([Array.from(state)]);
      const outputs = this.model!.predict(stateTensor) as tf.Tensor | tf.Tensor[];

      // Handle both single tensor and array of tensors
      let policyTensor: tf.Tensor;
      let valueTensor: tf.Tensor;

      if (Array.isArray(outputs)) {
        [policyTensor, valueTensor] = outputs;
      } else {
        // If single output (shouldn't happen with our model), throw error
        throw new Error('Expected two outputs from model');
      }

      const policyLogits = policyTensor.dataSync() as Float32Array;
      const value = valueTensor.dataSync()[0];

      return { policyLogits, value };
    });
  }

  /**
   * Sample action from policy with action masking
   */
  sampleAction(
    state: Float32Array,
    actionMask: boolean[],
    temperature: number = 1.0
  ): { actionIndex: number; logProb: number; value: number } {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }

    return tf.tidy(() => {
      const { policyLogits, value } = this.predict(state);

      // Apply action mask and temperature scaling
      // First, apply mask by setting invalid to very negative value
      const maskedLogits = Array.from(policyLogits).map((logit, i) =>
        actionMask[i] ? logit / temperature : -100
      );

      // Manually compute softmax to avoid NaN issues
      const validLogits = maskedLogits.filter((_, i) => actionMask[i]);
      console.log(`[Debug] Valid logits count: ${validLogits.length}, first few: ${validLogits.slice(0, 5)}`);
      const maxLogit = Math.max(...validLogits);
      console.log(`[Debug] Max logit: ${maxLogit}`);
      const expLogits = maskedLogits.map(l => Math.exp(l - maxLogit));
      const sumExp = expLogits.reduce((a, b) => a + b, 0);
      console.log(`[Debug] Sum of exp: ${sumExp}`);
      const probsArray = expLogits.map(e => e / sumExp);

      // Debug: Check if probabilities are valid
      const validMask = actionMask.filter(m => m).length;
      const probSum = probsArray.reduce((a, b) => a + b, 0);
      console.log(`[SampleAction] Valid actions: ${validMask}, Prob sum: ${probSum.toFixed(4)}, Has NaN: ${probsArray.some(isNaN)}`);

      // Sample from categorical distribution
      const actionIndex = this.categoricalSample(probsArray);
      console.log(`[SampleAction] Sampled action index: ${actionIndex}, Is valid: ${actionMask[actionIndex]}, Prob: ${probsArray[actionIndex]?.toFixed(6)}`);

      // Compute log probability
      const logProb = Math.log(probsArray[actionIndex] + 1e-10);

      return { actionIndex, logProb, value };
    });
  }

  /**
   * Get best action (greedy) with action masking
   */
  getBestAction(state: Float32Array, actionMask: boolean[]): { actionIndex: number; value: number } {
    const { policyLogits, value } = this.predict(state);

    // Apply action mask
    const maskedLogits = policyLogits.map((logit, i) =>
      actionMask[i] ? logit : -Infinity
    );

    // Get argmax
    const actionIndex = maskedLogits.indexOf(Math.max(...maskedLogits));

    return { actionIndex, value };
  }

  /**
   * Sample from categorical distribution
   */
  private categoricalSample(probs: number[]): number {
    const rand = Math.random();
    let cumsum = 0;

    for (let i = 0; i < probs.length; i++) {
      cumsum += probs[i];
      if (rand < cumsum) {
        return i;
      }
    }

    // Fallback (shouldn't happen)
    return probs.length - 1;
  }

  /**
   * Save model to disk
   */
  async save(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }

    await this.model.save(`file://${path}`);
    console.log(`Model saved to ${path}`);
  }

  /**
   * Load model from disk
   */
  async load(path: string): Promise<void> {
    this.model = await tf.loadLayersModel(`file://${path}/model.json`);
    console.log(`Model loaded from ${path}`);
  }

  /**
   * Get the underlying TensorFlow model
   */
  getModel(): tf.LayersModel {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }
    return this.model;
  }

  /**
   * Clone the model (for target network in training)
   */
  async clone(): Promise<CatanNet> {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }

    const cloned = new CatanNet();
    const modelJson = this.model.toJSON(null, false);
    cloned.model = await tf.models.modelFromJSON(modelJson as any) as tf.LayersModel;
    cloned.model.setWeights(this.model.getWeights());

    return cloned;
  }

  /**
   * Get trainable weights
   */
  getWeights(): tf.Tensor[] {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }
    return this.model.getWeights();
  }

  /**
   * Set trainable weights
   */
  setWeights(weights: tf.Tensor[]): void {
    if (!this.model) {
      throw new Error('Model not built. Call build() first.');
    }
    this.model.setWeights(weights);
  }
}
