// public/js/game/game.js
import { Player } from './player.js';
import { ResourceManager } from './resource.js';

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // for bots -----------

    const urlParams = new URLSearchParams(window.location.search);
    const gameMode = urlParams.get('mode');
    console.log(gameMode); // debug
    const difficulty = urlParams.get('difficulty');

    // for bots ------------

    // Retrieve room info and player name from localStorage
    const roomCode = localStorage.getItem('roomCode');
    const playerName = localStorage.getItem('playerName');

    if (gameMode != 'singleplayer') { // no room for sinpleplayer - taking socket off from locgi pretty much

        if (!roomCode || !playerName) {
            console.error("Missing roomCode or playerName.");
            window.location.href = '/';
        } else {
            // Immediately join the game state.
            socket.emit('joinGameState', { roomCode, playerName });
            console.log(`Emitted joinGameState with roomCode: ${roomCode} and playerName: ${playerName}`);
        }

    }

    

    socket.on('joinError', (msg) => {
        console.error("Join error received from server:", msg);
        alert(msg);
        window.location.href = '/';
    });

    // DOM references
    const board = document.getElementById('board');
    //const scoreboard = document.getElementById('scoreboard'); // container for scoreboard
    //const timerDisplay = document.getElementById('timeLeft');

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

    // ------------- bots ------------------

    const botLevels = [
        urlParams.get('bot1'),
        urlParams.get('bot2'),
        urlParams.get('bot3')
    ].filter(bot => bot !== "None");

    let gameSpeedMultiplier = 1;

    if (difficulty === 'hard') {
        gameSpeedMultiplier = 1.5;
    } else if (difficulty === 'easy') {
        gameSpeedMultiplier = 0.8;
    }

    const bots = [];

    function spawnBot(level, index) {

        const bot = new Player(board, { x: 100 + index * 50, y: 100 }, "red");
        bot.level = level;

        if (level === "Level 1") {
            bot.speed = 2;
        } else if (level === "Level 2") {
            bot.speed = 3;
        } else if (level === "Level 3") {
            bot.speed = 4;
        }

        bots.push(bot);

    }

    botLevels.forEach((level, i) => spawnBot(level, i));

    // ------------- bots ------------------

    // -------------------------
    // Wall (Labyrinth) Handling
    // -------------------------
    const wallsOnScreen = {};

    // handling sinple player map-gen

    if (gameMode === 'singleplayer') {

        console.log("can I get a wallll-ah...");
        const difficulty = urlParams.get('difficulty') || 'medium';
        const labyrinthLayout = generateLabyrinth(difficulty);

        renderLabyrinth(labyrinthLayout);

    } else {
        
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
    
            ensureSafeSpawn(player); // clena up walls
        });

    }

    // easier to duplicate the generator and render, etc here directly for single player:
    function generateLabyrinth(difficulty) {

        const boardWidth = 1300;
        const boardHeight = 1000;
        const cols = 26;
        const rows = 20;
        const cellWidth = boardWidth / cols;
        const cellHeight = boardHeight / rows;
    
        let wallProbability = 0.2;
        if (difficulty === 'hard') wallProbability = 0.35;
    
        const walls = [];
        const centerCol = Math.floor(cols / 2);
        const centerRow = Math.floor(rows / 2);
        const clearZoneSize = 2;
    
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.abs(c - centerCol) <= clearZoneSize && Math.abs(r - centerRow) <= clearZoneSize) {
                    continue;
                }
                if (Math.random() < wallProbability) {
                    walls.push({
                        x: c * cellWidth,
                        y: r * cellHeight,
                        width: cellWidth,
                        height: cellHeight
                    });
                }
            }
        }

        return walls;

    }

    function renderLabyrinth(layout) {

        layout.forEach(wall => {
            const wallEl = document.createElement('div');
            wallEl.classList.add('wall');
            wallEl.style.position = 'absolute';
            wallEl.style.left = `${wall.x}px`;
            wallEl.style.top = `${wall.y}px`;
            wallEl.style.width = `${wall.width}px`;
            wallEl.style.height = `${wall.height}px`;
            board.appendChild(wallEl);
        });

    }

    function isInsideWall(x, y, labyrinthLayout) {
        for (const wall of labyrinthLayout) {
            if (x >= wall.x && x < wall.x + wall.width &&
                y >= wall.y && y < wall.y + wall.height) {
                return true;
            }
        }
        return false;
    }
    
    document.addEventListener('keydown', (event) => {
        const speed = 10;
        let newX = player.x;
        let newY = player.y;
    
        if (event.key === 'ArrowUp') newY -= speed;
        if (event.key === 'ArrowDown') newY += speed;
        if (event.key === 'ArrowLeft') newX -= speed;
        if (event.key === 'ArrowRight') newX += speed;
    
        if (!isInsideWall(newX, newY, window.labyrinthLayout)) {
            player.x = newX;
            player.y = newY;
            player.update();
        }
    });
    // easier to duplicate the generator and render, etc here directly for single player:
    

    function ensureSafeSpawn(player) {
        let attempts = 0;
        while (checkWallCollision(player) && attempts < 10) {
            
            console.log("Player spawn in wall detected, repositioning...");
            player.position = {
                x: board.clientWidth / 2 + (Math.random() * 40 - 20), // Slightly randomized center
                y: board.clientHeight / 2 + (Math.random() * 40 - 20)
            };
            player.update();
            attempts++;
        }

        if (attempts >= 10) {
            console.warn("Failed to find a completely safe spawn after 10 attempts.");
        }
    }

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
    // FPS counter
    const fpsMeter = document.createElement('div');
    fpsMeter.style.position = 'fixed';
    fpsMeter.style.top = '10px';
    fpsMeter.style.right = '10px';
    fpsMeter.style.background = 'rgba(0, 0, 0, 0.7)';
    fpsMeter.style.color = '#0f0';
    fpsMeter.style.padding = '5px 10px';
    fpsMeter.style.borderRadius = '5px';
    fpsMeter.style.fontFamily = 'monospace';
    fpsMeter.style.zIndex = '1000';
    document.body.appendChild(fpsMeter);

    let frameCount = 0;
    let lastFpsUpdateTime = 0;
    let lastFrameTime = performance.now();

    function gameLoop(timestamp) {
        // Calculate FPS
        const deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        frameCount++;

        // Updates FPS every half second
        if (timestamp - lastFpsUpdateTime > 500) {
            const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdateTime));
            fpsMeter.textContent = `${fps} FPS`;

            // IF Fps is below 60 it turns red
            fpsMeter.style.color = fps >= 60 ? '#0f0' : '#f00';

            frameCount = 0;
            lastFpsUpdateTime = timestamp;
        }

        if (!gamePaused) {
            let vx = 0, vy = 0;
            if (keysDown.up) vy -= player.speed;
            if (keysDown.down) vy += player.speed;
            if (keysDown.left) vx -= player.speed;
            if (keysDown.right) vx += player.speed;

            player.setVelocity(vx * (deltaTime / 16.67), vy * (deltaTime / 16.67));
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
        console.log("Received gameOver event:", data);

        const victoryScreen = document.getElementById('victoryScreen');
        const winnerContent = document.getElementById('winnerContent');
        const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');

        winnerContent.innerHTML = '';

        if (data.isTie) {
            // It's a tie
            const tieMessage = document.createElement('div');
            tieMessage.className = 'winner';
            tieMessage.textContent = "IT'S A TIE!";
            winnerContent.appendChild(tieMessage);

            const tiedPlayers = document.createElement('div');
            tiedPlayers.className = 'tiedPlayers';
            tiedPlayers.innerHTML = 'Between: <br>' + data.tiedPlayers.map(name => `<span>${name}</span>`).join(', ');
            winnerContent.appendChild(tiedPlayers);

            const score = document.createElement('div');
            score.className = 'score';
            score.textContent = `Score: ${data.highestScore}`;
            winnerContent.appendChild(score);
        } else {
            const winnerName = document.createElement('div');
            winnerName.className = 'winner';
            winnerName.textContent = data.winner;
            winnerContent.appendChild(winnerName);

            const winnerLabel = document.createElement('div');
            winnerLabel.textContent = 'is the WINNER!';
            winnerContent.appendChild(winnerLabel);

            const score = document.createElement('div');
            score.className = 'score';
            score.textContent = `Score: ${data.score}`;
            winnerContent.appendChild(score);

            createConfetti();
        }

        setTimeout(() => {
            victoryScreen.classList.add('visible');
        }, 500);

        returnToLobbyBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    });

    // Add a function to create confetti effect
    function createConfetti() {
        const container = document.querySelector('.victoryContent');
        const colors = ['#0ff', '#ff0', '#f0f', '#0f0', '#fff'];

        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            confetti.style.animationDelay = Math.random() * 5 + 's';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

            // Randomize the size
            const size = Math.random() * 10 + 5;
            confetti.style.width = size + 'px';
            confetti.style.height = size + 'px';

            document.body.appendChild(confetti);
        }
    }

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
