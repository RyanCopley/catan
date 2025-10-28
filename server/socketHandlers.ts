import { Server, Socket } from 'socket.io';
import { Game } from './game';
import { gameCache } from './cache';

const LOBBY_HEALTHCHECK_INTERVAL_MS = 30000;
let lobbyHealthCheckInterval: NodeJS.Timeout | null = null;

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
  await gameCache.saveGame(gameId, game);
}

async function loadGameFromCache(gameId: string, games: Map<string, Game>): Promise<Game | null> {
  const cachedState = await gameCache.getGame(gameId);
  if (!cachedState) return null;

  // Reconstruct Game instance from cached state
  const game = new Game(gameId);
  game.players = cachedState.players;
  game.board = cachedState.board;
  game.currentPlayerIndex = cachedState.currentPlayerIndex;
  game.phase = cachedState.phase;
  game.turnPhase = cachedState.turnPhase;
  game.diceRoll = cachedState.diceRoll;
  game.setupRound = cachedState.setupRound;
  game.setupSettlementPlaced = cachedState.setupSettlementPlaced;
  game.setupRoadPlaced = cachedState.setupRoadPlaced;

  // Add to in-memory map
  games.set(gameId, game);
  return game;
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
          io.to(gameId).emit('playerLeft', { game: game.getState() });
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

  socket.on('createGame', async ({ playerName }: { playerName: string }) => {
    const gameId = generateGameId();
    const game = new Game(gameId);
    game.addPlayer(socket.id, playerName);
    games.set(gameId, game);

    await saveGameToCache(gameId, game);

    socket.join(gameId);
    socket.emit('gameCreated', { gameId, playerId: socket.id, game: game.getState() });
    console.log(`Game ${gameId} created by ${playerName}`);

    // Broadcast updated open games list
    broadcastOpenGames();
  });

  socket.on('joinGame', async ({ gameId, playerName }: { gameId: string; playerName: string }) => {
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
      console.log(`${playerName} reconnecting to game ${gameId}`);
      const oldSocketId = existingPlayer.id;
      game.reconnectPlayer(oldSocketId, socket.id);
      // Find the player again after reconnection (socket ID has changed)
      const reconnectedPlayer = game.players.find(p => p.id === socket.id);
      if (reconnectedPlayer) {
        reconnectedPlayer.disconnected = false;
      }
      socket.join(gameId);
      socket.emit('gameJoined', { gameId, playerId: socket.id, game: game.getState() });
      io.to(gameId).emit('playerReconnected', { game: game.getState(), playerName });
      await saveGameToCache(gameId, game);
      return;
    }

    if (game.players.length >= 4) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    game.addPlayer(socket.id, playerName);
    socket.join(gameId);
    socket.emit('gameJoined', { gameId, playerId: socket.id, game: game.getState() });
    io.to(gameId).emit('playerJoined', { game: game.getState() });
    await saveGameToCache(gameId, game);
    console.log(`${playerName} joined game ${gameId}`);

    // Broadcast updated open games list
    broadcastOpenGames();
  });

  socket.on('startGame', async ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.start();
    await saveGameToCache(gameId, game);
    io.to(gameId).emit('gameStarted', { game: game.getState() });

    // Broadcast updated open games list (game no longer open)
    broadcastOpenGames();
  });

  socket.on('leaveGame', async ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const removed = game.removePlayer(socket.id);
    if (!removed) return;

    socket.leave(gameId);

    if (game.players.length === 0) {
      games.delete(gameId);
      await gameCache.deleteGame(gameId);
    } else {
      await saveGameToCache(gameId, game);
      socket.to(gameId).emit('playerLeft', { game: game.getState() });
    }

    broadcastOpenGames();
  });

  socket.on('rollDice', async ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.rollDice(socket.id);
    await saveGameToCache(gameId, game);
    io.to(gameId).emit('diceRolled', { game: game.getState(), diceResult: result });
  });

  socket.on('buildSettlement', async ({ gameId, vertex }: { gameId: string; vertex: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildSettlement(socket.id, vertex);
    if (success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('settlementBuilt', { game: game.getState(), vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build settlement there' });
    }
  });

  socket.on('buildRoad', async ({ gameId, edge }: { gameId: string; edge: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildRoad(socket.id, edge);
    if (success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('roadBuilt', { game: game.getState(), edge, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build road there' });
    }
  });

  socket.on('buildCity', async ({ gameId, vertex }: { gameId: string; vertex: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildCity(socket.id, vertex);
    if (success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('cityBuilt', { game: game.getState(), vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build city there' });
    }
  });

  socket.on('endTurn', async ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.endTurn(socket.id);

    // Check if game just finished and save to history
    if (game.phase === 'finished') {
      const history = game.createGameHistory();
      if (history) {
        await gameCache.saveGameHistory(history);
      }
    }

    await saveGameToCache(gameId, game);
    io.to(gameId).emit('turnEnded', { game: game.getState() });
  });

  socket.on('tradeOffer', async ({ gameId, targetPlayerId, offering, requesting }: { gameId: string; targetPlayerId: string | null; offering: any; requesting: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const offer = game.createTradeOffer(socket.id, targetPlayerId, offering, requesting);
    if (offer) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('tradeOffered', { game: game.getState(), offer });
    } else {
      socket.emit('error', { message: 'Cannot create trade offer - insufficient resources' });
    }
  });

  socket.on('tradeRespond', async ({ gameId, offerId, response }: { gameId: string; offerId: number; response: 'accepted' | 'rejected' }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.respondToTrade(offerId, socket.id, response);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('tradeResponseUpdated', { game: game.getState(), offerId, playerId: socket.id, response });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeConfirm', async ({ gameId, offerId, acceptingPlayerId }: { gameId: string; offerId: number; acceptingPlayerId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.confirmTrade(offerId, socket.id, acceptingPlayerId);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('tradeExecuted', {
        game: game.getState(),
        offeringPlayer: result.offeringPlayer,
        acceptingPlayer: result.acceptingPlayer
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeCancel', async ({ gameId, offerId }: { gameId: string; offerId: number }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.cancelTradeOffer(offerId, socket.id);
    if (success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('tradeCancelled', { game: game.getState(), offerId });
    }
  });

  socket.on('bankTrade', async ({ gameId, givingResource, receivingResource, amount }: { gameId: string; givingResource: any; receivingResource: any; amount?: number }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.tradeWithBank(socket.id, givingResource, receivingResource, amount);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('bankTradeExecuted', {
        game: game.getState(),
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

  socket.on('discardCards', async ({ gameId, cardsToDiscard }: { gameId: string; cardsToDiscard: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.discardCards(socket.id, cardsToDiscard);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('cardsDiscarded', { game: game.getState(), playerId: socket.id });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('moveRobber', async ({ gameId, hexCoords }: { gameId: string; hexCoords: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.moveRobber(socket.id, hexCoords);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('robberMoved', {
        game: game.getState(),
        hexCoords,
        stealableTargets: result.stealableTargets
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('stealCard', async ({ gameId, targetPlayerId }: { gameId: string; targetPlayerId: string | null }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.stealCard(socket.id, targetPlayerId);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('cardStolen', {
        game: game.getState(),
        robberId: socket.id,
        targetPlayerId,
        stolenResource: result.stolenResource
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('buyDevelopmentCard', async ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.buyDevelopmentCard(socket.id);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      socket.emit('developmentCardBought', {
        game: game.getState(),
        cardType: result.cardType
      });
      socket.to(gameId).emit('developmentCardBoughtByOther', {
        game: game.getState(),
        playerName: player?.name
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playKnight', async ({ gameId, hexCoords }: { gameId: string; hexCoords: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playKnight(socket.id, hexCoords);
    if (result.success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('knightPlayed', {
        game: game.getState(),
        playerId: socket.id,
        hexCoords,
        stealableTargets: result.stealableTargets
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playYearOfPlenty', async ({ gameId, resource1, resource2 }: { gameId: string; resource1: any; resource2: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playYearOfPlenty(socket.id, resource1, resource2);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      io.to(gameId).emit('yearOfPlentyPlayed', {
        game: game.getState(),
        playerName: player?.name,
        resource1: result.resource1,
        resource2: result.resource2
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playMonopoly', async ({ gameId, resource }: { gameId: string; resource: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playMonopoly(socket.id, resource);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      io.to(gameId).emit('monopolyPlayed', {
        game: game.getState(),
        playerName: player?.name,
        resource: result.resource,
        totalTaken: result.totalTaken
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('playRoadBuilding', async ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playRoadBuilding(socket.id);
    if (result.success) {
      await saveGameToCache(gameId, game);
      const player = game.players.find(p => p.id === socket.id);
      io.to(gameId).emit('roadBuildingPlayed', {
        game: game.getState(),
        playerName: player?.name
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('buildRoadFree', async ({ gameId, edge }: { gameId: string; edge: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildRoadFree(socket.id, edge);
    if (success) {
      await saveGameToCache(gameId, game);
      io.to(gameId).emit('roadBuiltFree', { game: game.getState(), edge, playerId: socket.id });
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
        io.to(gameId).emit('playerDisconnected', { playerId: socket.id, game: game.getState() });
        console.log(`Player ${socket.id} disconnected from game ${gameId} (phase: ${game.phase})`);
      }
    }

    // Note: We no longer delete lobby games on disconnect
    // Games persist in cache and players can reconnect after deployment
  });
}

function generateGameId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
