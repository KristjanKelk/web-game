# Multiplayer Web Game

Welcome to the Multiplayer Web Game! This game allows 2 to 4 players to join and play in real-time using their web browsers.

## Features

- **Real-Time Multiplayer**: Supports 2 to 4 players simultaneously.
- **DOM-Based Rendering**: Utilizes DOM elements for rendering, ensuring compatibility with browsers where the `<canvas>` element is disabled.
- **Smooth Animations**: Maintains a consistent 60 FPS for a jank-free experience.
- **In-Game Menu**: Includes options to pause, resume, and quit the game.
- **Scoring System**: Real-time score updates with a dynamic scoreboard.
- **Sound Effects**: Audio feedback for various in-game events.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: [Download and install Node.js](https://nodejs.org/)

## Installation

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/your-username/multiplayer-web-game.git
   cd multiplayer-web-game
   ```

2. **Install Dependencies**:

   Navigate to the `server` directory and install the necessary Node.js packages:

   ```bash
   cd server
   npm install
   ```

## Running the Game Locally

1. **Start the Server**:

   In the `server` directory, start the Node.js server:

   ```bash
   node server.js
   ```

   The server will run on `http://localhost:3000`.

2. **Access the Game**:

   Open your web browser and navigate to `http://localhost:3000` to access the game interface.

## Deployment

To make the game accessible to others over the internet, consider deploying it using a hosting service like [Render](https://render.com/), [Railway](https://railway.app/), or [Vercel](https://vercel.com/). Ensure that the server is publicly accessible and that you've configured the deployment settings appropriately.

## Project Structure

```
/multiplayer-web-game
├── /public
│   ├── index.html
│   ├── styles.css
│   └── script.js
└── /server
    ├── server.js
    └── package.json
```

- **`/public`**: Contains the client-side files.
    - `index.html`: The main HTML file.
    - `styles.css`: CSS for styling.
    - `script.js`: Client-side JavaScript.
- **`/server`**: Contains the server-side files.
    - `server.js`: The Express server setup.
    - `package.json`: Lists Node.js dependencies.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes.


