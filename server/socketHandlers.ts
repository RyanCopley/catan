import { Server, Socket } from 'socket.io';
import { Game } from './game';

export function setupSocketHandlers(io: Server, socket: Socket, games: Map<string, Game>): void {
  socket.on('createGame', ({ playerName }: { playerName: string }) => {
    const gameId = generateGameId();
    const game = new Game(gameId);
    game.addPlayer(socket.id, playerName);
    games.set(gameId, game);

    socket.join(gameId);
    socket.emit('gameCreated', { gameId, playerId: socket.id, game: game.getState() });
    console.log(`Game ${gameId} created by ${playerName}`);
  });

  socket.on('joinGame', ({ gameId, playerName }: { gameId: string; playerName: string }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const existingPlayer = game.players.find(p => p.name === playerName);

    if (existingPlayer) {
      console.log(`${playerName} reconnecting to game ${gameId}`);
      game.reconnectPlayer(existingPlayer.id, socket.id);
      socket.join(gameId);
      socket.emit('gameJoined', { gameId, playerId: socket.id, game: game.getState() });
      io.to(gameId).emit('playerReconnected', { game: game.getState(), playerName });
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
    console.log(`${playerName} joined game ${gameId}`);
  });

  socket.on('startGame', ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.start();
    io.to(gameId).emit('gameStarted', { game: game.getState() });
  });

  socket.on('rollDice', ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.rollDice(socket.id);
    io.to(gameId).emit('diceRolled', { game: game.getState(), diceResult: result });
  });

  socket.on('buildSettlement', ({ gameId, vertex }: { gameId: string; vertex: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildSettlement(socket.id, vertex);
    if (success) {
      io.to(gameId).emit('settlementBuilt', { game: game.getState(), vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build settlement there' });
    }
  });

  socket.on('buildRoad', ({ gameId, edge }: { gameId: string; edge: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildRoad(socket.id, edge);
    if (success) {
      io.to(gameId).emit('roadBuilt', { game: game.getState(), edge, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build road there' });
    }
  });

  socket.on('buildCity', ({ gameId, vertex }: { gameId: string; vertex: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildCity(socket.id, vertex);
    if (success) {
      io.to(gameId).emit('cityBuilt', { game: game.getState(), vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build city there' });
    }
  });

  socket.on('endTurn', ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.endTurn(socket.id);
    io.to(gameId).emit('turnEnded', { game: game.getState() });
  });

  socket.on('tradeOffer', ({ gameId, targetPlayerId, offering, requesting }: { gameId: string; targetPlayerId: string | null; offering: any; requesting: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const offer = game.createTradeOffer(socket.id, targetPlayerId, offering, requesting);
    if (offer) {
      io.to(gameId).emit('tradeOffered', { game: game.getState(), offer });
    } else {
      socket.emit('error', { message: 'Cannot create trade offer - insufficient resources' });
    }
  });

  socket.on('tradeRespond', ({ gameId, offerId, response }: { gameId: string; offerId: number; response: 'accepted' | 'rejected' }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.respondToTrade(offerId, socket.id, response);
    if (result.success) {
      io.to(gameId).emit('tradeResponseUpdated', { game: game.getState(), offerId, playerId: socket.id, response });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeConfirm', ({ gameId, offerId, acceptingPlayerId }: { gameId: string; offerId: number; acceptingPlayerId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.confirmTrade(offerId, socket.id, acceptingPlayerId);
    if (result.success) {
      io.to(gameId).emit('tradeExecuted', {
        game: game.getState(),
        offeringPlayer: result.offeringPlayer,
        acceptingPlayer: result.acceptingPlayer
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeCancel', ({ gameId, offerId }: { gameId: string; offerId: number }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.cancelTradeOffer(offerId, socket.id);
    if (success) {
      io.to(gameId).emit('tradeCancelled', { game: game.getState(), offerId });
    }
  });

  socket.on('bankTrade', ({ gameId, givingResource, receivingResource, amount }: { gameId: string; givingResource: any; receivingResource: any; amount?: number }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.tradeWithBank(socket.id, givingResource, receivingResource, amount);
    if (result.success) {
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

  socket.on('discardCards', ({ gameId, cardsToDiscard }: { gameId: string; cardsToDiscard: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.discardCards(socket.id, cardsToDiscard);
    if (result.success) {
      io.to(gameId).emit('cardsDiscarded', { game: game.getState(), playerId: socket.id });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('moveRobber', ({ gameId, hexCoords }: { gameId: string; hexCoords: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.moveRobber(socket.id, hexCoords);
    if (result.success) {
      io.to(gameId).emit('robberMoved', {
        game: game.getState(),
        hexCoords,
        stealableTargets: result.stealableTargets
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('stealCard', ({ gameId, targetPlayerId }: { gameId: string; targetPlayerId: string | null }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.stealCard(socket.id, targetPlayerId);
    if (result.success) {
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

  socket.on('buyDevelopmentCard', ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.buyDevelopmentCard(socket.id);
    if (result.success) {
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

  socket.on('playKnight', ({ gameId, hexCoords }: { gameId: string; hexCoords: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playKnight(socket.id, hexCoords);
    if (result.success) {
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

  socket.on('playYearOfPlenty', ({ gameId, resource1, resource2 }: { gameId: string; resource1: any; resource2: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playYearOfPlenty(socket.id, resource1, resource2);
    if (result.success) {
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

  socket.on('playMonopoly', ({ gameId, resource }: { gameId: string; resource: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playMonopoly(socket.id, resource);
    if (result.success) {
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

  socket.on('playRoadBuilding', ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.playRoadBuilding(socket.id);
    if (result.success) {
      const player = game.players.find(p => p.id === socket.id);
      io.to(gameId).emit('roadBuildingPlayed', {
        game: game.getState(),
        playerName: player?.name
      });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('buildRoadFree', ({ gameId, edge }: { gameId: string; edge: any }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildRoadFree(socket.id, edge);
    if (success) {
      io.to(gameId).emit('roadBuiltFree', { game: game.getState(), edge, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build road there' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    games.forEach((game, gameId) => {
      if (game.hasPlayer(socket.id)) {
        io.to(gameId).emit('playerDisconnected', { playerId: socket.id });
      }
    });
  });
}

function generateGameId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
