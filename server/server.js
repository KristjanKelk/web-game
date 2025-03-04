const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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

// Object to hold active rooms
// Each room: { moderator, players, settings, inGame, startTime, duration, timerInterval, resources, positions, labyrinthLayout }
const rooms = {};

// Utility to generate a random 6-character room code
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Function to generate a labyrinth layout based on difficulty for a 1300x1000 board.
function generateLabyrinth(difficulty) {
    const boardWidth = 1300;
    const boardHeight = 1000;
    const cols = 26;
    const rows = 20;
    const cellWidth = boardWidth / cols;  // 50px
    const cellHeight = boardHeight / rows;  // 50px

    let wallProbability = 0.2; // Default for Easy
    if (difficulty === 'hard') {
        wallProbability = 0.35;
    }

    const walls = [];
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);

    // Increase the clear zone size: 2 cells on each side, so a 5x5 area is always clear.
    const clearZoneSize = 2;
    const clearZoneCols = [];
    const clearZoneRows = [];
    for (let i = centerCol - clearZoneSize; i <= centerCol + clearZoneSize; i++) {
        clearZoneCols.push(i);
    }
    for (let i = centerRow - clearZoneSize; i <= centerRow + clearZoneSize; i++) {
        clearZoneRows.push(i);
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Skip cells in the clear zone so that no walls appear there.
            if (clearZoneCols.includes(c) && clearZoneRows.includes(r)) {
                continue;
            }
            if (Math.random() < wallProbability) {
                walls.push({
                    x: c * cellWidth,
                    y: r * cellHeight,
                    width: cellWidth,
                    height: cellHeight
                });
            }
        }
    }
    console.log("Generated labyrinth layout:", walls);
    return walls;
}

// Helper function: Check if (x, y) is inside any wall in the labyrinth layout.
function isInsideWall(x, y, labyrinthLayout) {
    for (const wall of labyrinthLayout) {
        if (x >= wall.x && x < wall.x + wall.width &&
            y >= wall.y && y < wall.y + wall.height) {
            return true;
        }
    }
    return false;
}

// Modified resource spawning to avoid spawning inside walls.
function spawnResourceForRoom(roomCode) {
    if (!rooms[roomCode] || !rooms[roomCode].inGame) return;
    // Use the stored labyrinth layout
    const labyrinthLayout = rooms[roomCode].labyrinthLayout || [];
    let candidateX, candidateY;
    let maxAttempts = 10, attempts = 0;
    do {
        candidateX = Math.random() * 1300; // board width
        candidateY = Math.random() * 1000; // board height
        attempts++;
    } while (attempts < maxAttempts && isInsideWall(candidateX, candidateY, labyrinthLayout));

    if (attempts === maxAttempts && isInsideWall(candidateX, candidateY, labyrinthLayout)) {
        // Could not find an open space; skip spawning.
        return;
    }

    const isPowerUp = Math.random() < 0.2;
    const resource = {
        id: Math.random().toString(36).substr(2, 9),
        left: candidateX,
        top: candidateY,
        type: isPowerUp ? 'powerup' : 'normal'
    };

    if (!rooms[roomCode].resources) {
        rooms[roomCode].resources = [];
    }
    rooms[roomCode].resources.push(resource);
    io.to(roomCode).emit('resourceSpawned', resource);

    // Remove resource after 10 seconds if not collected.
    setTimeout(() => {
        if (rooms[roomCode] && rooms[roomCode].resources) {
            rooms[roomCode].resources = rooms[roomCode].resources.filter(r => r.id !== resource.id);
            io.to(roomCode).emit('resourceRemoved', resource.id);
        }
    }, 10000);
}

// Spawn resources every 5 seconds for rooms that are in game.
setInterval(() => {
    for (const roomCode in rooms) {
        if (rooms[roomCode].inGame) {
            spawnResourceForRoom(roomCode);
        }
    }
}, 5000);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // CREATE GAME
    socket.on('createGame', (data) => {
        // data: { playerName, gameName }
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            moderator: socket.id,
            players: {},
            settings: {
                difficulty: 'Easy',
                rounds: 3,
            },
            inGame: false,
            resources: [],
            positions: {},
            labyrinthLayout: []  // Will be set when game starts.
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

        // Add player with initial score 0.
        room.players[socket.id] = { name: playerName, score: 0 };

        socket.join(roomCode);
        // Emit the updated player list (if needed elsewhere)
        io.to(roomCode).emit('updatePlayerList', Object.values(room.players));

        // Build a scores object and emit it.
        const allScores = {};
        for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
            allScores[playerObj.name] = playerObj.score;
        }
        console.log("Emitting scoresUpdated:", allScores);
        io.to(roomCode).emit('scoresUpdated', allScores);
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

        // If the player is not already in the room, add them with an initial score of 0.
        if (!rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id] = { name: playerName, score: 0 };
        }

        console.log(`Player ${playerName} joined game state for room ${roomCode}`);

        // If the game is in progress and a labyrinth layout exists, send it.
        if (rooms[roomCode].inGame && rooms[roomCode].labyrinthLayout.length > 0) {
            socket.emit('labyrinthLayout', rooms[roomCode].labyrinthLayout);
        }
        // Build and emit current scores to the joining socket.
        const allScores = {};
        for (const [id, playerObj] of Object.entries(rooms[roomCode].players)) {
            allScores[playerObj.name] = playerObj.score;
        }
        socket.emit('scoresUpdated', allScores);
    });

    // START GAME (Only Moderator)
    socket.on('startGame', (roomCode) => {
        if (!rooms[roomCode]) return;
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('startError', 'Only the moderator can start the game.');
            return;
        }
        rooms[roomCode].inGame = true;
        rooms[roomCode].startTime = Date.now();
        rooms[roomCode].pausedAt = null;
        rooms[roomCode].totalPausedTime = 0;
        rooms[roomCode].paused = false;
        rooms[roomCode].duration = 60 * 1000; // 60 seconds

        rooms[roomCode].timerInterval = setInterval(() => {
            // Skip timer updates if game is paused
            if (rooms[roomCode].paused) return;

            const currentTime = Date.now();
            const adjustedElapsed = currentTime - rooms[roomCode].startTime - rooms[roomCode].totalPausedTime;
            let timeLeft = Math.max(0, Math.floor((rooms[roomCode].duration - adjustedElapsed) / 1000));
            io.to(roomCode).emit('timeUpdate', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(rooms[roomCode].timerInterval);

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

        // Generate labyrinth layout based on the room's difficulty.
        const difficulty = (rooms[roomCode].settings.difficulty || 'Easy').toLowerCase();
        const labyrinthLayout = generateLabyrinth(difficulty);
        rooms[roomCode].labyrinthLayout = labyrinthLayout;
        io.to(roomCode).emit('labyrinthLayout', labyrinthLayout);

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

    // RESOURCE COLLECTED
    socket.on('resourceCollected', (data) => {
        const { roomCode, resourceId, playerName } = data;
        const room = rooms[roomCode];
        if (!room || !room.resources) return;

        const collected = room.resources.find(r => r.id === resourceId);
        room.resources = room.resources.filter(r => r.id !== resourceId);
        io.to(roomCode).emit('resourceRemoved', resourceId);

        if (collected) {
            // Determine which player collected the resource
            const playerSocketId = Object.keys(room.players).find(id => room.players[id].name === playerName);
            if (playerSocketId) {
                const points = 10; // or adjust based on type
                room.players[playerSocketId].score += points;
            }

            if (collected.type === 'powerup') {
                io.to(roomCode).emit('powerUpEffect', {
                    source: playerName,
                    effect: 'slow',
                    duration: 5000
                });
            }

            // Build and emit updated scores
            const allScores = {};
            for (const [id, playerObj] of Object.entries(room.players)) {
                allScores[playerObj.name] = playerObj.score;
            }
            io.to(roomCode).emit('scoresUpdated', allScores);
        }
    });

    // GAME ACTION (pause, resume, quit)
    socket.on('gameAction', (data) => {
        const { roomCode, action, playerName } = data;
        console.log(`Server received gameAction: ${action} from ${playerName} for room ${roomCode}`);
        if (!rooms[roomCode]) {
            console.log(`Room ${roomCode} not found`);
            return;
        }
        switch (action) {
            case 'pause':
                rooms[roomCode].paused = true;
                rooms[roomCode].pausedAt = Date.now();
                io.to(roomCode).emit('gamePaused', { message: `${playerName} paused the game.` });
                break;
            case 'resume':
                if (rooms[roomCode].paused && rooms[roomCode].pausedAt) {
                    // Calculate how long the game was paused and add to total paused time
                    const pauseDuration = Date.now() - rooms[roomCode].pausedAt;
                    rooms[roomCode].totalPausedTime += pauseDuration;
                    rooms[roomCode].pausedAt = null;
                }
                rooms[roomCode].paused = false;
                io.to(roomCode).emit('gameResumed', { message: `${playerName} resumed the game.` });
                break;
            case 'quit':
                if (rooms[roomCode].moderator !== socket.id) {
                    socket.leave(roomCode);
                    delete rooms[roomCode].players[socket.id];
                    console.log(`Non-moderator ${playerName} quitting room ${roomCode}`);
                    socket.emit('gameQuit', { message: `${playerName} quit the game.` });
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                    io.to(roomCode).emit('playerLeft', { message: `${playerName} left the game.` });
                } else {
                    console.log(`Moderator ${playerName} requested to quit room ${roomCode}`);
                    io.to(roomCode).emit('gameQuit', { message: `${playerName} quit the game.` });
                }
                break;
            default:
                console.log(`Unknown game action: ${action}`);
                break;
        }
    });

});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
