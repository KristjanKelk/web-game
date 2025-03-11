// server/server.js with changes to use exported functions
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const AIController = require('./ai-controller');
const resourceController = require('./resourceController');
const labyrinthGenerator = require('./labyrinthGenerator');

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(__dirname + '/../public'));

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../public/index.html');
});

const rooms = {};

// Utility to generate a random 6-character room code
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Update and broadcast scores to all clients
function updateAndBroadcastScores(roomCode) {
    if (!rooms[roomCode]) return;
    const allScores = {};
    for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
        allScores[playerObj.name] = playerObj.score;
    }
    io.to(roomCode).emit('scoresUpdated', allScores);
}

/**
 * Starts or restarts a game timer for a specific room
 * @param {string} roomCode - The room identifier
 */
function startGameTimer(roomCode) {
    if (!rooms[roomCode]) return;

    // Clear any existing interval
    if (rooms[roomCode].timerInterval) {
        clearInterval(rooms[roomCode].timerInterval);
    }

    // Reset timer state
    rooms[roomCode].inGame = true;
    rooms[roomCode].startTime = Date.now();
    rooms[roomCode].pausedAt = null;
    rooms[roomCode].totalPausedTime = 0;
    rooms[roomCode].paused = false;
    rooms[roomCode].duration = 60 * 1000; // 60 seconds

    // Set the timer interval
    rooms[roomCode].timerInterval = setInterval(() => {
        // Skip timer updates if game is paused
        if (rooms[roomCode].paused) return;

        const currentTime = Date.now();
        const adjustedElapsed = currentTime - rooms[roomCode].startTime - rooms[roomCode].totalPausedTime;
        let timeLeft = Math.max(0, Math.floor((rooms[roomCode].duration - adjustedElapsed) / 1000));
        io.to(roomCode).emit('timeUpdate', timeLeft);

        if (timeLeft <= 0) {
            clearInterval(rooms[roomCode].timerInterval);
            if (rooms[roomCode].aiInterval) {
                clearInterval(rooms[roomCode].aiInterval);
            }
            // Stop resource spawning when game ends
            resourceController.stopResourceSpawning(rooms[roomCode]);
            determineGameResults(roomCode);
        }
    }, 1000);
}

/**
 * Determines and broadcasts game results when the timer ends
 * @param {string} roomCode - The room identifier
 */
function determineGameResults(roomCode) {
    if (!rooms[roomCode]) return;

    let highestScore = -1;
    let winner = null;

    for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
        if (playerObj.score > highestScore) {
            highestScore = playerObj.score;
            winner = playerObj.name;
        }
    }

    let isTie = false;
    let tiedPlayers = [];

    for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
        if (playerObj.score === highestScore && playerObj.name !== winner) {
            isTie = true;
            tiedPlayers.push(playerObj.name);
        }
    }

    if (isTie) {
        tiedPlayers.push(winner);
        io.to(roomCode).emit('gameOver', {
            message: 'Game over! It\'s a tie!',
            isTie: true,
            tiedPlayers: tiedPlayers,
            highestScore: highestScore
        });
    } else {
        io.to(roomCode).emit('gameOver', {
            message: 'Game over!',
            winner: winner,
            score: highestScore
        });
    }
}

/**
 * Sets up AI behavior for single-player games
 * @param {string} roomCode - The room identifier
 */
function setupAIPlayers(roomCode) {
    if (!rooms[roomCode] || rooms[roomCode].settings.gameMode !== 'SinglePlayer') return;

    if (rooms[roomCode].aiInterval) {
        clearInterval(rooms[roomCode].aiInterval);
    }

    rooms[roomCode].aiInterval = setInterval(() => {
        if (!rooms[roomCode] || rooms[roomCode].paused || !rooms[roomCode].inGame) {
            if (!rooms[roomCode] || !rooms[roomCode].inGame) {
                clearInterval(rooms[roomCode].aiInterval);
            }
            return;
        }

        try {
            rooms[roomCode] = AIController.updateAIPlayers(
                rooms[roomCode],
                (room, aiId, resource) => resourceController.handleAIResourceCollected(room, aiId, resource, io, updateAndBroadcastScores)
            );
            io.to(roomCode).emit('playerPositions', rooms[roomCode].positions);
        } catch (error) {
            console.error("Error in AI update:", error);
        }
    }, 50);
}

/**
 * Handles game restart
 * @param {string} roomCode - The room identifier
 * @param {string} playerName - The player who initiated the restart
 */
function handleGameRestart(roomCode, playerName) {
    if (!rooms[roomCode]) return;

    console.log(`${playerName} requested to restart the game in room ${roomCode}`);

    // Reset player scores
    for (const playerId in rooms[roomCode].players) {
        rooms[roomCode].players[playerId].score = 0;
    }

    // Use the clearResources function from resourceController
    resourceController.clearResources(rooms[roomCode], io);

    // Clear existing intervals
    if (rooms[roomCode].timerInterval) {
        clearInterval(rooms[roomCode].timerInterval);
    }
    if (rooms[roomCode].aiInterval) {
        clearInterval(rooms[roomCode].aiInterval);
    }

    // Generate new labyrinth
    const diff = (rooms[roomCode].settings.difficulty || 'Easy').toLowerCase();
    const newLabyrinth = labyrinthGenerator.generateLabyrinth(diff);
    rooms[roomCode].labyrinthLayout = newLabyrinth;
    io.to(roomCode).emit('labyrinthLayout', newLabyrinth);

    // Build reset scores object for clients
    const resetScores = {};
    for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
        resetScores[playerObj.name] = 0;
    }

    // Notify clients about restart
    io.to(roomCode).emit('gameRestart', {
        message: `${playerName} restarted the game.`,
        resetScores: resetScores
    });

    // For single-player mode, reset AI
    if (rooms[roomCode].settings.gameMode === 'SinglePlayer' && rooms[roomCode].aiPlayers) {
        rooms[roomCode] = AIController.resetAIPlayers(rooms[roomCode]);
        setupAIPlayers(roomCode);
    }

    // Start game timer
    startGameTimer(roomCode);

    // Restart resource spawning
    resourceController.startResourceSpawning(roomCode, rooms[roomCode], io);
}

/**
 * Handles a player quitting the game
 * @param {string} roomCode - The room identifier
 * @param {string} socketId - The socket ID of the quitting player
 * @param {string} playerName - The name of the quitting player
 */
function handlePlayerQuit(roomCode, socketId, playerName) {
    if (!rooms[roomCode]) return;

    const isModerator = rooms[roomCode].moderator === socketId;

    if (isModerator) {
        // Moderator quitting ends the game for everyone
        if (rooms[roomCode].timerInterval) {
            clearInterval(rooms[roomCode].timerInterval);
        }
        if (rooms[roomCode].aiInterval) {
            clearInterval(rooms[roomCode].aiInterval);
        }
        // Stop resource spawning using the exported function
        resourceController.stopResourceSpawning(rooms[roomCode]);
        console.log(`Moderator ${playerName} requested to quit room ${roomCode}`);
        io.to(roomCode).emit('gameQuit', { message: `${playerName} quit the game. Game ended.` });
        delete rooms[roomCode];
    } else {
        // Non-moderator quitting just removes them from the game
        delete rooms[roomCode].players[socketId];
        io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
        io.to(roomCode).emit('playerLeft', { message: `${playerName} left the game.` });
        io.to(socketId).emit('gameQuit', { message: `You quit the game.` });
    }
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // CREATE GAME
    socket.on('createGame', (data) => {
        // data: { playerName, gameName }
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            roomCode, // attach roomCode to room for later use in resource functions
            moderator: socket.id,
            players: {},
            settings: {
                difficulty: 'Easy',
                rounds: 3,
                gameMode: 'Multiplayer', // Default to multiplayer
                aiOpponents: 1,          // Default AI opponent count
                aiDifficulty: 'Medium'
            },
            inGame: false,
            resources: [],
            positions: {},
            labyrinthLayout: [],
            aiPlayers: {}
        };
        socket.emit('gameCreated', { roomCode });
    });

    // JOIN GAME (from lobby)
    socket.on('joinGame', ({ roomCode, playerName }) => {
        if (!rooms[roomCode]) {
            socket.emit('joinError', 'Room does not exist.');
            return;
        }

        const room = rooms[roomCode];

        if (room.inGame) {
            const isExistingPlayer = Object.values(room.players).some(p => p.name === playerName);
            if (!isExistingPlayer) {
                socket.emit('joinError', 'Game already in progress. Cannot join now.');
                return;
            }
        }

        if (Object.keys(room.players).length >= 5) {
            socket.emit('joinError', 'Room is full (max 5).');
            return;
        }

        const nameTaken = Object.values(room.players).some(p => p.name === playerName);
        if (nameTaken) {
            socket.emit('joinError', 'Name already taken in this room.');
            return;
        }

        if (!room.moderator || Object.keys(room.players).length === 0) {
            room.moderator = socket.id;
        }

        room.players[socket.id] = { name: playerName, score: 0 };
        socket.join(roomCode);
        io.to(roomCode).emit('updatePlayerList', Object.values(room.players));
        updateAndBroadcastScores(roomCode);
    });

    // JOIN GAME STATE (from game.html)
    socket.on('joinGameState', (data) => {
        const { roomCode, playerName } = data;
        console.log(`joinGameState received from ${playerName} for room ${roomCode}`);

        if (!rooms[roomCode]) {
            console.log(`Room ${roomCode} does not exist in joinGameState.`);
            socket.emit('joinError', 'Room does not exist.');
            return;
        }

        socket.join(roomCode);

        if (!rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id] = { name: playerName, score: 0 };
        }

        console.log(`Player ${playerName} joined game state for room ${roomCode}`);

        if (rooms[roomCode].inGame && rooms[roomCode].labyrinthLayout.length > 0) {
            socket.emit('labyrinthLayout', rooms[roomCode].labyrinthLayout);
        }

        updateAndBroadcastScores(roomCode);
    });

    // Handle AI Settings update
    socket.on('updateAISettings', (data) => {
        const { roomCode, aiOpponents, aiDifficulty } = data;

        if (!rooms[roomCode]) {
            socket.emit('settingsError', 'Room does not exist.');
            return;
        }

        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('settingsError', 'Only the moderator can update settings.');
            return;
        }

        rooms[roomCode].settings.aiOpponents = aiOpponents;
        rooms[roomCode].settings.aiDifficulty = aiDifficulty;

        io.to(roomCode).emit('aiSettingsUpdated', {
            aiOpponents,
            aiDifficulty
        });
    });

    // Handle Game Mode update
    socket.on('updateGameMode', (data) => {
        const { roomCode, gameMode } = data;

        if (!rooms[roomCode]) {
            socket.emit('settingsError', 'Room does not exist.');
            return;
        }

        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('settingsError', 'Only the moderator can update game mode.');
            return;
        }

        rooms[roomCode].settings.gameMode = gameMode;
        io.to(roomCode).emit('gameModeUpdated', { gameMode });
    });

    // START GAME (Only Moderator)
    socket.on('startGame', (roomCode) => {
        if (!rooms[roomCode]) return;

        // Check if the requester is the moderator
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('startError', 'Only the moderator can start the game.');
            return;
        }

        const gameMode = rooms[roomCode].settings.gameMode;
        const playerCount = Object.keys(rooms[roomCode].players).length;

        // Validate player requirements for multiplayer mode
        if (gameMode === 'Multiplayer' && playerCount < 2) {
            socket.emit('startError', 'At least 2 players are required to start a multiplayer game.');
            return;
        }

        // Setup AI players for single-player mode
        if (gameMode === 'SinglePlayer') {
            const aiOpponents = parseInt(rooms[roomCode].settings.aiOpponents);
            const aiDifficulty = rooms[roomCode].settings.aiDifficulty;
            rooms[roomCode] = AIController.createAIPlayers(rooms[roomCode], aiOpponents, aiDifficulty);
            io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
        }

        // Generate and set labyrinth layout
        const difficulty = (rooms[roomCode].settings.difficulty || 'Easy').toLowerCase();
        const labyrinthLayout = labyrinthGenerator.generateLabyrinth(difficulty);
        rooms[roomCode].labyrinthLayout = labyrinthLayout;
        io.to(roomCode).emit('labyrinthLayout', labyrinthLayout);

        // Start the game timer
        startGameTimer(roomCode);

        // Set up AI behavior for single-player mode
        if (gameMode === 'SinglePlayer') {
            setupAIPlayers(roomCode);
        }

        // Start resource spawning
        resourceController.startResourceSpawning(roomCode, rooms[roomCode], io);

        // Notify clients that the game has started
        io.to(roomCode).emit('gameStarted');
    });

    // LEAVE LOBBY
    socket.on('leaveLobby', (roomCode) => {
        if (!rooms[roomCode]) return;

        const isModerator = rooms[roomCode].moderator === socket.id;

        if (isModerator) {
            io.to(roomCode).emit('lobbyClosed');
            delete rooms[roomCode];
        } else {
            delete rooms[roomCode].players[socket.id];
            socket.leave(roomCode);
            io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

            if (Object.keys(rooms[roomCode].players).length === 0) {
                delete rooms[roomCode];
                console.log(`Room ${roomCode} deleted due to no players.`);
            }
        }
    });

    // UPDATE GAME SETTINGS
    socket.on('updateGameSettings', (data) => {
        const { roomCode, settings } = data;

        if (!rooms[roomCode]) {
            socket.emit('settingsError', 'Room does not exist.');
            return;
        }

        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('settingsError', 'Only the moderator can update settings.');
            return;
        }

        rooms[roomCode].settings = settings;
        io.to(roomCode).emit('settingsUpdated', settings);
    });

    // PLAYER MOVE
    socket.on('playerMove', (data) => {
        const { roomCode, playerName, position } = data;

        if (!rooms[roomCode]) return;

        if (!rooms[roomCode].positions) {
            rooms[roomCode].positions = {};
        }

        // Use labyrinthGenerator.isInsideWall to prevent player from moving into walls
        if (rooms[roomCode].labyrinthLayout && rooms[roomCode].labyrinthLayout.length > 0) {
            // Check if the new position would be inside a wall
            const isInWall = labyrinthGenerator.isInsideWall(
                position.x,
                position.y,
                rooms[roomCode].labyrinthLayout
            );

            // If in wall, don't update position (server-side validation)
            if (isInWall) {
                return;
            }
        }

        rooms[roomCode].positions[socket.id] = { playerName, position };
        io.to(roomCode).emit('playerPositions', rooms[roomCode].positions);
    });

    // RESOURCE COLLECTED event
    socket.on('resourceCollected', (data) => {
        resourceController.handleResourceCollected(
            rooms[data.roomCode],
            data,
            io,
            updateAndBroadcastScores
        );
    });

    // GAME ACTION (pause, resume, restart, quit)
    socket.on('gameAction', (data) => {
        const { roomCode, action, playerName } = data;
        console.log(`Server received gameAction: ${action} from ${playerName} for room ${roomCode}`);

        if (!rooms[roomCode]) return;

        switch (action) {
            case 'pause':
                rooms[roomCode].paused = true;
                rooms[roomCode].pausedAt = Date.now();
                io.to(roomCode).emit('gamePaused', { message: `${playerName} paused the game.` });
                break;

            case 'resume':
                if (rooms[roomCode].paused && rooms[roomCode].pausedAt) {
                    const pauseDuration = Date.now() - rooms[roomCode].pausedAt;
                    rooms[roomCode].totalPausedTime += pauseDuration;
                    rooms[roomCode].pausedAt = null;
                }
                rooms[roomCode].paused = false;
                io.to(roomCode).emit('gameResumed', { message: `${playerName} resumed the game.` });
                break;

            case 'restart':
                handleGameRestart(roomCode, playerName);
                break;

            case 'quit':
                handlePlayerQuit(roomCode, socket.id, playerName);
                break;

            default:
                console.log(`Unknown game action: ${action}`);
                break;
        }
    });

    // DISCONNECT handler
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];
                updateAndBroadcastScores(roomCode);
                io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

                if (Object.keys(rooms[roomCode].players).length === 0 && !rooms[roomCode].inGame) {
                    // If this was the last player in a room, ensure resources are properly stopped
                    resourceController.stopResourceSpawning(rooms[roomCode]);
                    delete rooms[roomCode];
                    console.log(`Room ${roomCode} deleted due to inactivity.`);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});