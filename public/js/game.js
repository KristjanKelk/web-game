// public/js/game.js
const socket = io();

// Retrieve room info and player name from localStorage
const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

// References to DOM elements in game.html
const board = document.getElementById('board');
const scoreboard = document.getElementById('scoreboard');

// Create an element for the local player's avatar
const localAvatar = document.createElement('div');
localAvatar.id = 'localAvatar';
localAvatar.classList.add('avatar');
localAvatar.style.backgroundColor = 'blue'; // Customize your color here
board.appendChild(localAvatar);

// Set initial position (center of the board)
let position = {
    x: board.clientWidth / 2,
    y: board.clientHeight / 2
};

// Movement parameters
const speed = 5;
let velocity = { x: 0, y: 0 };

// Listen for keyboard input
window.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp':
        case 'w':
            velocity.y = -speed;
            break;
        case 'ArrowDown':
        case 's':
            velocity.y = speed;
            break;
        case 'ArrowLeft':
        case 'a':
            velocity.x = -speed;
            break;
        case 'ArrowRight':
        case 'd':
            velocity.x = speed;
            break;
    }
});

window.addEventListener('keyup', (e) => {
    // Stop movement along the axis when keys are released
    switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'ArrowDown':
        case 's':
            velocity.y = 0;
            break;
        case 'ArrowLeft':
        case 'a':
        case 'ArrowRight':
        case 'd':
            velocity.x = 0;
            break;
    }
});

// The game loop using requestAnimationFrame for smooth updates
function gameLoop() {
    // Update the local player's position based on velocity
    position.x += velocity.x;
    position.y += velocity.y;

    // Make sure the avatar stays within the board boundaries
    position.x = Math.max(0, Math.min(board.clientWidth - 40, position.x)); // assuming 40px avatar width
    position.y = Math.max(0, Math.min(board.clientHeight - 40, position.y)); // assuming 40px avatar height

    // Update the local avatar's position on screen using CSS transforms
    localAvatar.style.transform = `translate(${position.x}px, ${position.y}px)`;

    // Emit the movement update to the server
    socket.emit('playerMove', { roomCode, playerName, position });

    // Call the next frame
    requestAnimationFrame(gameLoop);
}

// Start the game loop
requestAnimationFrame(gameLoop);

// Listen for other players' positions and update the DOM accordingly
const otherPlayers = {}; // Keep track of other players' avatars

socket.on('playerPositions', (players) => {
    // players is an object keyed by socket id, with value { playerName, position }
    for (const id in players) {
        // Skip our own socket (the server may send us our own position as well)
        if (id === socket.id) continue;

        // If we don't already have an avatar for this player, create one
        if (!otherPlayers[id]) {
            const avatar = document.createElement('div');
            avatar.classList.add('avatar');
            avatar.style.backgroundColor = 'red'; // Different color for other players
            avatar.textContent = players[id].playerName;
            board.appendChild(avatar);
            otherPlayers[id] = avatar;
        }

        // Update the avatar's position
        const pos = players[id].position;
        otherPlayers[id].style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
});
