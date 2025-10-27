# Catan Online

A web-based multiplayer implementation of the popular board game Catan, built with Node.js and Socket.IO.

## Features

- Real-time multiplayer gameplay (2-4 players)
- Hexagonal board generation with randomized tiles and numbers
- Settlement, road, and city building mechanics
- Dice rolling and resource distribution
- Turn-based gameplay with setup phase
- Victory point tracking (first to 10 wins)
- Longest road calculation
- Interactive canvas-based game board
- Responsive UI with player status tracking

## Installation

1. Make sure you have Node.js installed (v14 or higher recommended)

2. Install dependencies:
```bash
npm install
```

## Running the Game

Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

Open your web browser and navigate to `http://localhost:3000`

## How to Play

### Creating/Joining a Game

1. Enter your name on the main menu
2. Click "Create New Game" to start a new game, or enter a Game ID to join an existing game
3. Share the Game ID with other players (displayed in the lobby)
4. Once 2-4 players have joined, the first player can click "Start Game"

### Setup Phase

1. Players take turns placing their first settlement and road
2. After all players have placed, the order reverses for the second settlement and road
3. The second settlement gives you starting resources from adjacent tiles

### Playing the Game

**On Your Turn:**

1. **Roll Dice**: Click "Roll Dice" to roll two dice
   - If the total matches a number token, all settlements/cities adjacent to that hex receive resources
   - If you roll a 7, the robber activates (players with >7 cards must discard half)

2. **Build Phase**: After rolling, you can:
   - **Build Settlement** (costs: 1 Wood, 1 Brick, 1 Sheep, 1 Wheat)
     - Must be at least 2 edges away from any other settlement
     - Must be connected to your road network
     - Worth 1 victory point

   - **Build Road** (costs: 1 Wood, 1 Brick)
     - Must connect to your existing roads or settlements
     - Build 5+ roads for longest road bonus (2 victory points)

   - **Build City** (costs: 2 Wheat, 3 Ore)
     - Upgrade an existing settlement to a city
     - Cities produce 2 resources instead of 1
     - Worth 1 additional victory point (2 total)

3. **End Turn**: Click "End Turn" to pass to the next player

### Winning the Game

First player to reach 10 victory points wins!

**Victory Points:**
- Each settlement: 1 point
- Each city: 2 points
- Longest road (5+ roads): 2 points

## Game Controls

- **Building**: Click the build button, then click on the board where you want to place
  - Settlements/Cities: Click on vertex points (corners where hexes meet)
  - Roads: Click on edges (between two vertices)
- **Hover**: Hover over valid locations to see highlighted placement options
- **Cancel**: Click "End Turn" or another build button to cancel current selection

## Technical Details

### Backend (Node.js)
- Express server for serving static files
- Socket.IO for real-time multiplayer communication
- Game state management with hexagonal coordinate system
- Resource distribution and building validation logic

### Frontend
- Vanilla JavaScript (no frameworks)
- HTML5 Canvas for board rendering
- Real-time UI updates via WebSocket
- Responsive design with CSS Grid/Flexbox

### Project Structure
```
catan/
├── server/
│   ├── index.js      # Express + Socket.IO server
│   └── game.js       # Game logic and state management
├── public/
│   ├── index.html    # Main HTML file
│   ├── css/
│   │   └── style.css # Styles
│   └── js/
│       ├── client.js    # Client-side game logic
│       └── renderer.js  # Canvas rendering
├── package.json
└── README.md
```

## Future Enhancements

- Development cards (Knight, Victory Point, Road Building, etc.)
- Player-to-player trading
- Maritime trade (ports with 3:1 or 2:1 ratios)
- Robber movement and stealing
- Improved longest road calculation (actual path finding)
- Game persistence (save/load games)
- Player avatars and chat
- Sound effects and animations
- Mobile-responsive touch controls

## Notes

- This is a simplified implementation focusing on core mechanics
- Some advanced rules may differ from the official board game
- Trading and development cards are planned for future updates

## License

ISC

## Credits

Inspired by the board game Catan by Klaus Teuber
