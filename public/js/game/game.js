// ... (other imports and initial code)
import { Player } from './player.js';

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

socket.on('joinError', (msg) => {
    console.error("Join error received from server:", msg);
    alert(msg);
    window.location.href = '/';
});

// DOM references
const board = document.getElementById('board');
const scoreboard = document.getElementById('scoreboard');
const timerDisplay = document.getElementById('timeLeft'); // Ensure your HTML has this element

// In-game menu elements
const inGameMenu = document.getElementById('inGameMenu');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const menuMessage = document.getElementById('menuMessage');

// Game state variables
let gamePaused = false;
let score = 0;
// The timer is now authoritative from the server.

// Update the scoreboard display
function updateScore(points) {
    score += points;
    scoreboard.textContent = `Score: ${score}`;
}

// Create the local player using your Player class.
const initialPosition = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
const player = new Player(board, initialPosition, 'blue');

// -------------------------
// Resource Handling Section
// -------------------------

// Global object to store resources currently displayed on the client.
const resourcesOnScreen = {};

// Listen for resource spawn events from the server.
socket.on('resourceSpawned', (resource) => {
    // Create a DOM element for the resource.
    const resEl = document.createElement('div');
    resEl.classList.add('resource');
    resEl.style.position = 'absolute';
    resEl.style.width = '20px';
    resEl.style.height = '20px';
    // Use purple for power-ups and yellow for normal resources.
    resEl.style.backgroundColor = resource.type === 'powerup' ? 'purple' : 'yellow';
    resEl.style.borderRadius = '50%';
    resEl.style.left = resource.left + 'px';
    resEl.style.top = resource.top + 'px';
    board.appendChild(resEl);
    resourcesOnScreen[resource.id] = resEl;
});

// Listen for resource removal events from the server.
socket.on('resourceRemoved', (resourceId) => {
    if (resourcesOnScreen[resourceId]) {
        board.removeChild(resourcesOnScreen[resourceId]);
        delete resourcesOnScreen[resourceId];
    }
});

// Collision detection: check for collisions between the local player's avatar and resources.
function checkCollisions() {
    const avatarRect = player.avatar.getBoundingClientRect();
    for (const resourceId in resourcesOnScreen) {
        const resEl = resourcesOnScreen[resourceId];
        const resourceRect = resEl.getBoundingClientRect();
        if (
            avatarRect.left < resourceRect.right &&
            avatarRect.right > resourceRect.left &&
            avatarRect.top < resourceRect.bottom &&
            avatarRect.bottom > resourceRect.top
        ) {
            // Collision detected: award points and notify the server.
            updateScore(10);
            socket.emit('resourceCollected', { roomCode, resourceId, playerName });
            board.removeChild(resEl);
            delete resourcesOnScreen[resourceId];
        }
    }
}

// -------------------------
// End Resource Handling
// -------------------------

// Input handling for movement
window.addEventListener('keydown', (e) => {
    if (gamePaused) return;
    switch (e.key) {
        case 'ArrowUp':
        case 'w':
            player.setVelocity(0, -player.speed);
            break;
        case 'ArrowDown':
        case 's':
            player.setVelocity(0, player.speed);
            break;
        case 'ArrowLeft':
        case 'a':
            player.setVelocity(-player.speed, 0);
            break;
        case 'ArrowRight':
        case 'd':
            player.setVelocity(player.speed, 0);
            break;
    }
});
window.addEventListener('keyup', (e) => {
    if (gamePaused) return;
    // Stop movement on key release.
    switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'ArrowDown':
        case 's':
        case 'ArrowLeft':
        case 'a':
        case 'ArrowRight':
        case 'd':
            player.setVelocity(0, 0);
            break;
    }
});

// Main game loop using requestAnimationFrame
let lastEmit = Date.now();

function gameLoop() {
    if (!gamePaused) {
        player.update();
        checkCollisions();
        // Throttle the emission to every 100 ms.
        if (Date.now() - lastEmit > 100) {
            socket.emit('playerMove', { roomCode, playerName, position: player.position });
            lastEmit = Date.now();
        }
    }
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// Listen for authoritative timer updates from the server.
socket.on('timeUpdate', (time) => {
    timerDisplay.textContent = time;
});

// Listen for game over event from the server.
socket.on('gameOver', (data) => {
    alert(data.message);
    window.location.href = '/';
});

// In-game Menu Event Listeners
resumeBtn.addEventListener('click', () => {
    console.log("Resume button clicked. Emitting resume action.");
    socket.emit('gameAction', { roomCode, action: 'resume', playerName });
});
quitBtn.addEventListener('click', () => {
    console.log("Quit button clicked. Emitting quit action.");
    socket.emit('gameAction', { roomCode, action: 'quit', playerName });
});


// ESC key handling
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!gamePaused) {
            console.log("ESC pressed: Emitting pause action.");
            socket.emit('gameAction', { roomCode, action: 'pause', playerName });
        } else {
            console.log("ESC pressed: Emitting resume action.");
            socket.emit('gameAction', { roomCode, action: 'resume', playerName });
        }
        e.preventDefault();
    }
});


// Socket listeners for global game actions.
socket.on('gamePaused', (data) => {
    console.log("Received gamePaused event:", data);
    gamePaused = true;
    menuMessage.textContent = data.message; // e.g., "Player X paused the game."
    inGameMenu.classList.remove('hidden');
});

socket.on('gameResumed', (data) => {
    console.log("Received gameResumed event:", data);
    gamePaused = false;
    console.log("gamePaused is now:", gamePaused);
    menuMessage.textContent = data.message; // e.g., "Player X resumed the game."
    // Hide the in-game menu after 2 seconds.
    setTimeout(() => inGameMenu.classList.add('hidden'), 2000);
});


socket.on('gameQuit', (data) => {
    console.log("Received gameQuit event:", data);
    alert(data.message);
    window.location.href = '/';
});

socket.on('playerLeft', (data) => {
    console.log("Received playerLeft event:", data);
    menuMessage.textContent = data.message;
});

const remotePlayers = {}; // Object to track remote players keyed by socket id

socket.on('playerPositions', (positions) => {
    // Loop over all positions received from the server.
    for (const id in positions) {
        // Skip our own socket id.
        if (id === socket.id) continue;

        let remotePlayer = remotePlayers[id];
        if (!remotePlayer) {
            // Create a new DOM element for this remote player.
            remotePlayer = document.createElement('div');
            remotePlayer.classList.add('remoteAvatar');
            remotePlayer.style.width = '40px';
            remotePlayer.style.height = '40px';
            remotePlayer.style.position = 'absolute';
            remotePlayer.style.backgroundColor = 'red'; // Distinguish from local player.
            board.appendChild(remotePlayer);
            remotePlayers[id] = remotePlayer;
        }
        // Update the remote player's position.
        const pos = positions[id].position;
        remotePlayer.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
});
