# Protocol Fixes - AI Bot Implementation

## Issues Found and Fixed

### 1. Socket Event Names
**Problem**: Using wrong event names (snake_case vs camelCase)

**Before**:
```typescript
socket.emit('create_game', ...)
socket.on('game_created', ...)
```

**After**:
```typescript
socket.emit('createGame', ...)
socket.on('gameCreated', ...)
```

**All Event Names**:
- `createGame` / `gameCreated`
- `joinGame` / `gameJoined`
- `startGame` / `gameStarted`
- `rollDice`
- `buildSettlement`, `buildRoad`, `buildCity`
- `buyDevCard`, `playKnight`
- `moveRobber`, `stealResource`
- `endTurn`
- `gameUpdate`

### 2. Missing Password Parameter
**Problem**: `createGame` requires a password

**Before**:
```typescript
socket.emit('createGame', { playerName: this.name });
```

**After**:
```typescript
const password = Math.random().toString(36).substring(7);
socket.emit('createGame', { playerName: this.name, password });
```

### 3. Missing gameId in All Events
**Problem**: Every action requires `gameId` parameter

**Before**:
```typescript
socket.emit('rollDice');
socket.emit('buildSettlement', { vertex });
```

**After**:
```typescript
socket.emit('rollDice', { gameId: this.gameId });
socket.emit('buildSettlement', { gameId: this.gameId, vertex });
```

### 4. Coordinate System Mismatch
**Problem**: Server uses `{x, y}` for vertices, not `{q, r, direction}`

**Server Types**:
```typescript
interface Vertex {
  x: number;
  y: number;
}

interface Edge {
  v1: { x: number; y: number };
  v2: { x: number; y: number };
}
```

**AI Internal Types** (for neural network):
```typescript
interface Vertex {
  q: number;  // Hex coordinate
  r: number;  // Hex coordinate
  direction: 'N' | 'S';
}
```

**Solution**: Convert coordinates before sending to server:
```typescript
private vertexToCoordinate(vertex: any): { x: number; y: number } {
  return { x: vertex.q, y: vertex.r };
}
```

### 5. Game State Structure
**Problem**: Server sends game state wrapped in object

**Server Response**:
```typescript
socket.emit('gameUpdate', { game: gameState });
```

**Fixed Handler**:
```typescript
socket.on('gameUpdate', (data: { game: GameState }) => {
  this.handleGameUpdate(data.game);
});
```

## Testing

Run connection test:
```bash
cd ai
npm run build
node dist/test-connection.js
```

Expected output:
```
=== Testing Bot Connection ===
Creating bot 1...
Bot 1 connected!

Creating game...
Game created: ABC123
Password: xyz789

Creating bot 2...
Bot 2 joined!

Creating bot 3...
Bot 3 joined!

Creating bot 4...
Bot 4 joined!

Starting game...
Game started!
```

## Coordinate Conversion Notes

The AI uses axial hex coordinates `(q, r)` internally for:
- Efficient neural network encoding
- Standard hex grid algorithms
- Spatial reasoning

The server uses Cartesian `(x, y)` coordinates for:
- Canvas rendering
- Client-side display
- Click detection

**Current conversion**: Simple mapping `{x: q, y: r}`

**TODO for production**: Implement proper hex-to-cartesian conversion based on server's coordinate system. This will require understanding the server's vertex layout.

## Running Training

Now that the protocol is fixed, you can run training:

```bash
# Terminal 1: Start Catan server
cd /var/home/bazzite/Desktop/catan
npm start

# Terminal 2: Start AI training
cd /var/home/bazzite/Desktop/catan/ai
npm run train
```

The bots will:
1. ✅ Connect to server
2. ✅ Create game with password
3. ✅ Join game (3 bots join host)
4. ✅ Start game
5. ✅ Receive game updates
6. 🔄 Take actions (being tested)
7. 🔄 Play full games
8. 🔄 Train on experiences

## Known Limitations

### Coordinate System
The current coordinate conversion is simplified. For production, you'll need to:

1. **Understand server's layout**: How does the server map `{x, y}` to the hex grid?
2. **Implement proper conversion**: Convert hex `(q, r)` coordinates to server's `(x, y)` system
3. **Handle edges correctly**: Edge conversion needs adjacent vertex calculation

**Where to look**:
- `server/coordinates.ts` - Server's coordinate utilities
- `public/js/renderer.js` - Client's rendering logic
- `server/boardGenerator.ts` - How board is laid out

### Action Validation
Currently relying on server to validate all actions. The AI's action masking is simplified and may suggest invalid moves that the server will reject.

**To improve**:
- Implement proper distance rule checking
- Implement proper road connectivity checking
- Match server's validation logic exactly

## Next Steps

1. **Test Full Game**: Let bots play a complete game
2. **Fix Coordinate System**: Implement proper hex-to-cartesian conversion
3. **Improve Action Masking**: Make AI's masking match server's validation
4. **Start Training**: Run training loop once games complete successfully
