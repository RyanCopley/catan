# CLAUDE.md - Developer Guide

This document provides technical context for AI assistants (like Claude) and developers working on the Catan Online project.

## Project Overview

This is a full-stack web implementation of Settlers of Catan with real-time multiplayer functionality. The backend is written in TypeScript using Node.js, Express, and Socket.IO, while the frontend uses vanilla JavaScript with HTML5 Canvas for rendering.

## Architecture

### Backend Architecture

The server follows a modular architecture with separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     Socket.IO Server                         │
│                   (server/index.ts)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Socket Handlers                             │
│              (server/socketHandlers.ts)                      │
│   - Connection management                                    │
│   - Event routing                                            │
│   - Game creation/joining                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Game Class                                │
│                  (server/game.ts)                            │
│   - Game state management                                    │
│   - Turn phase control                                       │
│   - Player action validation                                 │
│   - Coordinates manager calls                                │
└─────────┬──────────┬──────────┬───────────┬────────────┬────┘
          │          │          │           │            │
          ▼          ▼          ▼           ▼            ▼
┌─────────────┬──────────┬─────────┬────────────┬──────────────┐
│ Building    │ Player   │ Trade   │ Dev Card   │ Robber       │
│ Manager     │ Manager  │ Manager │ Manager    │ Manager      │
└─────────────┴──────────┴─────────┴────────────┴──────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis Cache                               │
│                  (server/cache.ts)                           │
│   - Game state persistence                                   │
│   - Session management                                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Manager Pattern**: Domain logic is separated into specialized managers:
   - `buildingManager.ts`: Handles settlement, city, and road placement validation and construction
   - `playerManager.ts`: Player creation and victory point calculation
   - `tradeManager.ts`: Trade offer creation, validation, and execution
   - `developmentCardManager.ts`: Card deck management and card effect implementation
   - `robberManager.ts`: Robber movement, discarding, and resource stealing

2. **State Machine**: The game uses a two-level state machine:
   - `GamePhase`: `waiting` → `setup` → `playing` → `finished`
   - `TurnPhase`: `roll` → `robber` (if 7) → `build` → next player

3. **Event-Driven Communication**: Socket.IO events drive all game actions with clear request/response patterns

## Core Components

### server/game.ts

The `Game` class is the central state manager. Key responsibilities:

- **Player Management**: Adding players, reconnection handling
- **Game Lifecycle**: Starting games, managing phases, checking win conditions
- **Action Validation**: Ensuring players can only perform valid actions during their turn
- **State Distribution**: Providing game state to clients via `getState()`

Important methods:
- `rollDice()`: Handles dice rolling and resource distribution (server/game.ts:90)
- `buildSettlement()`: Validates and places settlements (server/game.ts:139)
- `buildRoad()`: Validates and places roads (server/game.ts:158)
- `buildCity()`: Validates and upgrades settlements to cities (server/game.ts:198)
- `endTurn()`: Advances game state to next player (server/game.ts:406)

### server/boardGenerator.ts

Generates a random Catan board with proper constraints:
- 19 hexes in hexagonal layout
- Randomized terrain distribution (4 forests, 4 fields, 4 pastures, 3 mountains, 3 hills, 1 desert)
- Number tokens (excluding 2, 12, and 7) distributed to maximize balance
- Port placement at board edges

### server/buildingManager.ts

Handles all building placement logic:

**Settlement Rules** (server/buildingManager.ts:8-72):
- Distance rule: No settlements within 2 edges of another settlement
- Connectivity: Must be connected to player's road (except setup phase)
- Resource costs: 1 wood, 1 brick, 1 sheep, 1 wheat

**City Rules** (server/buildingManager.ts:74-113):
- Must upgrade existing settlement
- Resource costs: 3 ore, 2 wheat

**Road Rules** (server/buildingManager.ts:115-177):
- Must connect to existing road or settlement
- Resource costs: 1 wood, 1 brick

**Longest Road Calculation** (server/buildingManager.ts:179-264):
- DFS algorithm to find longest continuous path
- Minimum 5 roads required
- Handles branching roads correctly

### server/tradeManager.ts

Manages all trading mechanics:

**Player Trading**:
- Trade offers can target specific players or be broadcast to all
- Players can accept/reject offers
- Offering player confirms which acceptance to execute
- Validates resource availability before execution

**Bank Trading** (server/tradeManager.ts:173-238):
- 4:1 default ratio
- 3:1 for generic ports
- 2:1 for resource-specific ports
- Port detection based on settlement locations

### server/developmentCardManager.ts

Development card system:

**Card Distribution**:
- 14 Knights
- 5 Victory Points
- 2 Road Building
- 2 Monopoly
- 2 Year of Plenty

**Card Mechanics**:
- Cards drawn cannot be played same turn (stored in `newDevelopmentCards`)
- One development card per turn (except Victory Points)
- Cards moved to playable hand at turn end

### server/robberManager.ts

Robber and discard mechanics:

**When 7 is Rolled**:
1. Players with >7 cards must discard half (rounded down)
2. All discards processed before robber moves
3. Current player moves robber to new hex
4. Optionally steal from adjacent player

**Knight Card**: Same as rolling 7, but can be played during build phase

### server/types.ts

Complete TypeScript type definitions for game state, ensuring type safety across the codebase.

## Client-Side Architecture

### public/js/client.js

Handles:
- Socket.IO connection and event handling
- UI state management (menu, lobby, game screens)
- User input collection and validation
- Game state updates from server
- Trade UI and development card UI

### public/js/renderer.js

Canvas rendering engine:
- Hexagonal grid rendering using axial coordinates
- Vertex and edge detection for building placement
- Visual feedback for valid/invalid placements
- Player color coding
- Robber visualization

## Data Flow

### Typical Turn Flow

1. **Roll Phase**:
   ```
   Client: roll_dice event
   Server: validates turn, rolls dice, distributes resources
   Server: broadcasts game_update to all clients
   ```

2. **Build Phase**:
   ```
   Client: build_settlement/build_road/build_city event
   Server: validates resources, placement rules
   Server: updates game state, deducts resources
   Server: broadcasts game_update to all clients
   ```

3. **End Turn**:
   ```
   Client: end_turn event
   Server: validates setup completion (if setup phase)
   Server: advances to next player
   Server: checks win condition
   Server: broadcasts game_update to all clients
   ```

## State Synchronization

Game state is fully authoritative on the server. The client:
- Sends action requests
- Receives full state updates via `game_update` events
- Never modifies state directly
- Renders based on received state

## Redis Integration

The `gameCache` (server/cache.ts) provides:
- Persistent game state storage
- Session management for reconnection
- Currently implements connection wrapper; state persistence can be extended

## Common Development Tasks

### Adding a New Building Type

1. Add type to `BuildingType` in `server/types.ts`
2. Add cost constants to `buildingManager.ts`
3. Implement validation function in `buildingManager.ts`
4. Add method to `Game` class in `server/game.ts`
5. Add socket event handler in `server/socketHandlers.ts`
6. Update client rendering in `public/js/renderer.js`
7. Add UI controls in `public/js/client.js`

### Adding a New Development Card

1. Add type to `DevelopmentCardType` in `server/types.ts`
2. Update card distribution in `developmentCardManager.ts` constructor
3. Implement play logic in `developmentCardManager.ts`
4. Add method to `Game` class for playing the card
5. Add socket event handler
6. Add client UI for card selection and playing

### Modifying Game Rules

Most game rules are centralized:
- Victory point requirements: `server/game.ts:422`
- Building costs: `server/buildingManager.ts` constants
- Resource distribution: `server/game.ts:110`
- Development card distribution: `server/developmentCardManager.ts:14`

## Testing Considerations

When testing, consider:
- Turn order enforcement (server/game.ts validates currentPlayerIndex)
- Phase transitions (setup → playing transitions)
- Resource validation (all managers check resource availability)
- Edge cases in building placement (distance rules, connectivity)
- Trade validation (resource availability, offer lifecycle)
- Reconnection handling (socket ID updates throughout state)

## Known Limitations

- No AI players
- No game persistence beyond Redis cache
- No spectator mode
- No game replay functionality
- No chat system
- Limited mobile/touch support

## Code Style Notes

- TypeScript strict mode enabled
- Functional programming preferred in managers
- Pure functions for calculations where possible
- Game class methods handle state mutations
- Clear separation between validation and execution

## Socket.IO Events Reference

**Client → Server**:
- `create_game`: Create new game session
- `join_game`: Join existing game by ID
- `start_game`: Begin game from lobby
- `roll_dice`: Roll dice during turn
- `build_settlement`: Place settlement
- `build_road`: Place road
- `build_city`: Upgrade settlement to city
- `end_turn`: Complete current turn
- `trade_offer`: Create trade offer
- `trade_response`: Accept/reject trade
- `confirm_trade`: Execute accepted trade
- `bank_trade`: Trade with bank
- `buy_dev_card`: Purchase development card
- `play_knight`: Play knight card
- `play_year_of_plenty`: Play Year of Plenty card
- `play_monopoly`: Play Monopoly card
- `play_road_building`: Play Road Building card
- `move_robber`: Move robber to hex
- `steal_card`: Steal from player
- `discard_cards`: Discard resources when >7 cards

**Server → Client**:
- `game_created`: New game created with ID
- `game_joined`: Successfully joined game
- `game_started`: Game has begun
- `game_update`: Full game state update
- `error`: Error message for failed action

## Performance Considerations

- Game state broadcasts are full state (consider delta updates for optimization)
- Canvas redraws on every state update (could implement dirty checking)
- No game state compression (consider for large player counts)
- Redis used for persistence but not required for operation

## Future Enhancement Ideas

- Game state delta updates instead of full state
- Undo/redo functionality
- Game history/replay
- Statistics tracking
- Tournaments/ladders
- Custom board configurations
- Expansions (Cities & Knights, Seafarers)
- Mobile-optimized UI
- Sound effects and animations
