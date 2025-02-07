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
// Each room: { moderator: socketId, players: { socketId: { name } } }
const rooms = {};

// Utility to generate a random 6-character room code
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // CREATE GAME
    socket.on('createGame', (data) => {
        // data: { playerName, gameName }
        const roomCode = generateRoomCode();

        // We create the room object but do NOT put the creator into it yet.
        // We'll handle actual joining in the 'joinGame' event.
        rooms[roomCode] = {
            moderator: socket.id,
            players: {},
            settings: {
                difficulty: 'Easy',
                rounds: 3,
            }
        };

        // Tell the client the new room code
        socket.emit('gameCreated', { roomCode });
    });

    // JOIN GAME
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

        // If the room has no moderator, this new player becomes moderator
        if (!room.moderator || Object.keys(room.players).length === 0) {
            room.moderator = socket.id;
        }

        // Add player to the room
        room.players[socket.id] = { name: playerName };
        socket.join(roomCode);

        // Send out the updated player list
        io.to(roomCode).emit('updatePlayerList', Object.values(room.players));
    });

    // JOIN
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
        // Mark the room as in game so that disconnects do not delete it.
        rooms[roomCode].inGame = true;
        io.to(roomCode).emit('gameStarted');
    });

    // LEAVE LOBBY (explicit action from the client)
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
        // Find any room this user was in
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                const isModerator = rooms[roomCode].moderator === socket.id;
                // Remove the player from the room
                delete rooms[roomCode].players[socket.id];

                if (isModerator) {
                    // If the room is not in game, then close the lobby.
                    if (!rooms[roomCode].inGame) {
                        io.to(roomCode).emit('lobbyClosed');
                        delete rooms[roomCode];
                    }
                } else {
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                    // Only delete the room if it's empty AND not in game.
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
        // data: { roomCode, settings: { ...some settings... } }
        const { roomCode, settings } = data;
        // Make sure room exists
        if (!rooms[roomCode]) {
            socket.emit('settingsError', 'Room does not exist.');
            return;
        }
        // Only the moderator can update settings
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('settingsError', 'Only the moderator can update settings.');
            return;
        }
        // Store the settings in the room object
        rooms[roomCode].settings = settings;

        // Broadcast the updated settings to everyone in the room
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
                // Allow any player to trigger pause
                rooms[roomCode].paused = true;
                io.to(roomCode).emit('gamePaused', { message: `${playerName} paused the game.` });
                break;
            case 'resume':
                // Allow any player to trigger resume
                rooms[roomCode].paused = false;
                io.to(roomCode).emit('gameResumed', { message: `${playerName} resumed the game.` });
                break;
            case 'quit':
                // For non-moderators, remove them from the room and notify everyone.
                if (rooms[roomCode].moderator !== socket.id) {
                    socket.leave(roomCode);
                    delete rooms[roomCode].players[socket.id];
                    console.log(`Non-moderator ${playerName} quitting room ${roomCode}`);
                    // Update the remaining players with the new player list.
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
                    // Broadcast a message to everyone in the room that this player left.
                    io.to(roomCode).emit('playerLeft', { message: `${playerName} left the game.` });
                    // Send a quit event back only to the leaving client so they can redirect.
                    //socket.emit('gameQuit', { message: `${playerName} quit the game.` });
                } else {
                    // Moderator quits: global quit.
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
