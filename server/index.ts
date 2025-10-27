import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { Game } from './game';
import { setupSocketHandlers } from './socketHandlers';

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Store active games
const games = new Map<string, Game>();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  setupSocketHandlers(io, socket, games);
});

server.listen(PORT, () => {
  console.log(`Catan server running on port ${PORT}`);
});
