# Playing with Trained AI Models

This guide explains how to use your trained Catan AI models in real games.

## Quick Start

### 1. Find Your Best Model

After training, find your best model:

```bash
npm run find-best-model
```

This will show you:
- All available trained models
- The latest model (usually best)
- Performance statistics if available
- Command to use the model

### 2. Join a Game

To have your AI bot join an existing game:

```bash
npm run play <gameId> <password> [modelPath] [botName]
```

**Examples:**

```bash
# Join a game with the latest trained model
npm run play abc123 mypassword ./checkpoints/model_cycle_100

# Join with a custom bot name
npm run play abc123 mypassword ./checkpoints/model_cycle_100 "MasterBot"

# Join with untrained model (random play)
npm run play abc123 mypassword
```

### 3. The Bot Will:
- ✅ Connect to the server
- ✅ Join the specified game
- ✅ Play automatically using the trained policy
- ✅ Continue until the game ends or you press Ctrl+C

## Advanced Usage

### Environment Variables

You can customize behavior with environment variables:

```bash
# Use a different server
SERVER_URL=http://localhost:3000 npm run play abc123 mypass

# Adjust exploration (0.0 = deterministic, 1.0 = exploratory)
TEMPERATURE=0.3 npm run play abc123 mypass ./checkpoints/model_cycle_100
```

### Temperature Setting

The `temperature` parameter controls how the AI plays:

- **0.0 - 0.3**: Very deterministic, always picks best action (competitive)
- **0.5 - 0.7**: Balanced (default: 0.5)
- **0.8 - 1.0**: More exploratory, tries different strategies
- **> 1.0**: Very random, useful for testing

Example:
```bash
TEMPERATURE=0.2 npm run play abc123 mypass ./checkpoints/best_model "CompetitiveBot"
```

## Model Selection

### Which model to use?

1. **Latest Model** (recommended for most cases)
   - Most trained
   - Best overall performance
   - Use: `./checkpoints/model_cycle_<highest_number>`

2. **Best Win Rate Model**
   - Check training logs to find cycle with best win rate
   - Run `npm run find-best-model` to see stats
   - May be an earlier cycle if training plateaued

3. **Specific Cycle**
   - If you know a specific cycle performed well
   - Use: `./checkpoints/model_cycle_<number>`

### Model Paths

Models are saved in the `checkpoints/` directory with names like:
- `model_cycle_10/`
- `model_cycle_20/`
- `model_cycle_50/`
- etc.

Each directory contains the full model that can be loaded.

## Creating Games for AI to Join

You can create a game through the web interface and then have your AI join:

1. Open browser to `http://localhost:3000`
2. Create a new game with a password
3. Note the Game ID (shown in URL or game lobby)
4. Run: `npm run play <gameId> <password> ./checkpoints/model_cycle_100`

## Multiple AI Bots

To have multiple AI bots play together:

```bash
# Terminal 1
npm run play abc123 mypass ./checkpoints/model_cycle_100 "Bot1"

# Terminal 2
npm run play abc123 mypass ./checkpoints/model_cycle_100 "Bot2"

# Terminal 3
npm run play abc123 mypass ./checkpoints/model_cycle_100 "Bot3"
```

## Troubleshooting

### "Model path does not exist"
- Run `npm run find-best-model` to see available models
- Make sure you've trained at least one model first

### "Failed to join game"
- Check that the game ID is correct
- Verify the password matches
- Ensure the game hasn't started yet (if it requires players to join before start)
- Make sure the server is running

### Bot doesn't take actions
- Check server logs for errors
- Ensure the game has actually started
- Try with `TEMPERATURE=1.0` to see if it's just being too cautious

### Connection errors
- Make sure the Catan server is running: `npm start` (in main directory)
- Check SERVER_URL matches your server location

## Performance Tips

### For Competitive Play
Use lower temperature and the latest model:
```bash
TEMPERATURE=0.2 npm run play abc123 mypass ./checkpoints/model_cycle_100
```

### For Fun/Variety
Use higher temperature:
```bash
TEMPERATURE=0.8 npm run play abc123 mypass ./checkpoints/model_cycle_50
```

### For Testing
Use untrained model to see baseline:
```bash
npm run play abc123 mypass
```

## Model Management

### Saving Best Models

After training, you might want to preserve your best model:

```bash
# Copy best model to a named location
cp -r ./checkpoints/model_cycle_100 ./checkpoints/best_model

# Use it
npm run play abc123 mypass ./checkpoints/best_model
```

### Disk Space

Models can take up space. To clean up old models:

```bash
# Remove old cycles, keep every 10th
rm -rf ./checkpoints/model_cycle_{1..9}
rm -rf ./checkpoints/model_cycle_{11..19}
# etc.
```

## Integration with Web UI

You can modify the web UI to have an "Add AI Bot" button that automatically runs this command server-side. The bot would need to:

1. Receive game ID and password via API
2. Spawn a process running `play-game.ts`
3. Monitor the process until game ends

This would require additional server-side integration.

## Next Steps

- Train more cycles for better performance
- Experiment with different temperature settings
- Try multiple bots against each other
- Compare different checkpoint cycles to see which plays best
