// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public folder
app.use(express.static(__dirname + '/../public'));

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../public/index.html');
});

// Object to hold active rooms
// Each room is an object: { moderator: socketId, players: { socketId: { name } } }
const rooms = {};

// Utility to generate a random 6-character room code
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle game creation
    socket.on('createGame', (data) => {
        // data: { playerName }
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            moderator: socket.id,
            players: {}
        };
        // Add creator as the first player
        rooms[roomCode].players[socket.id] = { name: data.playerName };
        socket.join(roomCode);
        // Send the room code back so the client can redirect to the lobby page
        socket.emit('gameCreated', { roomCode, players: rooms[roomCode].players });
        // Broadcast updated player list (only one player now)
        io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
    });

    // Handle joining an existing game
    socket.on('joinGame', (data) => {
        // data: { roomCode, playerName }
        const { roomCode, playerName } = data;
        if (!rooms[roomCode]) {
            socket.emit('joinError', 'Room does not exist.');
            return;
        }
        // Check for maximum players (5 per room)
        if (Object.keys(rooms[roomCode].players).length >= 5) {
            socket.emit('joinError', 'Room is full.');
            return;
        }
        // Validate unique name within the room
        const nameTaken = Object.values(rooms[roomCode].players).some(
            (player) => player.name === playerName
        );
        if (nameTaken) {
            socket.emit('joinError', 'Name already taken in this room.');
            return;
        }
        // Add the player to the room and join the socket room
        rooms[roomCode].players[socket.id] = { name: playerName };
        socket.join(roomCode);
        io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
    });

    // Handle starting the game (only moderator allowed)
    socket.on('startGame', (roomCode) => {
        if (!rooms[roomCode]) return;
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('startError', 'Only the moderator can start the game.');
            return;
        }
        io.to(roomCode).emit('gameStarted');
    });

    // Handle disconnect: remove the player from their room
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];

                // If the disconnecting socket was the moderator, assign a new one if possible.
                if (rooms[roomCode].moderator === socket.id) {
                    const playerIDs = Object.keys(rooms[roomCode].players);
                    if (playerIDs.length > 0) {
                        rooms[roomCode].moderator = playerIDs[0];
                    }
                }

                io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

                // If the room is now empty, delay deletion for 60 seconds.
                if (Object.keys(rooms[roomCode].players).length === 0) {
                    setTimeout(() => {
                        if (rooms[roomCode] && Object.keys(rooms[roomCode].players).length === 0) {
                            delete rooms[roomCode];
                            console.log(`Room ${roomCode} deleted due to inactivity.`);
                        }
                    }, 60000); // 60,000 ms = 60 seconds
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
