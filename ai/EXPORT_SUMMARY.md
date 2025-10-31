# Exporting and Using Trained Models - Complete Guide

## Overview

Your trained Catan AI models can be easily exported and used in real games. This guide covers everything you need to know.

## What Gets Saved

When training completes, models are automatically saved to:
```
./checkpoints/model_cycle_<number>/
```

Each checkpoint contains:
- Neural network weights (TensorFlow format)
- Model architecture
- All parameters needed to load and run the bot

## Using Models in Real Games

### Method 1: Command Line (Recommended)

**Find Your Best Model:**
```bash
npm run find-best-model
```

**Join a Game:**
```bash
npm run play <gameId> <password> <modelPath> [botName]
```

**Full Example:**
```bash
# 1. Find best model
npm run find-best-model

# 2. Join game with that model
npm run play abc123 mypassword ./checkpoints/model_cycle_100 "SmartBot"
```

### Method 2: Shell Script (Easy)

```bash
./play-ai.sh abc123 mypassword ./checkpoints/model_cycle_100 "SmartBot"
```

### Method 3: Programmatic (Advanced)

```typescript
import { AIPlayer } from './bot/aiPlayer';
import { CatanNet } from './models/catanNet';

// Load model
const network = new CatanNet();
network.build(256, 3);
await network.load('./checkpoints/model_cycle_100');

// Create bot and join game
const bot = new AIPlayer(network, 'MyBot', 'http://localhost:3000');
await bot.waitForConnection();
await bot.joinGame('abc123', 'mypassword');
```

## Model Selection Strategies

### 1. Latest Model (Default)
```bash
# Usually the best option
npm run play gameId pass ./checkpoints/model_cycle_<highest_number>
```

**Pros:** Most training, best learned policy
**Cons:** May have overfitted if training went too long

### 2. Best Win Rate
```bash
# Check logs to find best performing cycle
npm run find-best-model  # Shows win rates
npm run play gameId pass ./checkpoints/model_cycle_<best_wr>
```

**Pros:** Empirically best performer
**Cons:** May have been lucky, smaller sample size

### 3. Middle Checkpoint
```bash
# Sometimes a middle cycle generalizes better
npm run play gameId pass ./checkpoints/model_cycle_50
```

**Pros:** More conservative, may generalize better
**Cons:** Less trained

## Configuration Options

### Temperature (Exploration vs Exploitation)

Controls how deterministic the AI plays:

```bash
# Very deterministic (competitive)
TEMPERATURE=0.1 npm run play gameId pass ./checkpoints/model_cycle_100

# Balanced (default)
TEMPERATURE=0.5 npm run play gameId pass ./checkpoints/model_cycle_100

# Exploratory (fun/varied)
TEMPERATURE=1.0 npm run play gameId pass ./checkpoints/model_cycle_100
```

**Temperature Guide:**
- `0.0 - 0.2`: Ruthlessly competitive, always picks best action
- `0.3 - 0.5`: Balanced competitive play (recommended for real games)
- `0.6 - 0.8`: More variety, tries different strategies
- `0.9 - 1.5`: Very exploratory, fun but suboptimal

### Server URL

```bash
# Connect to different server
SERVER_URL=http://192.168.1.100:3000 npm run play gameId pass ./checkpoints/model_cycle_100
```

## Deployment Scenarios

### Scenario 1: Local Play Against AI

```bash
# Terminal 1: Start server
cd /var/home/bazzite/Desktop/catan
npm start

# Terminal 2: Create game in browser
# Open http://localhost:3000
# Create game, note ID

# Terminal 3: Add AI
cd /var/home/bazzite/Desktop/catan/ai
npm run play <gameId> <password> ./checkpoints/model_cycle_100
```

### Scenario 2: Multiple AI Bots

```bash
# Start server (terminal 1)
npm start

# Add 3 AI bots (terminals 2-4)
npm run play gameId pass ./checkpoints/model_cycle_100 "Bot1"
npm run play gameId pass ./checkpoints/model_cycle_100 "Bot2"
npm run play gameId pass ./checkpoints/model_cycle_100 "Bot3"

# You join as 4th player via browser
```

### Scenario 3: Remote Deployment

For a server that hosts AI bots:

1. **Copy Model to Server:**
```bash
scp -r ./checkpoints/model_cycle_100 user@server:/path/to/ai/checkpoints/
```

2. **Run on Server:**
```bash
ssh user@server
cd /path/to/ai
npm run play gameId pass ./checkpoints/model_cycle_100
```

3. **Or use PM2 for persistence:**
```bash
pm2 start npm --name "catan-ai-bot" -- run play gameId pass ./checkpoints/model_cycle_100
```

### Scenario 4: Docker Deployment

Create `Dockerfile` in ai directory:
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["node", "dist/play-game.js"]
```

Build and run:
```bash
docker build -t catan-ai .
docker run -e GAME_ID=abc123 -e PASSWORD=pass catan-ai
```

## Model Management

### Backing Up Best Models

```bash
# Save your best model with a meaningful name
cp -r ./checkpoints/model_cycle_100 ./checkpoints/production_model_v1

# Archive it
tar -czf production_model_v1.tar.gz ./checkpoints/production_model_v1

# Use it later
npm run play gameId pass ./checkpoints/production_model_v1
```

### Version Control

**Don't commit models to git** (they're large). Instead:

1. Add to `.gitignore`:
```
checkpoints/
*.tar.gz
```

2. Store separately (S3, Google Drive, etc.)

3. Document model versions in a registry:
```
# models_registry.md
- v1.0: model_cycle_100 - Initial release (50% WR)
- v1.1: model_cycle_150 - Improved (65% WR)
- v2.0: model_cycle_200 - Major improvement (75% WR)
```

### Cleaning Up Old Models

```bash
# Keep only every 10th checkpoint
for i in {1..99}; do
  if [ $((i % 10)) -ne 0 ]; then
    rm -rf ./checkpoints/model_cycle_$i
  fi
done

# Or keep only the last 5
ls -t ./checkpoints/ | tail -n +6 | xargs -I {} rm -rf ./checkpoints/{}
```

## Integration with Web UI (Advanced)

To add an "Add AI Bot" button to your web UI:

### Backend API Endpoint

```typescript
// server/routes/ai.ts
app.post('/api/games/:gameId/add-ai', async (req, res) => {
  const { gameId } = req.params;
  const { password, modelPath = 'default' } = req.body;

  // Spawn AI process
  const child = spawn('npm', [
    'run', 'play', gameId, password, modelPath
  ], {
    cwd: path.join(__dirname, '../../ai'),
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  res.json({ success: true, botId: child.pid });
});
```

### Frontend Button

```javascript
async function addAIBot() {
  const response = await fetch(`/api/games/${gameId}/add-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: gamePassword,
      modelPath: './checkpoints/model_cycle_100'
    })
  });

  if (response.ok) {
    alert('AI Bot joined the game!');
  }
}
```

## Performance Considerations

### Model Loading Time

- First load: ~1-2 seconds (loads weights)
- Subsequent predictions: <10ms per action
- Total latency per turn: ~50-200ms

### Resource Usage

- Memory: ~100-300MB per bot instance
- CPU: ~5-10% during play
- Network: Minimal (Socket.IO events only)

### Scaling

For multiple concurrent bots:
- 10 bots: ~1-3GB RAM, low CPU
- 50 bots: ~5-15GB RAM, moderate CPU
- Consider load balancing for 100+ bots

## Troubleshooting

### Model Won't Load

```bash
# Check model exists
ls -la ./checkpoints/model_cycle_100

# Verify model structure (should have model.json and weights)
ls -la ./checkpoints/model_cycle_100/

# Try absolute path
npm run play gameId pass $(pwd)/checkpoints/model_cycle_100
```

### Bot Joins But Doesn't Play

- Verify game has started
- Check temperature isn't 0.0 (add TEMPERATURE=0.5)
- Look at server logs for errors
- Try with a different model

### Connection Issues

```bash
# Test connection manually
curl http://localhost:3000

# Check if server is running
lsof -i :3000

# Try explicit server URL
SERVER_URL=http://localhost:3000 npm run play gameId pass model
```

### Performance Issues

```bash
# Reduce model complexity for faster inference
# Edit config/training.config.ts:
# - hiddenSize: 128 (instead of 256)
# - numLayers: 2 (instead of 3)

# Or use CPU-optimized TensorFlow
npm install @tensorflow/tfjs-node
```

## Best Practices

1. **Always test models before deployment**
   ```bash
   # Test in a private game first
   npm run play test-game testpass ./checkpoints/new_model
   ```

2. **Use appropriate temperature**
   - Competitive games: 0.2-0.3
   - Casual games: 0.5-0.7
   - Testing: 1.0+

3. **Monitor bot behavior**
   - Watch first few games
   - Check for strange behavior
   - Verify it follows rules correctly

4. **Keep training logs**
   ```bash
   # Save logs with models
   cp training_log.json ./checkpoints/model_cycle_100/
   ```

5. **Version your models**
   - Use meaningful names
   - Document performance
   - Keep metadata

## Next Steps

- ✅ Train multiple models with different configs
- ✅ A/B test different checkpoints
- ✅ Create a model registry
- ✅ Set up automated deployment
- ✅ Add model evaluation metrics
- ✅ Create a leaderboard of model performance

## Support

For issues or questions:
1. Check `PLAY_GUIDE.md` for detailed usage
2. Check `QUICK_START.md` for common commands
3. Review training logs for model performance
4. Test with `TEMPERATURE=1.0` for debugging
