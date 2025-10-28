import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { validateAdminCredentials, requireAdmin } from './adminAuth';
import { Game } from './game';
import { gameCache } from './cache';
import path from 'path';

export function createAdminRouter(games: Map<string, Game>, io: Server, cleanupService?: any) {
  const router = Router();

  // Serve admin panel HTML
  router.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
  });

  // Login endpoint
  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (validateAdminCredentials(username, password)) {
      req.session.isAdmin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // Logout endpoint
  router.post('/logout', (req: Request, res: Response) => {
    req.session.isAdmin = false;
    res.json({ success: true });
  });

  // Check authentication status
  router.get('/check-auth', (req: Request, res: Response) => {
    res.json({ isAuthenticated: req.session.isAdmin || false });
  });

  // Get all games (lobbies and in-progress)
  router.get('/games', requireAdmin, (req: Request, res: Response) => {
    const gamesList = Array.from(games.entries()).map(([id, game]) => ({
      id,
      phase: game.phase,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        victoryPoints: p.victoryPoints
      })),
      currentPlayerIndex: game.currentPlayerIndex,
      turnPhase: game.turnPhase,
      createdAt: game.startedAt ? new Date(game.startedAt).toISOString() : new Date().toISOString()
    }));

    res.json({ games: gamesList });
  });

  // Get specific game state
  router.get('/games/:gameId', requireAdmin, (req: Request, res: Response) => {
    const game = games.get(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ game: game.getState() });
  });

  // Delete a game
  router.delete('/games/:gameId', requireAdmin, async (req: Request, res: Response) => {
    const gameId = req.params.gameId;
    const game = games.get(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Notify all players in the game BEFORE deleting
    io.to(gameId).emit('game_deleted_by_admin', {
      message: 'This game has been deleted by an administrator.'
    });

    // Remove from memory
    games.delete(gameId);

    // Remove from Redis
    try {
      await gameCache.deleteGame(gameId);
    } catch (err) {
      console.error('Failed to delete game from cache:', err);
    }

    console.log(`Admin deleted game ${gameId}`);
    res.json({ success: true });
  });

  // Update game state
  router.put('/games/:gameId', requireAdmin, async (req: Request, res: Response) => {
    const gameId = req.params.gameId;
    const game = games.get(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const newState = req.body;

      // Restore the new state to the game
      game.restoreState(newState);

      // Save to Redis - saveGame expects a Game instance
      await gameCache.saveGame(gameId, game);

      // Resync all clients in the game room with updated state
      io.to(gameId).emit('game_update', { game: game.getState() });

      console.log(`Admin updated game state for ${gameId}`);
      res.json({ success: true, game: game.getState() });
    } catch (err) {
      console.error('Failed to update game state:', err);
      res.status(500).json({ error: 'Failed to update game state' });
    }
  });

  // Get game inactivity stats
  router.get('/cleanup/stats', requireAdmin, (req: Request, res: Response) => {
    if (!cleanupService) {
      return res.status(503).json({ error: 'Cleanup service not available' });
    }

    const stats = cleanupService.getInactivityStats();
    res.json({ stats });
  });

  // Manually trigger cleanup
  router.post('/cleanup/trigger', requireAdmin, async (req: Request, res: Response) => {
    if (!cleanupService) {
      return res.status(503).json({ error: 'Cleanup service not available' });
    }

    try {
      const result = await cleanupService.triggerCleanup();
      res.json({
        success: true,
        message: `Checked ${result.checked} games, cleaned up ${result.cleaned} abandoned games`
      });
    } catch (err) {
      console.error('Manual cleanup failed:', err);
      res.status(500).json({ error: 'Cleanup failed' });
    }
  });

  return router;
}
