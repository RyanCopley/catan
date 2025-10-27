import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { Game } from './game';
import { setupSocketHandlers } from './socketHandlers';
import { gameCache } from './cache';

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Store active games
const games = new Map<string, Game>();

// Initialize Redis cache
gameCache.connect().then(() => {
  console.log('Game cache initialized');
}).catch((err) => {
  console.error('Failed to initialize game cache:', err);
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  setupSocketHandlers(io, socket, games);
});

server.listen(PORT, () => {
  console.log(`Catan server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await gameCache.disconnect();
  process.exit(0);
});
