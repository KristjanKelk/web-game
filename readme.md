# Multiplayer Web Game

A real-time multiplayer game that supports 2-4 players competing in a resource collection challenge. Players navigate through a procedurally generated labyrinth to collect resources while competing for the highest score.

## Features

- **Real-time Multiplayer**: Supports 2-4 players joining from different browsers
- **Smooth Performance**: Runs at 60+ FPS with proper use of `RequestAnimationFrame`
- **DOM-based Rendering**: No HTML canvas usage, ensuring broad browser compatibility
- **Game Mechanics**:
    - Procedurally generated labyrinth with difficulty settings
    - Resource collection for points
    - Power-ups that affect other players
    - Real-time player movement and collision detection
- **Game Management**:
    - Room-based game sessions with unique codes
    - Lobby system for gathering players before starting
    - Moderator controls for starting the game and adjusting settings
- **In-game Features**:
    - Pause/resume/quit functionality
    - Real-time scoreboard showing all players' scores
    - Game timer that counts down
    - Player notification when others pause, resume, or quit

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
2. **Game Settings**: The moderator (first player) can adjust difficulty and round settings
3. **Start Game**: The moderator starts the game when 2-4 players have joined
4. **Gameplay**:
    - Navigate your character using arrow keys or WASD
    - Collect yellow resources for points
    - Purple power-ups slow down opponents
    - Avoid walls in the labyrinth
5. **Game Over**: The player with the highest score when the timer ends wins

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
    └── server.js      # Express server and Socket.IO logic
```