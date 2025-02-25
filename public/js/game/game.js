// public/js/game/game.js
import { Player } from './player.js';
import { ResourceManager } from './resource.js';

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
const timerDisplay = document.getElementById('timeLeft');

// In-game menu elements
const inGameMenu = document.getElementById('inGameMenu');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const menuMessage = document.getElementById('menuMessage');

// Game state variables
let gamePaused = false;
let score = 0;
let lastEmit = Date.now();

// Update the scoreboard display
function updateScore(points) {
    score += points;
    scoreboard.textContent = `Score: ${score}`;
}

// Create the local player using your Player class.
const initialPosition = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
const player = new Player(board, initialPosition, 'blue');

// Initialize the Resource Manager.
const resourceManager = new ResourceManager(board, socket, roomCode, playerName, updateScore);
resourceManager.init();

// -------------------------
// Wall (Labyrinth) Handling
// -------------------------
const wallsOnScreen = {};

// Listen for the labyrinth layout event from the server.
socket.on('labyrinthLayout', (layout) => {
    console.log("Received labyrinth layout:", layout);
    window.labyrinthLayout = layout; // Save layout globally for collision detection.

    // Remove any existing walls.
    for (const key in wallsOnScreen) {
        board.removeChild(wallsOnScreen[key]);
    }
    Object.keys(wallsOnScreen).forEach(key => delete wallsOnScreen[key]);

    // Create wall elements.
    layout.forEach(wall => {
        const wallEl = document.createElement('div');
        wallEl.classList.add('wall');
        wallEl.style.position = 'absolute';
        wallEl.style.left = wall.x + 'px';
        wallEl.style.top = wall.y + 'px';
        wallEl.style.width = wall.width + 'px';
        wallEl.style.height = wall.height + 'px';
        board.appendChild(wallEl);
        wallsOnScreen[`${wall.x}-${wall.y}`] = wallEl;
    });
});

// Check wall collisions using relative positions.
function checkWallCollision(player) {
    const avatarX = player.position.x;
    const avatarY = player.position.y;
    const avatarWidth = player.width;
    const avatarHeight = player.height;

    if (!window.labyrinthLayout) return false;

    // Debug: log player's relative position (optional)
    // console.log("Player position:", avatarX, avatarY, "size:", avatarWidth, avatarHeight);

    for (const wall of window.labyrinthLayout) {
        if (
            avatarX < wall.x + wall.width &&
            avatarX + avatarWidth > wall.x &&
            avatarY < wall.y + wall.height &&
            avatarY + avatarHeight > wall.y
        ) {
            console.log("Wall collision detected with wall:", wall);
            return true;
        }
    }
    return false;
}

// -------------------------
// End Wall Handling
// -------------------------

/**
 * Track which keys are currently pressed.
 * We'll calculate velocity inside the game loop based on these flags,
 * rather than setting velocity immediately on key events.
 */
const keysDown = {
    up: false,
    down: false,
    left: false,
    right: false
};

// Listen for keydown events
window.addEventListener('keydown', (e) => {
    if (gamePaused) return;

    switch (e.key) {
        case 'ArrowUp':
        case 'w':
            keysDown.up = true;
            break;
        case 'ArrowDown':
        case 's':
            keysDown.down = true;
            break;
        case 'ArrowLeft':
        case 'a':
            keysDown.left = true;
            break;
        case 'ArrowRight':
        case 'd':
            keysDown.right = true;
            break;
    }
});

// Listen for keyup events
window.addEventListener('keyup', (e) => {
    if (gamePaused) return;

    switch (e.key) {
        case 'ArrowUp':
        case 'w':
            keysDown.up = false;
            break;
        case 'ArrowDown':
        case 's':
            keysDown.down = false;
            break;
        case 'ArrowLeft':
        case 'a':
            keysDown.left = false;
            break;
        case 'ArrowRight':
        case 'd':
            keysDown.right = false;
            break;
    }
});

// Main game loop using requestAnimationFrame
function gameLoop() {
    if (!gamePaused) {
        // 1. Determine velocity from the keysDown object
        let vx = 0, vy = 0;
        if (keysDown.up)    vy -= player.speed;
        if (keysDown.down)  vy += player.speed;
        if (keysDown.left)  vx -= player.speed;
        if (keysDown.right) vx += player.speed;

        // 2. Apply this velocity to our local player
        player.setVelocity(vx, vy);

        // 3. Save current position in case we need to revert (wall collision)
        const previousPosition = { ...player.position };

        // 4. Update the player's position based on the velocity
        player.update();

        // 5. Check for wall collisions; revert if needed
        if (checkWallCollision(player)) {
            player.position = previousPosition;
            player.setVelocity(0, 0); // Stop movement to avoid continuous collision
            player.update();
        }

        // 6. Check resource collisions using the ResourceManager.
        resourceManager.checkCollisions(player.avatar);

        // 7. Throttle the emission of player position to every 100ms
        if (Date.now() - lastEmit > 100) {
            socket.emit('playerMove', {
                roomCode,
                playerName,
                position: player.position
            });
            lastEmit = Date.now();
        }
    }
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// Socket listeners for authoritative timer and global game actions.
socket.on('timeUpdate', (time) => {
    timerDisplay.textContent = time;
});

socket.on('gameOver', (data) => {
    alert(data.message);
    window.location.href = '/';
});

resumeBtn.addEventListener('click', () => {
    console.log("Resume button clicked. Emitting resume action.");
    socket.emit('gameAction', { roomCode, action: 'resume', playerName });
});
quitBtn.addEventListener('click', () => {
    console.log("Quit button clicked. Emitting quit action.");
    socket.emit('gameAction', { roomCode, action: 'quit', playerName });
});

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

socket.on('gamePaused', (data) => {
    console.log("Received gamePaused event:", data);
    gamePaused = true;
    menuMessage.textContent = data.message;
    inGameMenu.classList.remove('hidden');
});

socket.on('gameResumed', (data) => {
    console.log("Received gameResumed event:", data);
    gamePaused = false;
    menuMessage.textContent = data.message;
    setTimeout(() => inGameMenu.classList.add('hidden'), 2000);
});

socket.on('powerUpEffect', (data) => {
    console.log("Received power-up effect:", data);
    if (playerName !== data.source) {
        const originalSpeed = player.speed;
        player.speed *= 0.5;
        setTimeout(() => {
            player.speed = originalSpeed;
            console.log("Slow effect ended, speed restored.");
        }, data.duration);
    }
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

const remotePlayers = {};

socket.on('playerPositions', (positions) => {
    for (const id in positions) {
        if (id === socket.id) continue;
        let remotePlayer = remotePlayers[id];
        if (!remotePlayer) {
            remotePlayer = document.createElement('div');
            remotePlayer.classList.add('remoteAvatar');
            remotePlayer.style.width = '40px';
            remotePlayer.style.height = '40px';
            remotePlayer.style.position = 'absolute';
            remotePlayer.style.backgroundColor = 'red';
            board.appendChild(remotePlayer);
            remotePlayers[id] = remotePlayer;
        }
        const pos = positions[id].position;
        remotePlayer.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
});
