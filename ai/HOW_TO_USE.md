# How to Use Your Trained AI

## Simple 3-Step Process

### Step 1: Find Your Best Model

```bash
npm run find-best-model
```

This will show you all your trained models and recommend the best one.

Example output:
```
Found 10 trained models:

1. Cycle 100    (2.3 MB)
   ./checkpoints/model_cycle_100

✨ Latest Model (recommended): Cycle 100
   ./checkpoints/model_cycle_100
```

### Step 2: Create a Game

1. Open your browser to `http://localhost:3000`
2. Click "Create Game"
3. Set a password
4. **Note the Game ID** (shown in the URL or lobby)

Example: Game ID might be `abc123`

### Step 3: Have Your AI Join the Game

```bash
npm run play <gameId> <password> <modelPath>
```

**Example:**
```bash
npm run play abc123 mypassword ./checkpoints/model_cycle_100
```

That's it! Your AI will automatically:
- ✅ Connect to the server
- ✅ Join the game
- ✅ Play using the trained model
- ✅ Continue until the game ends

---

## Quick Examples

### Example 1: Basic Usage
```bash
# Find best model
npm run find-best-model

# Use it in a game
npm run play abc123 mypass ./checkpoints/model_cycle_100
```

### Example 2: With Custom Bot Name
```bash
npm run play abc123 mypass ./checkpoints/model_cycle_100 "MasterBot"
```

### Example 3: Competitive Mode (More Deterministic)
```bash
TEMPERATURE=0.2 npm run play abc123 mypass ./checkpoints/model_cycle_100
```

### Example 4: Multiple AI Bots
Open multiple terminals and run:
```bash
# Terminal 1
npm run play abc123 mypass ./checkpoints/model_cycle_100 "Bot1"

# Terminal 2
npm run play abc123 mypass ./checkpoints/model_cycle_100 "Bot2"

# Terminal 3
npm run play abc123 mypass ./checkpoints/model_cycle_100 "Bot3"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No models found" | Train a model first: `npm run train` |
| "Failed to join game" | Check the Game ID and password are correct |
| "Connection error" | Make sure server is running: `npm start` (in main directory) |
| Bot doesn't take actions | Verify the game has been started |

---

## That's All You Need!

For more advanced usage, see:
- `PLAY_GUIDE.md` - Detailed documentation
- `EXPORT_SUMMARY.md` - Deployment and integration guide
- `QUICK_START.md` - Command reference
