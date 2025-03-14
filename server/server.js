// server/server.js with changes to use exported functions
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const NPCController = require('./npc-controller.js');
const resourceController = require('./resourceController.js');
const labyrinthGenerator = require('./labyrinthGenerator.js');

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
            if (rooms[roomCode].NPCInterval) {
                clearInterval(rooms[roomCode].NPCInterval);
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
 * Sets up NPC behavior for single-player games
 * @param {string} roomCode - The room identifier
 */
function setupNPCPlayers(roomCode) {
    if (!rooms[roomCode] || rooms[roomCode].settings.gameMode !== 'SinglePlayer') return;

    if (rooms[roomCode].NPCInterval) {
        clearInterval(rooms[roomCode].NPCInterval);
    }

    rooms[roomCode].NPCInterval = setInterval(() => {
        if (!rooms[roomCode] || rooms[roomCode].paused || !rooms[roomCode].inGame) {
            if (!rooms[roomCode] || !rooms[roomCode].inGame) {
                clearInterval(rooms[roomCode].NPCInterval);
            }
            return;
        }

        try {
            rooms[roomCode] = NPCController.updateNPCPlayers(
                rooms[roomCode],
                (room, NPCId, resource) => resourceController.handleNPCResourceCollected(room, NPCId, resource, io, updateAndBroadcastScores)
            );
            io.to(roomCode).emit('playerPositions', rooms[roomCode].positions);
        } catch (error) {
            console.error("Error in NPC update:", error);
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
    if (rooms[roomCode].NPCInterval) {
        clearInterval(rooms[roomCode].NPCInterval);
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

    // For single-player mode, reset NPC
    if (rooms[roomCode].settings.gameMode === 'SinglePlayer' && rooms[roomCode].NPCPlayers) {
        rooms[roomCode] = NPCController.resetNPCPlayers(rooms[roomCode]);
        setupNPCPlayers(roomCode);
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
        if (rooms[roomCode].NPCInterval) {
            clearInterval(rooms[roomCode].NPCInterval);
        }
        // Stop resource spawning using the exported function
        resourceController.stopResourceSpawning(rooms[roomCode]);
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
                NPCOpponents: 1,          // Default NPC opponent count
                NPCDifficulty: 'Medium'
            },
            inGame: false,
            resources: [],
            positions: {},
            labyrinthLayout: [],
            NPCPlayers: {}
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

        if (!rooms[roomCode]) {
            console.log(`Room ${roomCode} does not exist in joinGameState.`);
            socket.emit('joinError', 'Room does not exist.');
            return;
        }

        socket.join(roomCode);

        if (!rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id] = { name: playerName, score: 0 };
        }

        if (rooms[roomCode].inGame && rooms[roomCode].labyrinthLayout.length > 0) {
            socket.emit('labyrinthLayout', rooms[roomCode].labyrinthLayout);
        }

        updateAndBroadcastScores(roomCode);
    });

    // Handle NPC Settings update
    socket.on('updateNPCSettings', (data) => {
        const { roomCode, NPCOpponents, NPCDifficulty } = data;

        if (!rooms[roomCode]) {
            socket.emit('settingsError', 'Room does not exist.');
            return;
        }

        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('settingsError', 'Only the moderator can update settings.');
            return;
        }

        rooms[roomCode].settings.NPCOpponents = NPCOpponents;
        rooms[roomCode].settings.NPCDifficulty = NPCDifficulty;

        io.to(roomCode).emit('NPCSettingsUpdated', {
            NPCOpponents,
            NPCDifficulty
        });
    });

    // Handle Game Mode update
    // In server.js, modify the updateGameMode handler:
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
        console.log(`Updated room ${roomCode} game mode to: ${rooms[roomCode].settings.gameMode}`);
        io.to(roomCode).emit('gameModeUpdated', { gameMode });
    });

// Also modify the updateNPCSettings handler:
    socket.on('updateNPCSettings', (data) => {
        const { roomCode, NPCOpponents, NPCDifficulty } = data;
        console.log(`NPC settings update for room ${roomCode}: ${NPCOpponents} bots at ${NPCDifficulty} difficulty`);

        if (!rooms[roomCode]) {
            socket.emit('settingsError', 'Room does not exist.');
            return;
        }

        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('settingsError', 'Only the moderator can update settings.');
            return;
        }

        rooms[roomCode].settings.NPCOpponents = NPCOpponents;
        rooms[roomCode].settings.NPCDifficulty = NPCDifficulty;

        io.to(roomCode).emit('NPCSettingsUpdated', {
            NPCOpponents,
            NPCDifficulty
        });
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

        // Validate game mode requirements
        if (gameMode === 'Multiplayer') {
            if (playerCount < 2) {
                socket.emit('startError', 'At least 2 players are required to start a multiplayer game.');
                return;
            }

            // Clear any existing NPC players if switching from SinglePlayer to Multiplayer
            if (rooms[roomCode].NPCPlayers) {
                // Remove any NPCs from the players list
                for (const NPCId in rooms[roomCode].NPCPlayers) {
                    if (rooms[roomCode].players[NPCId]) {
                        delete rooms[roomCode].players[NPCId];
                    }
                    if (rooms[roomCode].positions && rooms[roomCode].positions[NPCId]) {
                        delete rooms[roomCode].positions[NPCId];
                    }
                }
                rooms[roomCode].NPCPlayers = {};
            }
        } else if (gameMode === 'SinglePlayer') {
            const multiPlayers = Object.keys(rooms[roomCode].players).filter(
                id => !id.startsWith('NPC-')
            );

            if (multiPlayers.length > 1) {
                socket.emit('startError', 'Single Player mode is only available for 1 human player. Please switch to Multiplayer mode or ask other players to leave.');
                return;
            }

            // Setup NPC players for single-player mode
            const NPCOpponents = parseInt(rooms[roomCode].settings.NPCOpponents) || 1;
            const NPCDifficulty = rooms[roomCode].settings.NPCDifficulty || 'Medium';

            try {
                rooms[roomCode] = NPCController.createNPCPlayers(rooms[roomCode], NPCOpponents, NPCDifficulty);
            } catch (error) {
                console.error("Error creating NPC players:", error);
            }
        }

        // Update player list to reflect any changes
        io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

        // Generate and set labyrinth layout
        const difficulty = (rooms[roomCode].settings.difficulty || 'Easy').toLowerCase();
        const labyrinthLayout = labyrinthGenerator.generateLabyrinth(difficulty);
        rooms[roomCode].labyrinthLayout = labyrinthLayout;
        io.to(roomCode).emit('labyrinthLayout', labyrinthLayout);

        // Start the game timer
        startGameTimer(roomCode);

        // Set up NPC behavior for single-player mode
        if (gameMode === 'SinglePlayer') {
            setupNPCPlayers(roomCode);
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

        // Make sure we don't overwrite the existing gameMode and NPCSettings
        const gameMode = rooms[roomCode].settings.gameMode;
        const NPCOpponents = rooms[roomCode].settings.NPCOpponents;
        const NPCDifficulty = rooms[roomCode].settings.NPCDifficulty;

        rooms[roomCode].settings = settings;
        rooms[roomCode].settings.gameMode = gameMode;
        rooms[roomCode].settings.NPCOpponents = NPCOpponents;
        rooms[roomCode].settings.NPCDifficulty = NPCDifficulty;

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
                break;
        }
    });

    // DISCONNECT handler
    socket.on('disconnect', () => {

        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];
                updateAndBroadcastScores(roomCode);
                io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

                if (Object.keys(rooms[roomCode].players).length === 0 && !rooms[roomCode].inGame) {
                    // If this was the last player in a room, ensure resources are properly stopped
                    resourceController.stopResourceSpawning(rooms[roomCode]);
                    delete rooms[roomCode];
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});