// Import required modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Initialize Express app
const app = express();
const PORT = 3000;

// Create an HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with the server
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Handle the default route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Listen for a custom event (e.g., 'join')
    socket.on('join', (playerName) => {
        console.log(`${playerName} joined the game`);
        // Broadcast the new player to all connected clients
        io.emit('playerJoined', playerName);
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
