// public/js/game/game.js
import { Player } from './player.js';
import { ResourceManager } from './resource.js';

document.addEventListener('DOMContentLoaded', () => {
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
    const scoreboard = document.getElementById('scoreboard'); // container for scoreboard
    const timerDisplay = document.getElementById('timeLeft');

    // In-game menu elements
    const inGameMenu = document.getElementById('inGameMenu');
    const resumeBtn = document.getElementById('resumeBtn');
    const quitBtn = document.getElementById('quitBtn');
    const menuMessage = document.getElementById('menuMessage');

    // Game state variables
    let gamePaused = false;
    let lastEmit = Date.now();

    // Create the local player using your Player class.
    const initialPosition = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
    const player = new Player(board, initialPosition, 'blue');

    // Initialize the Resource Manager.
    // Note: We pass an empty callback since we rely on server-side score updates.
    const resourceManager = new ResourceManager(board, socket, roomCode, playerName, () => {});
    resourceManager.init();

    // -------------------------
    // Wall (Labyrinth) Handling
    // -------------------------
    const wallsOnScreen = {};

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

        // Ensure the local player's spawn is in a safe zone.
        if (checkWallCollision(player)) {
            console.log("Player spawn in wall detected, repositioning to safe spawn.");
            player.position = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
            player.update();
        }
    });


    function checkWallCollision(player) {
        const avatarX = player.position.x;
        const avatarY = player.position.y;
        const avatarWidth = player.width;
        const avatarHeight = player.height;

        if (!window.labyrinthLayout) return false;

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
     * Track keys pressed so we can compute velocity each frame.
     */
    const keysDown = {
        up: false,
        down: false,
        left: false,
        right: false
    };

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

    /**
     * Main game loop: updates the local player's movement,
     * checks for collisions, and emits position updates.
     */
    function gameLoop() {
        if (!gamePaused) {
            let vx = 0, vy = 0;
            if (keysDown.up) vy -= player.speed;
            if (keysDown.down) vy += player.speed;
            if (keysDown.left) vx -= player.speed;
            if (keysDown.right) vx += player.speed;

            player.setVelocity(vx, vy);
            const previousPosition = { ...player.position };
            player.update();

            if (checkWallCollision(player)) {
                // Revert to previous position if collision detected
                player.position = previousPosition;
                player.setVelocity(0, 0);
                player.update();
            }

            resourceManager.checkCollisions(player.avatar);

            // Emit the player's position every 30ms for smoother remote updates.
            if (Date.now() - lastEmit > 30) {
                socket.emit('playerMove', { roomCode, playerName, position: player.position });
                lastEmit = Date.now();
            }
        }
        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);

    /**
     * Update the scoreboard UI with all players' scores.
     * Expects a scores object in the format: { playerName1: score1, playerName2: score2, ... }
     */
    function updatePlayerScores(scores) {
        const playerScoresUL = document.getElementById('playerScores');
        if (!playerScoresUL) return;
        playerScoresUL.innerHTML = ''; // Clear current list

        // Sort players by score descending and add rank numbers.
        const sortedPlayers = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        sortedPlayers.forEach(([name, score], index) => {
            const li = document.createElement('li');
            li.textContent = `${index + 1}) ${name}: ${score}`;
            playerScoresUL.appendChild(li);
        });
    }

    // Listen for scoresUpdated events from the server.
    socket.on('scoresUpdated', (allScores) => {
        console.log('Received scoresUpdated event:', allScores);
        updatePlayerScores(allScores);
    });

    // Timer update: keep the timer always visible.
    socket.on('timeUpdate', (timeLeft) => {
        const timeSpan = document.getElementById('timeLeft');
        if (timeSpan) timeSpan.textContent = timeLeft;
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

    // Remote players: update their positions as received.
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
});
