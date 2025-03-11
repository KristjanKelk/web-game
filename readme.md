# Multiplayer Web Game - Resource Rush

A real-time game that supports both multiplayer (2-4 players) and single-player modes. Players navigate through a procedurally generated labyrinth to collect resources while competing for the highest score.

## Features

- **Flexible Game Modes**:
    - **Multiplayer Mode**: Compete with 2-4 human players in real-time
    - **Single-Player Mode**: Challenge AI opponents with adjustable difficulty levels
- **Intelligent NPC System**:
    - Three difficulty levels: Easy, Medium, and Hard
    - Adaptive AI behavior with strategic resource targeting
    - Obstacle avoidance and pathfinding capabilities
- **Real-time Multiplayer**: Supports multiple players joining from different browsers
- **Smooth Performance**: Runs at 60+ FPS with proper use of `RequestAnimationFrame`
- **DOM-based Rendering**: No HTML canvas usage, ensuring broad browser compatibility
- **Game Mechanics**:
    - Procedurally generated labyrinth with difficulty settings
    - Resource collection for points
    - Power-ups that affect other players (slowing them down)
    - Real-time player movement and collision detection
- **Game Management**:
    - Room-based game sessions with unique codes
    - Lobby system for gathering players before starting
    - Moderator controls for starting the game and adjusting settings
- **In-game Features**:
    - Pause/resume/restart/quit functionality
    - Real-time scoreboard showing all players' scores
    - Game timer that counts down
    - Player notifications for game events

## How to play

- Be prepared to have fun while also making strategic choices.
- Using F11 for a full screen mode gets you more immersed and gives a better experience - recommended.
- Esc lets you exit or resume the game.
- Figure out your colored square and move it by AWSD or keyboard arrows.
- Collect resources and earn points - be warned that whoever collects the purple resource instead of yellow will make their opponents twice as slow for a period of time.
- Maps and labyrynths are random and resources appear in random places.
- Do not be surprised if you cannot access the whole map with some labyrynths - as in life, all does not always go according to plan and you just have to deal with it.
- Your movable square is also not perfeclty aligned to the maps and labyrynths - have fun figuring out the most optimal moves due to that, because the shortest path is not always the fastest way to a resource.
- Hint: observe your opponents.

### Single-Player Mode

In single-player mode, you compete against NPC opponents with different difficulty levels:

- **Easy**: NPCs move slowly, make mostly random decisions, and rarely prioritize power-ups
- **Medium**: NPCs have moderate speed and tactical awareness, sometimes prioritizing power-ups
- **Hard**: NPCs move fast, make strategic decisions, target power-ups aggressively, and use advanced navigation techniques

You can select the number of NPC opponents (1-3) and their difficulty level before starting the game.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: [Download and install Node.js](https://nodejs.org/)

## Installation

1. **Clone the Repository**:

   ```bash
   git clone https://gitea.kood.tech/kristjankelk/web-game.git
   cd web-game
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

## Running the Game Locally

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Access the game**:
   Open your browser and navigate to `http://localhost:3000`

3. **Create or join a game**:
    - Click "Create Game" to host a new game session
    - Click "Join Game" and enter a room code to join an existing session

## Game Flow

1. **Lobby**: After creating or joining a game, players enter a lobby
2. **Game Mode**: Select between Multiplayer or Single-Player mode
3. **Game Settings**: Adjust difficulty and opponent settings
    - In Multiplayer: Set the game difficulty
    - In Single-Player: Choose the number of NPC opponents and their difficulty level
4. **Start Game**: The moderator (first player) starts the game when ready
5. **Gameplay**:
    - Navigate your character using arrow keys or WASD
    - Collect yellow resources for points
    - Purple power-ups slow down opponents
    - Avoid walls in the labyrinth
6. **Game Over**: The player with the highest score when the timer ends wins

Game is accessible to others over the internet https://web-game-vycg.onrender.com/

## Project Structure

```
/web-game
├── /public            # Client-side files
│   ├── /js            # JavaScript modules
│   │   ├── /game      # Game-specific logic
│   │   │   ├── game.js       # Main game logic
│   │   │   ├── player.js     # Player class
│   │   │   └── resource.js   # Resource management
│   │   ├── landing.js  # Landing page logic
│   │   └── lobby.js    # Lobby management
│   ├── /styles        # CSS stylesheets
│   ├── game.html      # Game page
│   ├── index.html     # Landing page
│   └── lobby.html     # Lobby page
└── /server            # Server-side files
    ├── server.js      # Express server and Socket.IO logic
    ├── npc-controller.js # NPC AI behavior management
    ├── resourceController.js # Resource spawning and management
    └── labyrinthGenerator.js # Maze generation algorithm
```