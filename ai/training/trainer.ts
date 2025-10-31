import * as tf from '@tensorflow/tfjs-node';
import { CatanNet } from '../models/catanNet';
import { ReplayBuffer } from './replayBuffer';
import { TRAINING_CONFIG } from '../config/training.config';
import { Experience } from '../types';

/**
 * PPO (Proximal Policy Optimization) trainer
 */
export class PPOTrainer {
  private network: CatanNet;
  private optimizer: tf.Optimizer;
  private trainSteps: number = 0;

  constructor(network: CatanNet) {
    this.network = network;
    this.optimizer = tf.train.adam(TRAINING_CONFIG.training.learningRate);
  }

  /**
   * Train the network using PPO algorithm
   */
  async train(replayBuffer: ReplayBuffer): Promise<{
    policyLoss: number;
    valueLoss: number;
    totalLoss: number;
    entropy: number;
  }> {
    if (!replayBuffer.isReady()) {
      console.log('Replay buffer not ready for training');
      return { policyLoss: 0, valueLoss: 0, totalLoss: 0, entropy: 0 };
    }

    console.log('\n=== Training Step ===');

    // Compute advantages using GAE
    replayBuffer.computeAdvantages();

    const experiences = replayBuffer.getAll();
    const batchSize = TRAINING_CONFIG.training.batchSize;
    const numBatches = Math.ceil(experiences.length / batchSize);

    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let totalEntropy = 0;

    // PPO epochs (multiple passes over the data)
    for (let epoch = 0; epoch < TRAINING_CONFIG.training.ppoEpochs; epoch++) {
      // Shuffle experiences
      const shuffled = this.shuffle([...experiences]);

      // Train on batches
      for (let i = 0; i < numBatches; i++) {
        const batch = shuffled.slice(i * batchSize, (i + 1) * batchSize);

        const losses = await this.trainBatch(batch);
        totalPolicyLoss += losses.policyLoss;
        totalValueLoss += losses.valueLoss;
        totalEntropy += losses.entropy;
      }
    }

    const numUpdates = TRAINING_CONFIG.training.ppoEpochs * numBatches;
    const avgPolicyLoss = totalPolicyLoss / numUpdates;
    const avgValueLoss = totalValueLoss / numUpdates;
    const avgEntropy = totalEntropy / numUpdates;
    const totalLoss = avgPolicyLoss + avgValueLoss;

    this.trainSteps++;

    console.log(`Policy Loss: ${avgPolicyLoss.toFixed(4)}`);
    console.log(`Value Loss: ${avgValueLoss.toFixed(4)}`);
    console.log(`Entropy: ${avgEntropy.toFixed(4)}`);
    console.log(`Total Loss: ${totalLoss.toFixed(4)}`);

    return {
      policyLoss: avgPolicyLoss,
      valueLoss: avgValueLoss,
      totalLoss,
      entropy: avgEntropy,
    };
  }

  /**
   * Train on a single batch
   */
  private async trainBatch(batch: Experience[]): Promise<{
    policyLoss: number;
    valueLoss: number;
    entropy: number;
  }> {
    return tf.tidy(() => {
      // Prepare batch data
      const states = tf.tensor2d(batch.map(exp => Array.from(exp.state)));
      const actions = tf.tensor1d(batch.map(exp => exp.action), 'int32');
      const oldLogProbs = tf.tensor1d(batch.map(exp => exp.logProb));
      const advantages = tf.tensor1d(batch.map(exp => (exp as any).advantage));
      const returns = tf.tensor1d(batch.map(exp => (exp as any).return));

      // Compute gradients and update - loss must be computed inside the gradient function
      const grads = tf.variableGrads(() => {
        // Forward pass
        const [policyLogits, values] = this.network.getModel().predict(states) as tf.Tensor[];

        // Compute policy loss (PPO clipped objective)
        const { loss: policyLoss, entropy } = this.computePolicyLoss(
          policyLogits,
          actions,
          oldLogProbs,
          advantages,
          batch
        );

        // Compute value loss
        const valueLoss = this.computeValueLoss(values, returns);

        // Combined loss
        const totalLoss = tf.add(
          policyLoss,
          tf.mul(valueLoss, TRAINING_CONFIG.training.valueCoef)
        ) as tf.Scalar;

        return totalLoss;
      });

      // Clip gradients
      const clippedGrads = this.clipGradients(
        grads.grads,
        TRAINING_CONFIG.training.maxGradNorm
      );

      // Apply gradients
      this.optimizer.applyGradients(clippedGrads);

      // Get loss values for logging - recompute without gradients
      const [policyLogits, values] = this.network.getModel().predict(states) as tf.Tensor[];
      const { loss: policyLoss, entropy } = this.computePolicyLoss(
        policyLogits,
        actions,
        oldLogProbs,
        advantages,
        batch
      );
      const valueLoss = this.computeValueLoss(values, returns);

      // Extract scalar values
      const policyLossVal = policyLoss.dataSync()[0];
      const valueLossVal = valueLoss.dataSync()[0];
      const entropyVal = entropy.dataSync()[0];

      return {
        policyLoss: policyLossVal,
        valueLoss: valueLossVal,
        entropy: entropyVal,
      };
    });
  }

  /**
   * Compute PPO policy loss
   */
  private computePolicyLoss(
    policyLogits: tf.Tensor,
    actions: tf.Tensor,
    oldLogProbs: tf.Tensor,
    advantages: tf.Tensor,
    batch: Experience[]
  ): { loss: tf.Tensor; entropy: tf.Tensor } {
    return tf.tidy(() => {
      // Apply action masking
      const actionMasks = tf.tensor2d(batch.map(exp => exp.actionMask.map(m => m ? 0 : -1e10)));
      const maskedLogits = tf.add(policyLogits as tf.Tensor2D, actionMasks);

      // Compute log probabilities
      const logProbs = tf.logSoftmax(maskedLogits);

      // Get log prob of taken actions
      const actionLogProbs = this.gatherLogProbs(logProbs, actions);

      // Compute probability ratio: π(a|s) / π_old(a|s)
      const ratio = tf.exp(tf.sub(actionLogProbs, oldLogProbs));

      // PPO clipped objective
      const epsilon = TRAINING_CONFIG.training.ppoEpsilon;
      const clippedRatio = tf.clipByValue(ratio, 1 - epsilon, 1 + epsilon);

      const obj1 = tf.mul(ratio, advantages);
      const obj2 = tf.mul(clippedRatio, advantages);

      const policyLoss = tf.neg(tf.mean(tf.minimum(obj1, obj2)));

      // Entropy bonus for exploration
      const probs = tf.softmax(maskedLogits);
      const entropy = tf.neg(
        tf.mean(tf.sum(tf.mul(probs, tf.add(logProbs, 1e-10)), 1))
      );

      // Add entropy bonus to policy loss
      const lossWithEntropy = tf.sub(
        policyLoss,
        tf.mul(entropy, TRAINING_CONFIG.training.entropyCoef)
      );

      return { loss: lossWithEntropy, entropy };
    });
  }

  /**
   * Compute value loss (MSE)
   */
  private computeValueLoss(values: tf.Tensor, returns: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const valuePredictions = tf.squeeze(values);
      return tf.losses.meanSquaredError(returns, valuePredictions);
    });
  }

  /**
   * Gather log probabilities of taken actions
   * Using one-hot encoding instead of gatherND since gatherND has no gradient
   */
  private gatherLogProbs(logProbs: tf.Tensor, actions: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const numActions = logProbs.shape[1] as number;
      // Create one-hot encoding of actions
      const oneHot = tf.oneHot(actions, numActions);
      // Multiply and sum to get log probs of taken actions
      return tf.sum(tf.mul(logProbs, oneHot), 1);
    });
  }

  /**
   * Clip gradients by global norm
   */
  private clipGradients(
    grads: { [varName: string]: tf.Tensor },
    maxNorm: number
  ): { [varName: string]: tf.Tensor } {
    return tf.tidy(() => {
      // Compute global norm
      const gradValues = Object.values(grads);
      const squaredNorms = gradValues.map(g => tf.sum(tf.square(g)));
      const globalNorm = tf.sqrt(tf.sum(tf.stack(squaredNorms)));

      // Compute clip factor
      const clipFactor = tf.minimum(
        tf.div(maxNorm, tf.add(globalNorm, 1e-10)),
        1.0
      );

      // Clip gradients
      const clippedGrads: { [varName: string]: tf.Tensor } = {};
      for (const [name, grad] of Object.entries(grads)) {
        clippedGrads[name] = tf.mul(grad, clipFactor);
      }

      return clippedGrads;
    });
  }

  /**
   * Shuffle array
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get number of training steps
   */
  getTrainSteps(): number {
    return this.trainSteps;
  }
}
