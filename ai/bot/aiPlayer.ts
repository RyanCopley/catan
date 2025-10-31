import { io, Socket } from 'socket.io-client';
import { CatanNet } from '../models/catanNet';
import { StateEncoder } from '../encoding/stateEncoder';
import { ActionEncoder } from '../encoding/actionEncoder';
import { GameState, Experience, ActionType, DecodedAction } from '../types';
import { TRAINING_CONFIG } from '../config/training.config';

/**
 * AI bot that connects to the Catan server via WebSocket and plays games
 */
export class AIPlayer {
  private socket: Socket;
  private network: CatanNet;
  private gameState: GameState | null = null;
  private playerIndex: number = -1;
  private playerId: string = '';
  private gameId: string = '';

  // Experience collection
  private experiences: Experience[] = [];
  private currentState: Float32Array | null = null;
  private currentAction: number | null = null;
  private currentLogProb: number | null = null;
  private currentValue: number | null = null;
  private totalReward: number = 0;
  private robberMovedThisTurn: boolean = false; // Track if robber moved in current robber phase
  private consecutiveErrors: number = 0; // Track consecutive errors to prevent infinite loops

  // Configuration
  private temperature: number = 1.0; // Exploration temperature
  private isTraining: boolean = true;

  constructor(
    network: CatanNet,
    private name: string = 'AI_Player',
    private serverUrl: string = TRAINING_CONFIG.server.url
  ) {
    this.network = network;
    this.socket = io(this.serverUrl, {
      reconnectionAttempts: TRAINING_CONFIG.server.reconnectionAttempts,
      reconnectionDelay: TRAINING_CONFIG.server.reconnectionDelay,
    });

    this.setupSocketHandlers();
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    this.socket.on('connect', () => {
      console.log(`[${this.name}] Connected to server`);
    });

    this.socket.on('disconnect', () => {
      console.log(`[${this.name}] Disconnected from server`);
    });

    this.socket.on('gameCreated', (data: { gameId: string; playerId: string }) => {
      console.log(`[${this.name}] Game created: ${data.gameId}`);
      this.gameId = data.gameId;
      this.playerId = data.playerId;
    });

    this.socket.on('gameJoined', (data: { gameId: string; playerId: string }) => {
      console.log(`[${this.name}] Joined game: ${data.gameId}`);
      this.gameId = data.gameId;
      this.playerId = data.playerId;
    });

    this.socket.on('gameStarted', (data: { game: GameState }) => {
      console.log(`[${this.name}] Game started`);
      if (data.game) {
        this.handleGameUpdate(data.game);
      }
    });

    this.socket.on('gameUpdate', (data: { game: GameState }) => {
      this.handleGameUpdate(data.game);
    });

    this.socket.on('playerJoined', (data: { game: GameState }) => {
      if (data.game) {
        this.handleGameUpdate(data.game);
      }
    });

    // Listen for all game action events that update game state
    this.socket.on('diceRolled', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('settlementBuilt', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('roadBuilt', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('cityBuilt', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('turnEnded', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('robberMoved', (data: { game: GameState }) => {
      this.robberMovedThisTurn = true;
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('cardStolen', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('cardsDiscarded', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('developmentCardBought', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('knightPlayed', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('yearOfPlentyPlayed', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('monopolyPlayed', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('roadBuildingPlayed', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('roadBuiltFree', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('bankTradeExecuted', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('tradeExecuted', (data: { game: GameState }) => {
      if (data.game) this.handleGameUpdate(data.game);
    });

    this.socket.on('error', (error: string) => {
      console.error(`[${this.name}] Error:`, error);
      // On invalid action, give negative reward but continue
      if (this.currentState && this.currentAction !== null) {
        this.recordReward(TRAINING_CONFIG.rewards.invalidAction);
      }

      // Track consecutive errors - if too many, force END_TURN
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= 3) {
        console.log(`[${this.name}] Too many consecutive errors, forcing END_TURN`);
        this.socket.emit('endTurn', { gameId: this.gameId });
        this.consecutiveErrors = 0;
      } else {
        // Try another action immediately after error (game state hasn't changed)
        console.log(`[${this.name}] Error occurred, retrying with different action...`);
        if (this.gameState && this.gameState.currentPlayerIndex === this.playerIndex) {
          setTimeout(() => this.takeAction(this.gameState!), 100);
        }
      }
    });
  }

  /**
   * Create a new game
   */
  async createGame(): Promise<{ gameId: string; password: string }> {
    return new Promise((resolve) => {
      const password = Math.random().toString(36).substring(7);
      this.socket.emit('createGame', { playerName: this.name, password });
      this.socket.once('gameCreated', (data: { gameId: string }) => {
        resolve({ gameId: data.gameId, password });
      });
    });
  }

  /**
   * Join an existing game
   */
  async joinGame(gameId: string, password: string): Promise<void> {
    return new Promise((resolve) => {
      this.socket.emit('joinGame', { gameId, playerName: this.name, password });
      this.socket.once('gameJoined', () => {
        resolve();
      });
    });
  }

  /**
   * Start the game (host only)
   */
  startGame(): void {
    this.socket.emit('startGame', { gameId: this.gameId });
  }

  /**
   * Handle game state update from server
   */
  private async handleGameUpdate(state: GameState): Promise<void> {
    this.gameState = state;

    console.log(`[${this.name}] Game update - Phase: ${state.phase}, Turn: ${state.currentPlayerIndex}, My ID: ${this.playerId}`);

    // Find our player index
    this.playerIndex = state.players.findIndex(p => p.id === this.playerId);

    if (this.playerIndex === -1) {
      console.error(`[${this.name}] Player not found in game state`);
      console.log(`[${this.name}] Player IDs in state:`, state.players.map(p => p.id));
      return;
    }

    console.log(`[${this.name}] My player index: ${this.playerIndex}`);

    // Check if game is over
    if (state.phase === 'finished') {
      this.handleGameEnd(state);
      return;
    }

    // Only take actions if game has started (setup or playing phase)
    if (state.phase === 'waiting') {
      console.log(`[${this.name}] Game in waiting phase, not taking actions yet`);
      return;
    }

    // Check if we need to discard cards (happens when 7 is rolled)
    const player = state.players[this.playerIndex];
    if (player.mustDiscard && player.mustDiscard > 0) {
      console.log(`[${this.name}] Must discard ${player.mustDiscard} cards`);
      await this.handleDiscard(state, player.mustDiscard);
      return;
    }

    // If it's our turn, take action
    if (state.currentPlayerIndex === this.playerIndex) {
      // Reset robber flag when we enter roll phase (new turn)
      if (state.turnPhase === 'roll') {
        this.robberMovedThisTurn = false;
        this.consecutiveErrors = 0; // Reset error counter on new turn
      }
      console.log(`[${this.name}] It's my turn! Taking action...`);
      await this.takeAction(state);
    } else {
      console.log(`[${this.name}] Not my turn (current: ${state.currentPlayerIndex})`);
    }
  }

  /**
   * Take an action based on current game state
   */
  private async takeAction(state: GameState): Promise<void> {
    // Encode state
    const encodedState = StateEncoder.encode(state, this.playerIndex);

    // Debug: Check if state contains NaN
    const hasNaN = Array.from(encodedState).some(isNaN);
    const hasInf = Array.from(encodedState).some(x => !isFinite(x));
    if (hasNaN || hasInf) {
      console.error(`[AIPlayer] Encoded state has NaN: ${hasNaN}, has Inf: ${hasInf}`);
      console.error(`[AIPlayer] First 10 values:`, Array.from(encodedState).slice(0, 10));
    }

    // Create action mask
    const actionMask = ActionEncoder.createActionMask(state, this.playerIndex, this.robberMovedThisTurn);

    // Check if any valid actions
    if (!actionMask.some(m => m)) {
      console.warn(`[${this.name}] No valid actions available`);
      return;
    }

    // Sample action from network
    const { actionIndex, logProb, value } = this.network.sampleAction(
      encodedState,
      actionMask,
      this.temperature
    );

    // Decode action
    const decodedAction = ActionEncoder.decode(actionIndex, state);

    if (!decodedAction) {
      console.error(`[${this.name}] Failed to decode action ${actionIndex}`);
      return;
    }

    // Store experience data
    if (this.currentState !== null && this.currentAction !== null) {
      // Calculate reward for previous action
      const reward = this.calculateReward(state);
      this.recordReward(reward);

      // Store experience
      this.experiences.push({
        state: this.currentState,
        action: this.currentAction,
        reward: this.totalReward,
        nextState: encodedState,
        done: false,
        actionMask: ActionEncoder.createActionMask(state, this.playerIndex),
        logProb: this.currentLogProb!,
        value: this.currentValue!,
      });

      this.totalReward = 0; // Reset for next step
    }

    // Update current state
    this.currentState = encodedState;
    this.currentAction = actionIndex;
    this.currentLogProb = logProb;
    this.currentValue = value;

    // Execute action
    await this.executeAction(decodedAction);

    // Small delay to avoid flooding server
    await this.sleep(100);
  }

  /**
   * Execute decoded action on server
   */
  private async executeAction(action: DecodedAction): Promise<void> {
    console.log(`[${this.name}] Executing action:`, ActionType[action.type]);

    switch (action.type) {
      case ActionType.ROLL_DICE:
        this.socket.emit('rollDice', { gameId: this.gameId });
        break;

      case ActionType.BUILD_SETTLEMENT_SETUP:
      case ActionType.BUILD_SETTLEMENT:
        // Convert vertex to {x, y} format
        const vertex = this.vertexToCoordinate(action.data.vertex);
        this.socket.emit('buildSettlement', { gameId: this.gameId, vertex });
        break;

      case ActionType.BUILD_ROAD_SETUP:
      case ActionType.BUILD_ROAD:
        // Convert edge to {v1: {x,y}, v2: {x,y}} format
        const edge = this.edgeToCoordinates(action.data.edge);
        this.socket.emit('buildRoad', { gameId: this.gameId, edge });
        break;

      case ActionType.BUILD_CITY:
        const cityVertex = this.vertexToCoordinate(action.data.vertex);
        this.socket.emit('buildCity', { gameId: this.gameId, vertex: cityVertex });
        break;

      case ActionType.BUY_DEV_CARD:
        this.socket.emit('buyDevelopmentCard', { gameId: this.gameId });
        break;

      case ActionType.PLAY_KNIGHT:
        this.socket.emit('playKnight', { gameId: this.gameId });
        break;

      case ActionType.MOVE_ROBBER:
        if (!action.data.hex) {
          console.error(`[${this.name}] MOVE_ROBBER action has undefined hex:`, action);
          return; // Don't send invalid request
        }
        this.socket.emit('moveRobber', {
          gameId: this.gameId,
          hexCoords: action.data.hex
        });
        break;

      case ActionType.STEAL_CARD:
        this.socket.emit('stealCard', {
          gameId: this.gameId,
          targetPlayerId: this.gameState?.players[action.data.playerIndex]?.id
        });
        break;

      case ActionType.END_TURN:
        this.socket.emit('endTurn', { gameId: this.gameId });
        break;

      default:
        console.warn(`[${this.name}] Unknown action type:`, action.type);
    }
  }

  /**
   * Convert internal vertex format to server's {x, y} format
   * Server uses Cartesian coordinates derived from hex grid
   */
  private vertexToCoordinate(vertex: any): { x: number; y: number } {
    // Get all 6 vertices for this hex using the same formula as server
    const size = 1; // Server uses size 1 in boardGenerator
    const hexX = size * (3/2 * vertex.q);
    const hexY = size * (Math.sqrt(3)/2 * vertex.q + Math.sqrt(3) * vertex.r);

    // Map direction to vertex index (0-5)
    // Server vertices go counterclockwise starting from right (angle 0)
    // N (north) = top vertices, S (south) = bottom vertices
    let vertexIndex: number;
    if (vertex.direction === 'N') {
      vertexIndex = 1; // Top-left vertex
    } else if (vertex.direction === 'S') {
      vertexIndex = 4; // Bottom-left vertex
    } else {
      // Fallback: try to use direction as index if it's a number
      vertexIndex = 0;
    }

    // Calculate vertex position using same formula as server
    const angle = Math.PI / 3 * vertexIndex;
    const x = parseFloat((hexX + size * Math.cos(angle)).toFixed(3));
    const y = parseFloat((hexY + size * Math.sin(angle)).toFixed(3));

    return { x, y };
  }

  /**
   * Convert internal edge format to server's format
   * Edges connect two vertices, so we need to find the two vertex positions
   */
  private edgeToCoordinates(edge: any): { v1: { x: number; y: number }; v2: { x: number; y: number } } {
    const size = 1;
    const hexX = size * (3/2 * edge.q);
    const hexY = size * (Math.sqrt(3)/2 * edge.q + Math.sqrt(3) * edge.r);

    // Map edge direction to vertex indices
    // Edges connect adjacent vertices
    let v1Index: number, v2Index: number;
    switch (edge.direction) {
      case 'NE': // Northeast edge
        v1Index = 0; // Right vertex
        v2Index = 1; // Top-left vertex
        break;
      case 'E': // East edge
        v1Index = 5; // Bottom-right vertex
        v2Index = 0; // Right vertex
        break;
      case 'SE': // Southeast edge
        v1Index = 4; // Bottom-left vertex
        v2Index = 5; // Bottom-right vertex
        break;
      default:
        v1Index = 0;
        v2Index = 1;
    }

    // Calculate vertex positions
    const angle1 = Math.PI / 3 * v1Index;
    const angle2 = Math.PI / 3 * v2Index;

    const v1 = {
      x: parseFloat((hexX + size * Math.cos(angle1)).toFixed(3)),
      y: parseFloat((hexY + size * Math.sin(angle1)).toFixed(3))
    };

    const v2 = {
      x: parseFloat((hexX + size * Math.cos(angle2)).toFixed(3)),
      y: parseFloat((hexY + size * Math.sin(angle2)).toFixed(3))
    };

    return { v1, v2 };
  }

  /**
   * Calculate reward for the current state transition
   */
  private calculateReward(newState: GameState): number {
    if (!this.gameState) return 0;

    const oldPlayer = this.gameState.players[this.playerIndex];
    const newPlayer = newState.players[this.playerIndex];

    let reward = 0;

    // Reward for victory points gained
    const vpGained = newPlayer.victoryPoints - oldPlayer.victoryPoints;
    reward += vpGained * TRAINING_CONFIG.rewards.victoryPoint;

    // Reward for buildings
    const settlementsGained = newPlayer.settlements.length - oldPlayer.settlements.length;
    reward += settlementsGained * TRAINING_CONFIG.rewards.settlement;

    const citiesGained = newPlayer.cities.length - oldPlayer.cities.length;
    reward += citiesGained * TRAINING_CONFIG.rewards.city;

    // Reward for longest road
    if (newState.longestRoadPlayer === this.playerIndex &&
        this.gameState.longestRoadPlayer !== this.playerIndex) {
      reward += TRAINING_CONFIG.rewards.longestRoad;
    }

    // Reward for largest army
    if (newState.largestArmyPlayer === this.playerIndex &&
        this.gameState.largestArmyPlayer !== this.playerIndex) {
      reward += TRAINING_CONFIG.rewards.largestArmy;
    }

    // Small reward for gaining resources
    const oldResourceCount = Object.values(oldPlayer.resources).reduce((a, b) => a + b, 0);
    const newResourceCount = Object.values(newPlayer.resources).reduce((a, b) => a + b, 0);
    const resourcesGained = newResourceCount - oldResourceCount;
    reward += resourcesGained * TRAINING_CONFIG.rewards.resourceGained;

    return reward;
  }

  /**
   * Record reward
   */
  private recordReward(reward: number): void {
    this.totalReward += reward;
  }

  /**
   * Handle game end
   */
  private handleGameEnd(state: GameState): void {
    console.log(`[${this.name}] Game ended. Winner: Player ${state.winner}`);

    // Final reward
    const finalReward = state.winner === this.playerIndex
      ? TRAINING_CONFIG.rewards.win
      : TRAINING_CONFIG.rewards.loss;

    this.recordReward(finalReward);

    // Store final experience
    if (this.currentState !== null && this.currentAction !== null) {
      const finalState = StateEncoder.encode(state, this.playerIndex);
      this.experiences.push({
        state: this.currentState,
        action: this.currentAction,
        reward: this.totalReward,
        nextState: finalState,
        done: true,
        actionMask: ActionEncoder.createActionMask(state, this.playerIndex),
        logProb: this.currentLogProb!,
        value: this.currentValue!,
      });
    }

    console.log(`[${this.name}] Collected ${this.experiences.length} experiences`);
  }

  /**
   * Get collected experiences and reset
   */
  getExperiences(): Experience[] {
    const exps = [...this.experiences];
    this.experiences = [];
    this.currentState = null;
    this.currentAction = null;
    this.currentLogProb = null;
    this.currentValue = null;
    this.totalReward = 0;
    return exps;
  }

  /**
   * Force game end (used when timeout occurs)
   */
  forceGameEnd(): void {
    console.log(`[${this.name}] Forcing game end due to timeout`);
    if (this.gameState) {
      this.handleGameEnd(this.gameState);
    }
  }

  /**
   * Set exploration temperature
   */
  setTemperature(temp: number): void {
    this.temperature = temp;
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.socket.disconnect();
  }

  /**
   * Handle discarding cards when 7 is rolled
   */
  private async handleDiscard(state: GameState, numToDiscard: number): Promise<void> {
    const player = state.players[this.playerIndex];
    const resources = player.resources;

    // Simple strategy: discard resources randomly, prioritizing abundant resources
    const cardsToDiscard: Partial<Record<string, number>> = {};
    let remaining = numToDiscard;

    // Get all resources we have
    const resourceList: string[] = [];
    for (const [resource, count] of Object.entries(resources)) {
      for (let i = 0; i < count; i++) {
        resourceList.push(resource);
      }
    }

    // Shuffle and discard
    for (let i = 0; i < Math.min(numToDiscard, resourceList.length); i++) {
      const randomIndex = Math.floor(Math.random() * resourceList.length);
      const resource = resourceList[randomIndex];
      resourceList.splice(randomIndex, 1);

      cardsToDiscard[resource] = (cardsToDiscard[resource] || 0) + 1;
    }

    console.log(`[${this.name}] Discarding:`, cardsToDiscard);
    this.socket.emit('discardCards', { gameId: this.gameId, cardsToDiscard });
    await this.sleep(100);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get game ID
   */
  getGameId(): string {
    return this.gameId;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string {
    return this.socket.id || '';
  }

  /**
   * Wait for connection
   */
  async waitForConnection(): Promise<void> {
    if (this.socket.connected) return;

    return new Promise((resolve) => {
      this.socket.once('connect', () => resolve());
    });
  }
}
