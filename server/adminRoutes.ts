import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { validateAdminCredentials, requireAdmin } from './adminAuth';
import { Game } from './game';
import { gameCache } from './cache';
import path from 'path';
import os from 'os';
import fs from 'fs';

type NetworkSnapshot = {
  timestamp: number;
  rxBytes: number;
  txBytes: number;
};

type CpuTimes = {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
};

type CpuSnapshot = {
  timestamp: number;
  cores: CpuTimes[];
};

type NetworkUsageMetrics = {
  bytesReceived: number;
  bytesSent: number;
  receiveRate: number | null;
  sendRate: number | null;
  lastSampledAt: string;
};

type RequestUsageMetrics = {
  totalRate: number;
  perEventRates: Record<string, number>;
  lastSampledAt: string;
};

type MetricHistorySample = {
  timestamp: number;
  cpuUsagePercent: number | null;
  systemMemoryUsedBytes: number;
  totalSystemMemoryBytes: number;
  processMemoryRssBytes: number;
  processHeapUsedBytes: number;
  networkReceiveRateBytes: number | null;
  networkSendRateBytes: number | null;
  socketRequestTotalRate: number | null;
  socketRequestRatesByEvent: Record<string, number> | null;
};

const METRIC_HISTORY_LIMIT = 3600; // one hour at 1s resolution
const METRIC_SAMPLE_INTERVAL_MS = 1000;
const METRIC_HISTORY_WINDOW_MS = METRIC_HISTORY_LIMIT * METRIC_SAMPLE_INTERVAL_MS;

let lastNetworkSnapshot: NetworkSnapshot | null = null;
let lastCpuSnapshot: CpuSnapshot | null = null;
let latestNetworkUsage: NetworkUsageMetrics | null = null;
let latestRequestUsage: RequestUsageMetrics | null = null;
const metricHistory: MetricHistorySample[] = [];
let metricsSamplerStarted = false;
const requestCounters: Map<string, number> = new Map();
let totalRequestsSinceLastSample = 0;
let lastRequestSampleTimestamp: number | null = null;
const requestEventSeenAt: Map<string, number> = new Map();

function cloneCpuTimes(cpus: os.CpuInfo[]): CpuTimes[] {
  return cpus.map(cpu => ({ ...cpu.times }));
}

function calculateCpuUsagePercent(now: number, cpus: os.CpuInfo[]): number | null {
  if (!cpus.length) {
    lastCpuSnapshot = null;
    return null;
  }

  if (!lastCpuSnapshot || lastCpuSnapshot.cores.length !== cpus.length) {
    lastCpuSnapshot = { timestamp: now, cores: cloneCpuTimes(cpus) };
    return null;
  }

  let idleDelta = 0;
  let totalDelta = 0;

  cpus.forEach((cpu, index) => {
    const previous = lastCpuSnapshot?.cores[index];
    if (!previous) {
      return;
    }

    const user = cpu.times.user - previous.user;
    const nice = cpu.times.nice - previous.nice;
    const sys = cpu.times.sys - previous.sys;
    const idle = cpu.times.idle - previous.idle;
    const irq = cpu.times.irq - previous.irq;
    const total = user + nice + sys + idle + irq;

    if (total > 0) {
      totalDelta += total;
      idleDelta += idle;
    }
  });

  lastCpuSnapshot = { timestamp: now, cores: cloneCpuTimes(cpus) };

  if (totalDelta <= 0) {
    return null;
  }

  const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
  return Math.min(Math.max(usage, 0), 100);
}

function readNetworkTotals(): { rxBytes: number; txBytes: number } | null {
  try {
    const contents = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = contents.trim().split('\n').slice(2);

    let rxBytes = 0;
    let txBytes = 0;
    let hasData = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const [ifaceName, stats] = line.split(':');
      if (!stats) {
        continue;
      }

      const interfaceName = ifaceName.trim();
      if (!interfaceName || interfaceName === 'lo') {
        continue;
      }

      const fields = stats.trim().split(/\s+/);
      if (fields.length < 16) {
        continue;
      }

      const ifaceRx = Number(fields[0]);
      const ifaceTx = Number(fields[8]);

      if (Number.isFinite(ifaceRx)) {
        rxBytes += ifaceRx;
        hasData = true;
      }

      if (Number.isFinite(ifaceTx)) {
        txBytes += ifaceTx;
        hasData = true;
      }
    }

    if (!hasData) {
      return null;
    }

    return { rxBytes, txBytes };
  } catch (error) {
    return null;
  }
}

function recordMetricSample() {
  const now = Date.now();
  const cpus = os.cpus();
  const cpuUsagePercent = calculateCpuUsagePercent(now, cpus);
  const totalSystemMemory = os.totalmem();
  const freeSystemMemory = os.freemem();
  const usedSystemMemory = totalSystemMemory - freeSystemMemory;
  const processMemory = process.memoryUsage();

  const totals = readNetworkTotals();
  let receiveRate: number | null = null;
  let sendRate: number | null = null;

  if (totals) {
    if (lastNetworkSnapshot) {
      const elapsedSeconds = (now - lastNetworkSnapshot.timestamp) / 1000;
      if (elapsedSeconds > 0) {
        const rxDelta = totals.rxBytes - lastNetworkSnapshot.rxBytes;
        const txDelta = totals.txBytes - lastNetworkSnapshot.txBytes;

        if (rxDelta >= 0) {
          receiveRate = rxDelta / elapsedSeconds;
        }

        if (txDelta >= 0) {
          sendRate = txDelta / elapsedSeconds;
        }
      }
    }

    lastNetworkSnapshot = {
      timestamp: now,
      rxBytes: totals.rxBytes,
      txBytes: totals.txBytes
    };

    latestNetworkUsage = {
      bytesReceived: totals.rxBytes,
      bytesSent: totals.txBytes,
      receiveRate,
      sendRate,
      lastSampledAt: new Date(now).toISOString()
    };
  } else {
    latestNetworkUsage = null;
  }

  const staleEventCutoff = now - METRIC_HISTORY_WINDOW_MS;
  for (const [eventName, lastSeen] of requestEventSeenAt.entries()) {
    if (lastSeen < staleEventCutoff) {
      requestEventSeenAt.delete(eventName);
      requestCounters.delete(eventName);
    }
  }

  let requestRatesByEvent: Record<string, number> | null = null;
  let requestTotalRate: number | null = null;

  if (lastRequestSampleTimestamp !== null) {
    const elapsedSeconds = (now - lastRequestSampleTimestamp) / 1000;
    const safeElapsed = elapsedSeconds > 0 ? elapsedSeconds : 1;

    requestRatesByEvent = {};
    for (const eventName of requestEventSeenAt.keys()) {
      const count = requestCounters.get(eventName) ?? 0;
      requestRatesByEvent[eventName] = count / safeElapsed;
    }

    requestTotalRate = totalRequestsSinceLastSample / safeElapsed;
    latestRequestUsage = {
      totalRate: requestTotalRate,
      perEventRates: { ...requestRatesByEvent },
      lastSampledAt: new Date(now).toISOString()
    };
  }

  lastRequestSampleTimestamp = now;
  requestCounters.clear();
  totalRequestsSinceLastSample = 0;

  metricHistory.push({
    timestamp: now,
    cpuUsagePercent,
    systemMemoryUsedBytes: usedSystemMemory,
    totalSystemMemoryBytes: totalSystemMemory,
    processMemoryRssBytes: processMemory.rss,
    processHeapUsedBytes: processMemory.heapUsed,
    networkReceiveRateBytes: receiveRate,
    networkSendRateBytes: sendRate,
    socketRequestTotalRate: requestTotalRate,
    socketRequestRatesByEvent: requestRatesByEvent ? { ...requestRatesByEvent } : null
  });

  if (metricHistory.length > METRIC_HISTORY_LIMIT) {
    metricHistory.splice(0, metricHistory.length - METRIC_HISTORY_LIMIT);
  }
}

function ensureMetricsSampler() {
  if (metricsSamplerStarted) {
    return;
  }

  metricsSamplerStarted = true;
  recordMetricSample();
  setInterval(recordMetricSample, METRIC_SAMPLE_INTERVAL_MS);
}

function getNetworkUsageMetrics(): NetworkUsageMetrics | null {
  return latestNetworkUsage;
}

function getRequestUsageMetrics(): RequestUsageMetrics | null {
  return latestRequestUsage
    ? {
        totalRate: latestRequestUsage.totalRate,
        perEventRates: { ...latestRequestUsage.perEventRates },
        lastSampledAt: latestRequestUsage.lastSampledAt
      }
    : null;
}

export function recordSocketEvent(eventName: string | symbol): void {
  if (typeof eventName !== 'string') {
    return;
  }

  requestEventSeenAt.set(eventName, Date.now());
  requestCounters.set(eventName, (requestCounters.get(eventName) ?? 0) + 1);
  totalRequestsSinceLastSample += 1;
}

export function createAdminRouter(games: Map<string, Game>, io: Server, cleanupService?: any) {
  const router = Router();

  ensureMetricsSampler();

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
      createdAt: game.startedAt ? new Date(game.startedAt).toISOString() : new Date().toISOString(),
      lastActivityAt: game.lastActivityAt
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

  router.get('/system/metrics', requireAdmin, (_req: Request, res: Response) => {
    const processMemory = process.memoryUsage();
    const totalSystemMemory = os.totalmem();
    const freeSystemMemory = os.freemem();
    const usedSystemMemory = totalSystemMemory - freeSystemMemory;
    const cpus = os.cpus();
    const primaryCpu = cpus[0];
    const networkUsage = getNetworkUsageMetrics();
    const requestUsage = getRequestUsageMetrics();

    res.json({
      metrics: {
        generatedAt: new Date().toISOString(),
        uptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        cpu: {
          coreCount: cpus.length,
          model: primaryCpu?.model ?? 'Unknown',
          speed: primaryCpu?.speed ?? 0,
          loadAverage: os.loadavg()
        },
        memory: {
          totalSystem: totalSystemMemory,
          freeSystem: freeSystemMemory,
          usedSystem: usedSystemMemory
        },
        processMemory: {
          rss: processMemory.rss,
          heapTotal: processMemory.heapTotal,
          heapUsed: processMemory.heapUsed,
          external: processMemory.external,
          arrayBuffers: processMemory.arrayBuffers
        },
        network: networkUsage,
        requests: requestUsage
      },
      history: {
        intervalSeconds: METRIC_SAMPLE_INTERVAL_MS / 1000,
        sampleCount: metricHistory.length,
        samples: metricHistory.map(sample => ({
          timestamp: sample.timestamp,
          cpuUsagePercent: sample.cpuUsagePercent,
          systemMemoryUsedBytes: sample.systemMemoryUsedBytes,
          totalSystemMemoryBytes: sample.totalSystemMemoryBytes,
          processMemoryRssBytes: sample.processMemoryRssBytes,
          processHeapUsedBytes: sample.processHeapUsedBytes,
          networkReceiveRateBytes: sample.networkReceiveRateBytes,
          networkSendRateBytes: sample.networkSendRateBytes,
          socketRequestTotalRate: sample.socketRequestTotalRate,
          socketRequestRatesByEvent: sample.socketRequestRatesByEvent ? { ...sample.socketRequestRatesByEvent } : null
        }))
      }
    });
  });

  return router;
}
