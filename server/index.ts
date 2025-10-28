import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import session from 'express-session';
import { Game } from './game';
import { setupSocketHandlers } from './socketHandlers';
import { gameCache } from './cache';
import { createAdminRouter } from './adminRoutes';
import { GameCleanupService } from './gameCleanup';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'catan-admin-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Store active games
const games = new Map<string, Game>();

// Initialize cleanup service
const cleanupService = new GameCleanupService(io, games);

// Admin routes (pass io for socket notifications and cleanup service)
app.use('/admin', createAdminRouter(games, io, cleanupService));

// Initialize Redis cache and load existing games
gameCache.connect().then(async () => {
  console.log('Game cache initialized');

  // Load all games from cache on startup
  try {
    const gameIds = await gameCache.getAllGameIds();
    console.log(`Found ${gameIds.length} games in cache`);

    for (const gameId of gameIds) {
      const cachedState = await gameCache.getGame(gameId);
      if (cachedState) {
        const game = new Game(gameId);
        game.restoreState(cachedState);

        games.set(gameId, game);
        console.log(`Loaded game ${gameId} (phase: ${game.phase}, players: ${game.players.length})`);
      }
    }

    console.log(`Server ready with ${games.size} active games`);

    // Start cleanup service
    cleanupService.start();
  } catch (err) {
    console.error('Failed to load games from cache:', err);
  }
}).catch((err) => {
  console.error('Failed to initialize game cache:', err);
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  socket.on('admin:ping', (ack?: (payload: { serverTime: number }) => void) => {
    if (typeof ack === 'function') {
      ack({ serverTime: Date.now() });
    }
  });
  setupSocketHandlers(io, socket, games);
});

server.listen(PORT, () => {
  console.log(`Catan server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  cleanupService.stop();
  await gameCache.disconnect();
  process.exit(0);
});
