import { Server, Socket } from 'socket.io';
import { Game } from './game';
import { gameCache } from './cache';
import { verifyPassword } from './playerManager';
import { validateSocketData } from './validation';

const LOBBY_HEALTHCHECK_INTERVAL_MS = 30000;
let lobbyHealthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Broadcasts game state to all players in a game room, with each player
 * receiving a censored view that hides sensitive information from other players.
 *
 * @param io - The Socket.IO server instance
 * @param gameId - The game ID/room name
 * @param game - The game instance
 * @param eventName - The event name to broadcast
 * @param additionalData - Any additional data to include in the broadcast
 */
function broadcastGameState(io: Server, gameId: string, game: Game, eventName: string, additionalData: Record<string, any> = {}): void {
  // Get all sockets in the game room
  const room = io.sockets.adapter.rooms.get(gameId);
  if (!room) return;

  // Send personalized state to each player
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    // Check if this socket is a spectator or a player
    const isSpectator = game.hasSpectator(socketId);
    const isPlayer = game.hasPlayer(socketId);

    let gameState;
    if (isSpectator) {
      gameState = game.getStateForSpectator();
    } else if (isPlayer) {
      gameState = game.getStateForPlayer(socketId);
    } else {
      // Socket is in room but not recognized - use spectator view for safety
      gameState = game.getStateForSpectator();
    }

    socket.emit(eventName, {
      ...additionalData,
      game: gameState
    });
  }
}

function generatePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function getOpenGamesSnapshot(games: Map<string, Game>) {
  return Array.from(games.entries())
    .filter(([_, game]) => game.phase === 'waiting')
    .map(([gameId, game]) => ({
      gameId,
      hostName: game.players[0]?.name || 'Unknown',
      playerCount: game.players.length,
      maxPlayers: 4
    }));
}

async function saveGameToCache(gameId: string, game: Game): Promise<void> {
  try {
    await gameCache.saveGame(gameId, game);
  } catch (error) {
    console.error(`CRITICAL: Failed to save game ${gameId} to cache:`, error);
    // Game remains in memory, but warn about cache sync failure
    // In production, you might want to alert monitoring systems here
  }
}

async function loadGameFromCache(gameId: string, games: Map<string, Game>): Promise<Game | null> {
  try {
    const cachedState = await gameCache.getGame(gameId);
    if (!cachedState) return null;

    // Reconstruct Game instance from cached state using the safe restoreState method
    const game = new Game(gameId);
    game.restoreState(cachedState);

    // Add to in-memory map
    games.set(gameId, game);
    return game;
  } catch (error) {
    console.error(`Failed to load game ${gameId} from cache:`, error);
    return null;
  }
}

export function setupSocketHandlers(io: Server, socket: Socket, games: Map<string, Game>): void {
  // Helper to broadcast open games list
  const broadcastOpenGames = () => {
    io.emit('openGamesList', { games: getOpenGamesSnapshot(games) });
  };

  const ensureLobbyHealthCheck = () => {
    if (lobbyHealthCheckInterval) return;

    const runHealthCheck = async () => {
      let openGamesChanged = false;

      for (const [gameId, game] of games.entries()) {
        if (game.phase !== 'waiting') continue;

        const disconnectedPlayers = game.players.filter(player => !io.sockets.sockets.has(player.id));
        if (disconnectedPlayers.length === 0) continue;

        disconnectedPlayers.forEach(player => {
          const removed = game.removePlayer(player.id);
          if (removed) {
            console.log(`Removed disconnected player ${player.name} from lobby ${gameId}`);
          }
        });

        if (game.players.length === 0) {
          games.delete(gameId);
          await gameCache.deleteGame(gameId);
          console.log(`Removed empty lobby ${gameId}`);
        } else {
          await saveGameToCache(gameId, game);
          broadcastGameState(io, gameId, game, 'playerLeft');
        }

        openGamesChanged = true;
      }

      if (openGamesChanged) {
        broadcastOpenGames();
      }
    };

    lobbyHealthCheckInterval = setInterval(() => {
      runHealthCheck().catch(err => {
        console.error('Lobby health check failed:', err);
      });
    }, LOBBY_HEALTHCHECK_INTERVAL_MS);
  };

  ensureLobbyHealthCheck();

  socket.on('getGameHistory', async () => {
    const history = await gameCache.getGameHistory(10);
    socket.emit('gameHistory', { history });
  });

  socket.on('getOpenGames', () => {
    socket.emit('openGamesList', { games: getOpenGamesSnapshot(games) });
  });

  socket.on('createGame', async (data: unknown) => {
    const validation = validateSocketData('createGame', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { playerName, password } = validation.data;
    const gameId = generateGameId();
    const game = new Game(gameId);
    game.addPlayer(socket.id, playerName, password);
    games.set(gameId, game);

    await saveGameToCache(gameId, game);

    socket.join(gameId);
    socket.emit('gameCreated', { gameId, playerId: socket.id, game: game.getStateForPlayer(socket.id) });
    console.log(`Game ${gameId} created by ${playerName}`);

    // Broadcast updated open games list
    broadcastOpenGames();
  });

  socket.on('spectateGame', async (data: unknown) => {
    const validation = validateSocketData('spectateGame', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    let game = games.get(gameId);

    // If not in memory, try to load from cache
    if (!game) {
      console.log(`Game ${gameId} not in memory, checking cache...`);
      const loadedGame = await loadGameFromCache(gameId, games);
      if (loadedGame) {
        console.log(`Game ${gameId} loaded from cache`);
        game = loadedGame;
      }
    }

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    game.addSpectator(socket.id);
    socket.join(gameId);
    socket.emit('spectateJoined', { gameId, game: game.getStateForSpectator() });
    console.log(`Spectator ${socket.id} joined game ${gameId}`);
  });

  socket.on('joinGame', async (data: unknown) => {
    const validation = validateSocketData('joinGame', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, playerName, password } = validation.data;
    let game = games.get(gameId);

    // If not in memory, try to load from cache
    if (!game) {
      console.log(`Game ${gameId} not in memory, checking cache...`);
      const loadedGame = await loadGameFromCache(gameId, games);
      if (loadedGame) {
        console.log(`Game ${gameId} loaded from cache`);
        game = loadedGame;
      }
    }

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const existingPlayer = game.players.find(p => p.name === playerName);

    if (existingPlayer) {
      // Validate password for reconnection
      if (!verifyPassword(password, existingPlayer.password)) {
        socket.emit('error', { message: 'Invalid password for this username. Someone else is using this name, or your password has changed.' });
        return;
      }

      console.log(`${playerName} reconnecting to game ${gameId}`);
      const oldSocketId = existingPlayer.id;
      game.reconnectPlayer(oldSocketId, socket.id);
      // Find the player again after reconnection (socket ID has changed)
      const reconnectedPlayer = game.players.find(p => p.id === socket.id);
      if (reconnectedPlayer) {
        reconnectedPlayer.disconnected = false;
      }
      socket.join(gameId);
      socket.emit('gameJoined', { gameId, playerId: socket.id, game: game.getStateForPlayer(socket.id) });
      broadcastGameState(io, gameId, game, 'playerReconnected', { playerName });
      await saveGameToCache(gameId, game);
      return;
    }

    if (game.players.length >= 4) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    game.addPlayer(socket.id, playerName, password);
    socket.join(gameId);
    socket.emit('gameJoined', { gameId, playerId: socket.id, game: game.getStateForPlayer(socket.id) });

    // Unready all players when a new player joins
    game.players.forEach(p => p.ready = false);

    broadcastGameState(io, gameId, game, 'playerJoined');
    await saveGameToCache(gameId, game);
    console.log(`${playerName} joined game ${gameId}`);

    // Broadcast updated open games list
    broadcastOpenGames();
  });

  socket.on('toggleReady', async (data: unknown) => {
    const validation = validateSocketData('toggleReady', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const success = game.toggleReady(socket.id);
    if (!success) return;

    await saveGameToCache(gameId, game);
    broadcastGameState(io, gameId, game, 'playerReadyChanged');

    // Check if all players are ready and auto-start the game
    if (game.areAllPlayersReady()) {
      game.start();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'gameStarted');

      // Broadcast updated open games list (game no longer open)
      broadcastOpenGames();
    }
  });

  socket.on('startGame', async (data: unknown) => {
    const validation = validateSocketData('startGame', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    game.start();
    await saveGameToCache(gameId, game);
    broadcastGameState(io, gameId, game, 'gameStarted');

    // Broadcast updated open games list (game no longer open)
    broadcastOpenGames();
  });

  socket.on('leaveGame', async (data: unknown) => {
    const validation = validateSocketData('leaveGame', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const removed = game.removePlayer(socket.id);
    if (!removed) return;

    socket.leave(gameId);

    if (game.players.length === 0) {
      games.delete(gameId);
      await gameCache.deleteGame(gameId);
    } else {
      // Unready all players when someone leaves
      game.players.forEach(p => p.ready = false);
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'playerLeft');
    }

    broadcastOpenGames();
  });

  socket.on('rollDice', async (data: unknown) => {
    const validation = validateSocketData('rollDice', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.rollDice(socket.id);
    game.updateActivity();
    await saveGameToCache(gameId, game);
    broadcastGameState(io, gameId, game, 'diceRolled', { diceResult: result });
  });

  socket.on('buildSettlement', async (data: unknown) => {
    const validation = validateSocketData('buildSettlement', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, vertex } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildSettlement(socket.id, vertex);
    if (success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'settlementBuilt', { vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build settlement there' });
    }
  });

  socket.on('buildRoad', async (data: unknown) => {
    const validation = validateSocketData('buildRoad', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, edge } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    // Cast to Edge type - buildRoad only uses v1/v2 coordinates to find the board edge
    const success = game.buildRoad(socket.id, edge as any);
    if (success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'roadBuilt', { edge, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build road there' });
    }
  });

  socket.on('buildCity', async (data: unknown) => {
    const validation = validateSocketData('buildCity', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, vertex } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildCity(socket.id, vertex);
    if (success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'cityBuilt', { vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build city there' });
    }
  });

  socket.on('endTurn', async (data: unknown) => {
    const validation = validateSocketData('endTurn', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    game.endTurn(socket.id);
    game.updateActivity();

    // Check if game just finished and save to history
    if (game.phase === 'finished') {
      const history = game.createGameHistory();
      if (history) {
        await gameCache.saveGameHistory(history);
      }
    }

    await saveGameToCache(gameId, game);
    broadcastGameState(io, gameId, game, 'turnEnded');
  });

  socket.on('tradeOffer', async (data: unknown) => {
    const validation = validateSocketData('tradeOffer', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, targetPlayerId, offering, requesting } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const offer = game.createTradeOffer(socket.id, targetPlayerId, offering, requesting);
    if (offer) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'tradeOffered', { offer });
    } else {
      socket.emit('error', { message: 'Cannot create trade offer - insufficient resources' });
    }
  });

  socket.on('tradeRespond', async (data: unknown) => {
    const validation = validateSocketData('tradeRespond', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, offerId, response } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.respondToTrade(offerId, socket.id, response);
    if (result.success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'tradeResponseUpdated', { offerId, playerId: socket.id, response });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeConfirm', async (data: unknown) => {
    const validation = validateSocketData('tradeConfirm', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, offerId, acceptingPlayerId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.confirmTrade(offerId, socket.id, acceptingPlayerId);
    if (result.success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'tradeExecuted', {
        offeringPlayer: result.offeringPlayer,
        acceptingPlayer: result.acceptingPlayer
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeCancel', async (data: unknown) => {
    const validation = validateSocketData('tradeCancel', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, offerId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const success = game.cancelTradeOffer(offerId, socket.id);
    if (success) {
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'tradeCancelled', { offerId });
    }
  });

  socket.on('bankTrade', async (data: unknown) => {
    const validation = validateSocketData('bankTrade', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, givingResource, receivingResource, amount } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.tradeWithBank(socket.id, givingResource, receivingResource, amount);
    if (result.success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'bankTradeExecuted', {
        playerName: result.playerName,
        gave: result.gave,
        gaveAmount: result.gaveAmount,
        received: result.received,
        tradeRate: result.tradeRate
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('discardCards', async (data: unknown) => {
    const validation = validateSocketData('discardCards', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, cardsToDiscard } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.discardCards(socket.id, cardsToDiscard);
    if (result.success) {
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'cardsDiscarded', { playerId: socket.id });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('moveRobber', async (data: unknown) => {
    const validation = validateSocketData('moveRobber', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, hexCoords } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.moveRobber(socket.id, hexCoords);
    if (result.success) {
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'robberMoved', {
        hexCoords,
        stealableTargets: result.stealableTargets
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('stealCard', async (data: unknown) => {
    const validation = validateSocketData('stealCard', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, targetPlayerId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.stealCard(socket.id, targetPlayerId);
    if (result.success) {
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'cardStolen', {
        robberId: socket.id,
        targetPlayerId,
        stolenResource: result.stolenResource
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('buyDevelopmentCard', async (data: unknown) => {
    const validation = validateSocketData('buyDevelopmentCard', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.buyDevelopmentCard(socket.id);
    if (result.success) {
      game.updateActivity();
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);

      // Send the card type to the buyer only
      socket.emit('developmentCardBought', {
        game: game.getStateForPlayer(socket.id),
        cardType: result.cardType
      });

      // Send censored state to others
      const room = io.sockets.adapter.rooms.get(gameId);
      if (room) {
        for (const otherSocketId of room) {
          if (otherSocketId !== socket.id) {
            const otherSocket = io.sockets.sockets.get(otherSocketId);
            if (otherSocket) {
              const isSpectator = game.hasSpectator(otherSocketId);
              const gameState = isSpectator ? game.getStateForSpectator() : game.getStateForPlayer(otherSocketId);
              otherSocket.emit('developmentCardBoughtByOther', {
                game: gameState,
                playerName: player?.name
              });
            }
          }
        }
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playKnight', async (data: unknown) => {
    const validation = validateSocketData('playKnight', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, hexCoords } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playKnight(socket.id, hexCoords);
    if (result.success) {
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'knightPlayed', {
        playerId: socket.id,
        hexCoords,
        stealableTargets: result.stealableTargets
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playYearOfPlenty', async (data: unknown) => {
    const validation = validateSocketData('playYearOfPlenty', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, resource1, resource2 } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playYearOfPlenty(socket.id, resource1, resource2);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      broadcastGameState(io, gameId, game, 'yearOfPlentyPlayed', {
        playerName: player?.name,
        resource1: result.resource1,
        resource2: result.resource2
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playMonopoly', async (data: unknown) => {
    const validation = validateSocketData('playMonopoly', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, resource } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playMonopoly(socket.id, resource);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      broadcastGameState(io, gameId, game, 'monopolyPlayed', {
        playerName: player?.name,
        resource: result.resource,
        totalTaken: result.totalTaken
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playRoadBuilding', async (data: unknown) => {
    const validation = validateSocketData('playRoadBuilding', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playRoadBuilding(socket.id);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      broadcastGameState(io, gameId, game, 'roadBuildingPlayed', {
        playerName: player?.name
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('buildRoadFree', async (data: unknown) => {
    const validation = validateSocketData('buildRoadFree', data);
    if (!validation.success) {
      socket.emit('error', { message: validation.error });
      return;
    }

    const { gameId, edge } = validation.data;
    const game = games.get(gameId);
    if (!game) return;

    // Cast to Edge type - buildRoadFree only uses v1/v2 coordinates to find the board edge
    const success = game.buildRoadFree(socket.id, edge as any);
    if (success) {
      await saveGameToCache(gameId, game);
      broadcastGameState(io, gameId, game, 'roadBuiltFree', { edge, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build road there' });
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);

    for (const [gameId, game] of games.entries()) {
      if (game.hasPlayer(socket.id)) {
        // Mark player as disconnected
        const player = game.players.find(p => p.id === socket.id);
        if (player) {
          player.disconnected = true;
        }

        await saveGameToCache(gameId, game);
        broadcastGameState(io, gameId, game, 'playerDisconnected', { playerId: socket.id });
        console.log(`Player ${socket.id} disconnected from game ${gameId} (phase: ${game.phase})`);
      } else if (game.hasSpectator(socket.id)) {
        // Remove spectator
        game.removeSpectator(socket.id);
        console.log(`Spectator ${socket.id} disconnected from game ${gameId}`);
      }
    }

    // Note: We no longer delete lobby games on disconnect
    // Games persist in cache and players can reconnect after deployment
  });
}

function generateGameId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
