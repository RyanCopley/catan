// MUST be first - loads environment variables
import './config';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import session from 'express-session';
import { Game } from './game';
import { setupSocketHandlers } from './socketHandlers';
import { gameCache } from './cache';
import { createAdminRouter, recordSocketEvent } from './adminRoutes';
import { GameCleanupService } from './gameCleanup';

// Validate required environment variables
if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required');
  console.error('Please set it in your .env file or environment');
  console.error('Generate a secure random string, e.g.: openssl rand -base64 32');
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error('FATAL: SESSION_SECRET must be at least 32 characters long');
  process.exit(1);
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    if (req.path.startsWith('/admin')) {
      const forwardedProto = req.headers['x-forwarded-proto'];
      const protoChain = Array.isArray(forwardedProto) ? forwardedProto.join(',') : forwardedProto;
      console.log(
        `[session-debug] secure=${req.secure} protocol=${req.protocol} forwardedProto=${protoChain ?? 'n/a'} ip=${req.ip} ips=${req.ips?.join(',') || 'n/a'} url=${req.originalUrl}`
      );
    }
    next();
  });
}

// Session configuration with security best practices
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'catan.sid', // Custom session name (don't use default 'connect.sid')
  cookie: {
    secure: IS_PRODUCTION, // HTTPS only in production
    httpOnly: true, // Prevent XSS attacks
    sameSite: 'strict', // CSRF protection
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
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
  socket.onAny((eventName) => {
    recordSocketEvent(eventName);
  });
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
