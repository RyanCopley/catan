# Quick Start Guide

## Training

Train your AI:
```bash
npm run train
```

## Using Your Trained AI

### Step 1: Find Best Model
```bash
npm run find-best-model
```

### Step 2: Use in a Game
```bash
npm run play <gameId> <password> <modelPath>
```

Example:
```bash
npm run play abc123 mypassword ./checkpoints/model_cycle_100
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run train` | Train the AI (runs 100 cycles) |
| `npm run find-best-model` | Show all models and recommend best |
| `npm run play <gameId> <pass> [model]` | Join a game with trained AI |
| `npm run build` | Build TypeScript to JavaScript |

## Game Flow

1. **Start Server** (in main catan directory):
   ```bash
   npm start
   ```

2. **Create Game** (in browser):
   - Open `http://localhost:3000`
   - Create a game with password
   - Note the Game ID

3. **Add AI Bot** (in ai directory):
   ```bash
   npm run play <gameId> <password> ./checkpoints/model_cycle_100
   ```

4. **Start Game** and watch your AI play!

## Tips

- **Competitive Play**: Use `TEMPERATURE=0.2` for more deterministic play
- **Multiple Bots**: Run the `play` command in multiple terminals
- **Latest = Best**: Usually the highest cycle number is the best model
- **Check Progress**: Training logs show win rates and performance

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No models found | Run `npm run train` first |
| Can't join game | Check Game ID and password |
| Bot doesn't move | Ensure game has started |
| Connection error | Start server with `npm start` |

For detailed information, see [PLAY_GUIDE.md](./PLAY_GUIDE.md)
