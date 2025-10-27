const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Store active games
const games = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('createGame', ({ playerName }) => {
    const gameId = generateGameId();
    const game = new Game(gameId);
    game.addPlayer(socket.id, playerName);
    games.set(gameId, game);

    socket.join(gameId);
    socket.emit('gameCreated', { gameId, playerId: socket.id, game: game.getState() });
    console.log(`Game ${gameId} created by ${playerName}`);
  });

  socket.on('joinGame', ({ gameId, playerName }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if player with same name already exists (reconnection)
    const existingPlayer = game.players.find(p => p.name === playerName);

    if (existingPlayer) {
      // Reconnect existing player with new socket ID
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

  socket.on('startGame', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.start();
    io.to(gameId).emit('gameStarted', { game: game.getState() });
  });

  socket.on('rollDice', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.rollDice(socket.id);
    io.to(gameId).emit('diceRolled', { game: game.getState(), diceResult: result });
  });

  socket.on('buildSettlement', ({ gameId, vertex }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildSettlement(socket.id, vertex);
    if (success) {
      io.to(gameId).emit('settlementBuilt', { game: game.getState(), vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build settlement there' });
    }
  });

  socket.on('buildRoad', ({ gameId, edge }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildRoad(socket.id, edge);
    if (success) {
      io.to(gameId).emit('roadBuilt', { game: game.getState(), edge, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build road there' });
    }
  });

  socket.on('buildCity', ({ gameId, vertex }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.buildCity(socket.id, vertex);
    if (success) {
      io.to(gameId).emit('cityBuilt', { game: game.getState(), vertex, playerId: socket.id });
    } else {
      socket.emit('error', { message: 'Cannot build city there' });
    }
  });

  socket.on('endTurn', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.endTurn(socket.id);
    io.to(gameId).emit('turnEnded', { game: game.getState() });
  });

  socket.on('tradeOffer', ({ gameId, targetPlayerId, offering, requesting }) => {
    const game = games.get(gameId);
    if (!game) return;

    const offer = game.createTradeOffer(socket.id, targetPlayerId, offering, requesting);
    if (offer) {
      io.to(gameId).emit('tradeOffered', { game: game.getState(), offer });
    } else {
      socket.emit('error', { message: 'Cannot create trade offer - insufficient resources' });
    }
  });

  socket.on('tradeRespond', ({ gameId, offerId, response }) => {
    const game = games.get(gameId);
    if (!game) return;

    const result = game.respondToTrade(offerId, socket.id, response);
    if (result.success) {
      io.to(gameId).emit('tradeResponseUpdated', { game: game.getState(), offerId, playerId: socket.id, response });
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('tradeConfirm', ({ gameId, offerId, acceptingPlayerId }) => {
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

  socket.on('tradeCancel', ({ gameId, offerId }) => {
    const game = games.get(gameId);
    if (!game) return;

    const success = game.cancelTradeOffer(offerId, socket.id);
    if (success) {
      io.to(gameId).emit('tradeCancelled', { game: game.getState(), offerId });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Handle player disconnection
    games.forEach((game, gameId) => {
      if (game.hasPlayer(socket.id)) {
        io.to(gameId).emit('playerDisconnected', { playerId: socket.id });
      }
    });
  });
});

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

server.listen(PORT, () => {
  console.log(`Catan server running on port ${PORT}`);
});
