# Catan Online

A web-based multiplayer implementation of the classic board game Settlers of Catan, built with Node.js, Express, Socket.IO, and Redis for real-time gameplay.

## Features

- **Real-time Multiplayer**: Play with 2-4 players using WebSocket connections
- **Complete Game Mechanics**:
  - Initial settlement and road placement
  - Resource production based on dice rolls
  - Building settlements, cities, and roads
  - Development cards (Knight, Year of Plenty, Monopoly, Road Building, Victory Points)
  - Player trading and bank trading
  - Robber mechanics with discarding and stealing
  - Longest Road and Largest Army bonuses
  - Port trading (3:1 and 2:1)
- **Game State Persistence**: Redis caching for game state management
- **Interactive UI**: Canvas-based board rendering with real-time updates

## Tech Stack

### Backend
- **Node.js** with **TypeScript**
- **Express.js** for HTTP server
- **Socket.IO** for real-time bidirectional communication
- **Redis** for game state caching and persistence

### Frontend
- Vanilla JavaScript
- HTML5 Canvas for game board rendering
- CSS3 for styling

### Infrastructure
- **Podman/Docker Compose** for containerized Redis deployment

## Project Structure

```
catan/
├── server/               # Backend TypeScript source files
│   ├── index.ts         # Server entry point with Express and Socket.IO setup
│   ├── game.ts          # Core game logic and state management
│   ├── types.ts         # TypeScript type definitions
│   ├── socketHandlers.ts # Socket.IO event handlers
│   ├── boardGenerator.ts # Procedural board generation
│   ├── buildingManager.ts # Settlement, city, and road placement logic
│   ├── playerManager.ts  # Player state and victory point calculations
│   ├── tradeManager.ts   # Player and bank trading logic
│   ├── developmentCardManager.ts # Development card mechanics
│   ├── robberManager.ts  # Robber, discarding, and stealing mechanics
│   ├── cache.ts          # Redis cache wrapper
│   └── utils.ts          # Utility functions
├── public/              # Frontend static files
│   ├── index.html       # Main HTML file
│   ├── css/             # Stylesheets
│   └── js/              # Client-side JavaScript
│       ├── client.js    # Socket.IO client and game state management
│       └── renderer.js  # Canvas rendering logic
├── dist/                # Compiled JavaScript output
├── package.json         # Project dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── podman-compose.yml   # Redis container configuration

```

## Installation

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- Podman or Docker (for Redis)

### Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd catan
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Redis** (using Podman Compose):
   ```bash
   podman-compose up -d
   ```

   Or using Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. **Build the TypeScript code**:
   ```bash
   npm run build
   ```

5. **Start the server**:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

6. **Access the game**:
   Open your browser and navigate to `http://localhost:3000`

## Usage

### Creating a Game

1. Enter your name in the main menu
2. Click "Create New Game"
3. Share the generated Game ID with other players
4. Wait for players to join (2-4 players)
5. Click "Start Game" when ready

### Joining a Game

1. Enter your name in the main menu
2. Enter the Game ID provided by the host
3. Click "Join Game"
4. Wait for the host to start the game

### Gameplay

The game follows standard Catan rules:

1. **Setup Phase**: Players take turns placing two settlements and two roads
2. **Playing Phase**:
   - Roll dice to collect resources
   - Build settlements, cities, and roads
   - Trade with other players or the bank
   - Buy and play development cards
   - First player to reach 10 victory points wins

## NPM Scripts

- `npm start` - Run the compiled production server
- `npm run dev` - Run the development server with ts-node
- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode for TypeScript compilation

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)

### Redis Configuration

The Redis connection is configured in `server/cache.ts`. By default, it connects to `localhost:6379`.

## Game Rules Implementation

This implementation includes:

- Standard Catan board with 19 hexes
- Resource generation (wood, brick, sheep, wheat, ore)
- Building costs and placement rules
- Development card deck with proper distribution
- Robber mechanics (7 rolled, discard half if >7 cards)
- Trading system (player-to-player and bank)
- Port trading with 3:1 and 2:1 rates
- Longest Road (5+ roads)
- Largest Army (3+ knights)
- Victory point calculation

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

ISC
