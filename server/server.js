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
            moderator: null,  // We'll set this when the first player joins
            players: {}
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

    // START GAME (Only Moderator)
    socket.on('startGame', (roomCode) => {
        if (!rooms[roomCode]) return;
        if (rooms[roomCode].moderator !== socket.id) {
            socket.emit('startError', 'Only the moderator can start the game.');
            return;
        }
        io.to(roomCode).emit('gameStarted');
    });

    // LEAVE LOBBY (explicit action from the client)
    socket.on('leaveLobby', (roomCode) => {
        if (!rooms[roomCode]) return;

        const isModerator = rooms[roomCode].moderator === socket.id;

        if (isModerator) {
            // Moderator closes the entire lobby
            io.to(roomCode).emit('lobbyClosed');
            delete rooms[roomCode]; // remove the room from the server
        } else {
            // Just remove this user
            delete rooms[roomCode].players[socket.id];
            socket.leave(roomCode);

            // Broadcast updated list
            io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

            // If no players remain, remove the room
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

                // Remove the player
                delete rooms[roomCode].players[socket.id];

                if (isModerator) {
                    // Close the entire lobby if moderator disconnects
                    io.to(roomCode).emit('lobbyClosed');
                    delete rooms[roomCode];
                } else {
                    // Update remaining players
                    io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));

                    // If empty, remove the room
                    if (Object.keys(rooms[roomCode].players).length === 0) {
                        delete rooms[roomCode];
                        console.log(`Room ${roomCode} deleted due to inactivity.`);
                    }
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
