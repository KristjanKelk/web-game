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
// Each room: { moderator, players, settings, inGame, startTime, duration, timerInterval, resources, positions }
const rooms = {};

// Utility to generate a random 6-character room code
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// --- Resource Spawning Helper ---
function spawnResourceForRoom(roomCode) {
    if (!rooms[roomCode] || !rooms[roomCode].inGame) return;

    // Create a resource object with a unique id, random position, and type.
    // Adjust the multipliers (500, 300) to fit your board's dimensions.
    const resource = {
        id: Math.random().toString(36).substr(2, 9),
        left: Math.random() * 500,
        top: Math.random() * 300,
        type: 'normal' // Extend with 'powerup' later if needed.
    };

    // Ensure the room has a resources array.
    if (!rooms[roomCode].resources) {
        rooms[roomCode].resources = [];
    }
    rooms[roomCode].resources.push(resource);
    // Broadcast the new resource to all clients in the room.
    io.to(roomCode).emit('resourceSpawned', resource);

    // Remove the resource after 10 seconds if not collected.
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
            positions: {}
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

        // Check if already full
        if (Object.keys(room.players).length >= 5) {
            socket.emit('joinError', 'Room is full (max 5).');
            return;
        }
        // Check name uniqueness
        const nameTaken = Object.values(room.players).some(p => p.name === playerName);
        if (nameTaken) {
            socket.emit('joinError', 'Name already taken in this room.');
            return;
        }
        // If the room has no moderator, assign this player as moderator.
        if (!room.moderator || Object.keys(room.players).length === 0) {
            room.moderator = socket.id;
        }
        room.players[socket.id] = { name: playerName };
        socket.join(roomCode);
        io.to(roomCode).emit('updatePlayerList', Object.values(room.players));
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
        console.log(`Player ${playerName} joined game state for room ${roomCode}`);
    });

    // START GAME (Only Moderator)
    socket.on('startGame', (roomCode) => {
        if (!rooms[roomCode]) return;
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('startError', 'Only the moderator can start the game.');
            return;
        }
        rooms[roomCode].inGame = true;
        // Set timer values for authoritative timer.
        rooms[roomCode].startTime = Date.now();
        rooms[roomCode].duration = 60 * 1000; // 60 seconds in milliseconds.
        rooms[roomCode].timerInterval = setInterval(() => {
            const elapsed = Date.now() - rooms[roomCode].startTime;
            let timeLeft = Math.max(0, Math.floor((rooms[roomCode].duration - elapsed) / 1000));
            io.to(roomCode).emit('timeUpdate', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(rooms[roomCode].timerInterval);
                io.to(roomCode).emit('gameOver', { message: 'Time is up! Game over.' });
                // Optionally, additional cleanup here.
            }
        }, 1000);
        io.to(roomCode).emit('gameStarted');
    });

    // LEAVE LOBBY (explicit action)
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
                const isModerator = rooms[roomCode].moderator === socket.id;
                delete rooms[roomCode].players[socket.id];
                if (isModerator) {
                    if (!rooms[roomCode].inGame) {
                        io.to(roomCode).emit('lobbyClosed');
                        delete rooms[roomCode];
                    }
                } else {
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                    if (Object.keys(rooms[roomCode].players).length === 0 && !rooms[roomCode].inGame) {
                        delete rooms[roomCode];
                        console.log(`Room ${roomCode} deleted due to inactivity.`);
                    }
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
        if (!rooms[roomCode] || !rooms[roomCode].resources) return;
        rooms[roomCode].resources = rooms[roomCode].resources.filter(r => r.id !== resourceId);
        io.to(roomCode).emit('resourceRemoved', resourceId);
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
                io.to(roomCode).emit('gamePaused', { message: `${playerName} paused the game.` });
                break;
            case 'resume':
                rooms[roomCode].paused = false;
                io.to(roomCode).emit('gameResumed', { message: `${playerName} resumed the game.` });
                break;
            case 'quit':
                // For non-moderators, remove them from the room and notify them with a gameQuit event.
                if (rooms[roomCode].moderator !== socket.id) {
                    socket.leave(roomCode);
                    delete rooms[roomCode].players[socket.id];
                    console.log(`Non-moderator ${playerName} quitting room ${roomCode}`);
                    // Emit gameQuit specifically to the quitting socket so it can redirect.
                    socket.emit('gameQuit', { message: `${playerName} quit the game.` });
                    // Update the remaining players.
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                    io.to(roomCode).emit('playerLeft', { message: `${playerName} left the game.` });
                } else {
                    // If the moderator quits, broadcast a global quit event.
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
