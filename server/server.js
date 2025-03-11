const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const AIController = require('./ai-controller');
const resourceController = require('./resourceController');

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

function generateLabyrinth(difficulty) {
    const boardWidth = 1300;
    const boardHeight = 1000;
    const cols = 26;
    const rows = 20;
    const cellWidth = boardWidth / cols;
    const cellHeight = boardHeight / rows;

    let wallProbability = difficulty === 'hard' ? 0.35 : 0.2;

    const walls = [];
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);
    const clearZoneSize = 3;
    const centerX = boardWidth / 2;
    const centerY = boardHeight / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (c >= centerCol - clearZoneSize && c <= centerCol + clearZoneSize &&
                r >= centerRow - clearZoneSize && r <= centerRow + clearZoneSize) {
                continue;
            }
            if (Math.random() < wallProbability) {
                const wallX = c * cellWidth;
                const wallY = r * cellHeight;
                const distanceFromCenter = Math.sqrt(
                    Math.pow((wallX + cellWidth / 2) - centerX, 2) +
                    Math.pow((wallY + cellHeight / 2) - centerY, 2)
                );
                const safeDistance = Math.max(cellWidth, cellHeight) * 3;
                if (distanceFromCenter > safeDistance) {
                    walls.push({
                        x: wallX,
                        y: wallY,
                        width: cellWidth,
                        height: cellHeight
                    });
                }
            }
        }
    }
    return walls;
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

// Start the resource spawner for all in-game rooms
const resourceSpawner = resourceController.startResourceSpawner(rooms, io);

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
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('startError', 'Only the moderator can start the game.');
            return;
        }
        const gameMode = rooms[roomCode].settings.gameMode;
        const playerCount = Object.keys(rooms[roomCode].players).length;
        if (gameMode === 'Multiplayer' && playerCount < 2) {
            socket.emit('startError', 'At least 2 players are required to start a multiplayer game.');
            return;
        }
        if (gameMode === 'SinglePlayer') {
            const aiOpponents = parseInt(rooms[roomCode].settings.aiOpponents);
            const aiDifficulty = rooms[roomCode].settings.aiDifficulty;
            rooms[roomCode] = AIController.createAIPlayers(rooms[roomCode], aiOpponents, aiDifficulty);
            io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
        }
        rooms[roomCode].inGame = true;
        rooms[roomCode].startTime = Date.now();
        rooms[roomCode].pausedAt = null;
        rooms[roomCode].totalPausedTime = 0;
        rooms[roomCode].paused = false;
        rooms[roomCode].duration = 60 * 1000; // 60 seconds

        // Start timer interval
        rooms[roomCode].timerInterval = setInterval(() => {
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
                // Determine winner or tie and emit 'gameOver'
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
        }, 1000);

        const difficulty = (rooms[roomCode].settings.difficulty || 'Easy').toLowerCase();
        const labyrinthLayout = generateLabyrinth(difficulty);
        rooms[roomCode].labyrinthLayout = labyrinthLayout;
        io.to(roomCode).emit('labyrinthLayout', labyrinthLayout);

        // Set up AI update interval for single-player mode
        if (gameMode === 'SinglePlayer') {
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

    // DISCONNECT
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                //const isModerator = rooms[roomCode].moderator === socket.id;
                delete rooms[roomCode].players[socket.id];
                // Emit updated scores after removal.
                const allScores = {};
                for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
                    allScores[playerObj.name] = playerObj.score;
                }
                io.to(roomCode).emit('scoresUpdated', allScores);

                io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                if (Object.keys(rooms[roomCode].players).length === 0 && !rooms[roomCode].inGame) {
                    delete rooms[roomCode];
                    console.log(`Room ${roomCode} deleted due to inactivity.`);
                }
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
        rooms[roomCode].positions[socket.id] = { playerName, position };
        io.to(roomCode).emit('playerPositions', rooms[roomCode].positions);
    });

    // RESOURCE COLLECTED event
    socket.on('resourceCollected', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (!room || !room.resources) return;
        resourceController.handleResourceCollected(room, data, io, updateAndBroadcastScores);
    });

    // GAME ACTION (pause, resume, restart, quit) handler remains similar,
    // with restart logic reusing generateLabyrinth and clearing intervals.
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
                console.log(`${playerName} requested to restart the game in room ${roomCode}`);
                for (const playerId in rooms[roomCode].players) {
                    rooms[roomCode].players[playerId].score = 0;
                }
                rooms[roomCode].resources = [];
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                }
                rooms[roomCode].inGame = true;
                rooms[roomCode].startTime = Date.now();
                rooms[roomCode].pausedAt = null;
                rooms[roomCode].totalPausedTime = 0;
                rooms[roomCode].paused = false;
                rooms[roomCode].duration = 60 * 1000;
                const diff = (rooms[roomCode].settings.difficulty || 'Easy').toLowerCase();
                const newLabyrinth = generateLabyrinth(diff);
                rooms[roomCode].labyrinthLayout = newLabyrinth;
                io.to(roomCode).emit('labyrinthLayout', newLabyrinth);
                if (rooms[roomCode].settings.gameMode === 'SinglePlayer' && rooms[roomCode].aiPlayers) {
                    rooms[roomCode] = AIController.resetAIPlayers(rooms[roomCode]);
                    if (rooms[roomCode].aiInterval) {
                        clearInterval(rooms[roomCode].aiInterval);
                    }
                    rooms[roomCode].aiInterval = setInterval(() => {
                        if (rooms[roomCode].paused) return;
                        if (!rooms[roomCode].inGame) {
                            clearInterval(rooms[roomCode].aiInterval);
                            return;
                        }
                        rooms[roomCode] = AIController.updateAIPlayers(
                            rooms[roomCode],
                            (room, aiId, resource) => resourceController.handleAIResourceCollected(room, aiId, resource, io, updateAndBroadcastScores)
                        );
                        io.to(roomCode).emit('playerPositions', rooms[roomCode].positions);
                    }, 100);
                }
                const resetScores = {};
                for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
                    resetScores[playerObj.name] = 0;
                }
                io.to(roomCode).emit('gameRestart', {
                    message: `${playerName} restarted the game.`,
                    resetScores: resetScores
                });
                rooms[roomCode].timerInterval = setInterval(() => {
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
                }, 1000);
                break;
            case 'quit':
                if (rooms[roomCode].moderator !== socket.id) {
                    socket.leave(roomCode);
                    delete rooms[roomCode].players[socket.id];
                    console.log(`Non-moderator ${playerName} quitting room ${roomCode}`);
                    socket.emit('gameQuit', { message: `You quit the game.` });
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                    io.to(roomCode).emit('playerLeft', { message: `${playerName} left the game.` });
                } else {
                    if (rooms[roomCode].timerInterval) {
                        clearInterval(rooms[roomCode].timerInterval);
                    }
                    if (rooms[roomCode].aiInterval) {
                        clearInterval(rooms[roomCode].aiInterval);
                    }
                    console.log(`Moderator ${playerName} requested to quit room ${roomCode}`);
                    io.to(roomCode).emit('gameQuit', { message: `${playerName} quit the game. Game ended.` });
                    delete rooms[roomCode];
                }
                break;
            default:
                console.log(`Unknown game action: ${action}`);
                break;
        }
    });

    // DISCONNECT handler remains similar
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];
                updateAndBroadcastScores(roomCode);
                io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                if (Object.keys(rooms[roomCode].players).length === 0 && !rooms[roomCode].inGame) {
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
