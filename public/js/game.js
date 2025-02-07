// public/js/game.js
const socket = io();

// Retrieve room info and player name from localStorage
const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

if (!roomCode || !playerName) {
    console.error("Missing roomCode or playerName.");
    window.location.href = '/';
} else {
    // Immediately join the game state.
    socket.emit('joinGameState', { roomCode, playerName });
    console.log(`Emitted joinGameState with roomCode: ${roomCode} and playerName: ${playerName}`);
}

// Listen for a join error (if the room doesn’t exist)
socket.on('joinError', (msg) => {
    console.error("Join error received from server:", msg);
    alert(msg);
    window.location.href = '/';
});

// DOM references
const board = document.getElementById('board');
const scoreboard = document.getElementById('scoreboard');

// In-game menu elements
const inGameMenu = document.getElementById('inGameMenu');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const menuMessage = document.getElementById('menuMessage');

// Variables to control game state
let gamePaused = false;

// Set initial position (center of board) and create local avatar
let position = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
const localAvatar = document.createElement('div');
localAvatar.id = 'localAvatar';
localAvatar.classList.add('avatar');
localAvatar.style.backgroundColor = 'blue';
board.appendChild(localAvatar);

// Movement parameters
const speed = 5;
let velocity = { x: 0, y: 0 };

// Keyboard controls for movement (ignore if game is paused)
window.addEventListener('keydown', (e) => {
    if (gamePaused) return; // ignore movement when paused
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
    if (gamePaused) return;
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

// Game loop using requestAnimationFrame
function gameLoop() {
    if (!gamePaused) {
        position.x += velocity.x;
        position.y += velocity.y;
        // Ensure the avatar stays within boundaries (assuming 40px avatar)
        position.x = Math.max(0, Math.min(board.clientWidth - 40, position.x));
        position.y = Math.max(0, Math.min(board.clientHeight - 40, position.y));
        localAvatar.style.transform = `translate(${position.x}px, ${position.y}px)`;

        // Emit position update
        socket.emit('playerMove', { roomCode, playerName, position });
    }
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// In-Game Menu Event Listeners
resumeBtn.addEventListener('click', () => {
    console.log("Resume button clicked. Emitting resume action.");
    socket.emit('gameAction', { roomCode, action: 'resume', playerName });
});
quitBtn.addEventListener('click', () => {
    console.log("Quit button clicked. Emitting quit action.");
    socket.emit('gameAction', { roomCode, action: 'quit', playerName });
});

// Optionally, you can toggle the menu on key press (e.g., Esc key)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // If the game is not paused, then emit a pause action.
        // If it is paused, then emit a resume action.
        if (!gamePaused) {
            console.log("ESC pressed: Emitting pause action.");
            socket.emit('gameAction', { roomCode, action: 'pause', playerName });
        } else {
            console.log("ESC pressed: Emitting resume action.");
            socket.emit('gameAction', { roomCode, action: 'resume', playerName });
        }
        e.preventDefault();  // Prevent any default behavior.
    }
});

// Socket listeners for game actions broadcast from the server
socket.on('gamePaused', (data) => {
    console.log("Received gamePaused event:", data);
    gamePaused = true;
    menuMessage.textContent = data.message; // e.g., "Player X paused the game."
    inGameMenu.classList.remove('hidden');
});
socket.on('gameResumed', (data) => {
    console.log("Received gameResumed event:", data);
    gamePaused = false;
    menuMessage.textContent = data.message; // e.g., "Player X resumed the game."
    setTimeout(() => inGameMenu.classList.add('hidden'), 2000);
});
/*
socket.on('gameQuit', (data) => {
    console.log("Client received gameQuit event:", data);
    alert(data.message);
    window.location.href = '/';
});*/

socket.on('playerLeft', (data) => {
    console.log("Received playerLeft event:", data);
    // You could show this message in an alert, or display it in a UI element.
    menuMessage.textContent = data.message;
    // Optionally, update the UI (for example, update a list of players).
});

