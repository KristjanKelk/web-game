// public/js/game/game.js - Updated with unique bot colors
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
    }

    // DOM references - cache them for better performance
    const board = document.getElementById('board');
    const inGameMenu = document.getElementById('inGameMenu');
    const resumeBtn = document.getElementById('resumeBtn');
    const restartBtn = document.getElementById('restartBtn');
    const quitBtn = document.getElementById('quitBtn');
    const menuMessage = document.getElementById('menuMessage');
    const victoryScreen = document.getElementById('victoryScreen');
    const winnerContent = document.getElementById('winnerContent');
    const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
    const timeSpan = document.getElementById('timeLeft');

    // Game state variables
    let gamePaused = false;
    let lastEmit = Date.now();
    let gameActive = true; // New flag to track if the game is active

    // Create the local player
    const initialPosition = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
    const player = new Player(board, initialPosition, 'blue');

    // Initialize the Resource Manager
    const resourceManager = new ResourceManager(board, socket, roomCode, playerName, () => {});

    // -------------------------
    // Wall (Labyrinth) Handling
    // -------------------------
    const wallsOnScreen = {};

    // More efficient wall collision check
    function checkWallCollision(position, width, height) {
        if (!window.labyrinthLayout) return false;

        const x = position.x;
        const y = position.y;

        // Check rectangle intersection with each wall
        for (let i = 0; i < window.labyrinthLayout.length; i++) {
            const wall = window.labyrinthLayout[i];
            if (
                x < wall.x + wall.width &&
                x + width > wall.x &&
                y < wall.y + wall.height &&
                y + height > wall.y
            ) {
                return true;
            }
        }
        return false;
    }

    socket.on('labyrinthLayout', (layout) => {
        window.labyrinthLayout = layout;

        // Use document fragment for better performance when adding multiple elements
        const fragment = document.createDocumentFragment();

        // Remove existing walls
        Object.values(wallsOnScreen).forEach(wall => {
            if (wall.parentNode === board) {
                board.removeChild(wall);
            }
        });
        Object.keys(wallsOnScreen).forEach(key => delete wallsOnScreen[key]);

        // Create wall elements
        layout.forEach(wall => {
            const wallEl = document.createElement('div');
            wallEl.classList.add('wall');
            wallEl.style.position = 'absolute';
            wallEl.style.left = wall.x + 'px';
            wallEl.style.top = wall.y + 'px';
            wallEl.style.width = wall.width + 'px';
            wallEl.style.height = wall.height + 'px';
            fragment.appendChild(wallEl);
            wallsOnScreen[`${wall.x}-${wall.y}`] = wallEl;
        });

        board.appendChild(fragment);

        // Ensure player spawns in safe zone
        if (checkWallCollision(player.position, player.width, player.height)) {
            player.position = { x: board.clientWidth / 2, y: board.clientHeight / 2 };
            player.update();
        }
    });

    /**
     * Track keys pressed so we can compute velocity each frame.
     */
    const keysDown = {
        up: false,
        down: false,
        left: false,
        right: false
    };

    function handleKey(e, isKeyDown) {
        if (gamePaused) return;

        const keyMap = {
            'arrowup': 'up',
            'w': 'up',
            'arrowdown': 'down',
            's': 'down',
            'arrowleft': 'left',
            'a': 'left',
            'arrowright': 'right',
            'd': 'right'
        };

        const direction = keyMap[e.key.toLowerCase()]; // Case insensitive key matching
        if (direction) {
            keysDown[direction] = isKeyDown;
        }
    }

    // Event listener cleanup function
    function setupEventListeners() {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        resumeBtn.addEventListener('click', handleResumeClick);
        restartBtn.addEventListener('click', handleRestartClick);
        quitBtn.addEventListener('click', handleQuitClick);
        returnToLobbyBtn.addEventListener('click', handleReturnToLobby);
    }

    function removeEventListeners() {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        resumeBtn.removeEventListener('click', handleResumeClick);
        restartBtn.removeEventListener('click', handleRestartClick);
        quitBtn.removeEventListener('click', handleQuitClick);
        returnToLobbyBtn.removeEventListener('click', handleReturnToLobby);
    }

    // Event handlers
    const handleKeyDown = (e) => handleKey(e, true);
    const handleKeyUp = (e) => handleKey(e, false);

    const handleResumeClick = () => {
        socket.emit('gameAction', { roomCode, action: 'resume', playerName });
    };

    const handleRestartClick = () => {
        socket.emit('gameAction', { roomCode, action: 'restart', playerName });
    };

    const handleQuitClick = () => {
        socket.emit('gameAction', { roomCode, action: 'quit', playerName });
    };

    const handleReturnToLobby = () => {
        window.location.href = '/';
    };

    setupEventListeners();

    // Keyboard shortcut for pause/resume
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && gameActive) {
            socket.emit('gameAction', {
                roomCode,
                action: gamePaused ? 'resume' : 'pause',
                playerName
            });
            e.preventDefault();
        }
    });

    // FPS counter setup
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

    /**
     * Main game loop
     */
    function gameLoop(timestamp) {
        // Calculate FPS
        const deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        frameCount++;

        // Updates FPS every half second
        if (timestamp - lastFpsUpdateTime > 500) {
            const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdateTime));
            fpsMeter.textContent = `${fps} FPS`;
            fpsMeter.style.color = fps >= 60 ? '#0f0' : '#f00';
            frameCount = 0;
            lastFpsUpdateTime = timestamp;
        }

        if (!gamePaused && gameActive) {
            // Calculate player velocity
            let vx = 0, vy = 0;
            if (keysDown.up) vy -= player.speed;
            if (keysDown.down) vy += player.speed;
            if (keysDown.left) vx -= player.speed;
            if (keysDown.right) vx += player.speed;

            // Apply time-based movement for consistent speed regardless of framerate
            player.setVelocity(vx * (deltaTime / 16.67), vy * (deltaTime / 16.67));

            // Save position before update for collision fallback
            const previousPosition = { ...player.position };
            player.update();

            // Check wall collision and revert if needed
            if (checkWallCollision(player.position, player.width, player.height)) {
                player.position = previousPosition;
                player.setVelocity(0, 0);
                player.update();
            }

            // Check resource collisions
            resourceManager.checkCollisions(player.avatar);

            // Throttle position emission for network efficiency
            if (Date.now() - lastEmit > 30) {
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

    // Start the game loop
    requestAnimationFrame(gameLoop);

    /**
     * Update the scoreboard UI with all players' scores.
     */
    function updatePlayerScores(scores) {
        const playerScoresUL = document.getElementById('playerScores');
        if (!playerScoresUL) return;

        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();

        // Sort players by score descending
        const sortedPlayers = Object.entries(scores).sort((a, b) => b[1] - a[1]);

        // Add each player to the list
        sortedPlayers.forEach(([name, score], index) => {
            const li = document.createElement('li');

            // Add classes based on player type
            if (name.includes('Bot') || name.includes('NPC-')) {
                li.className = 'NPC-player';

                // Extract NPC number from name if possible
                const NPCNumberMatch = name.match(/NPC-(\d+)/);
                if (NPCNumberMatch && NPCNumberMatch[1]) {
                    li.className += ` NPC-player-${NPCNumberMatch[1]}`;
                }
            }

            if (name === playerName) {
                li.className += ' current-player';
            }

            li.textContent = `${index + 1}) ${name}: ${score}`;
            fragment.appendChild(li);
        });

        // Clear and update in one operation
        playerScoresUL.innerHTML = '';
        playerScoresUL.appendChild(fragment);
    }

    // Function to create confetti effect
    function createConfetti() {
        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        const colors = ['#0ff', '#ff0', '#f0f', '#0f0', '#fff'];

        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            confetti.style.animationDelay = Math.random() * 5 + 's';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

            const size = Math.random() * 10 + 5;
            confetti.style.width = size + 'px';
            confetti.style.height = size + 'px';

            fragment.appendChild(confetti);
        }

        document.body.appendChild(fragment);
    }

    // Remote players management system
    const remotePlayers = {};

    // NPC player colors
    const botColors = {
        1: '#FF5733',
        2: '#33FF57',
        3: '#faff5d',
    };

    // Debug info
    const botDebugInfo = {};

    // Process player positions from server
    socket.on('playerPositions', (positions) => {
        // Create a list of seen bots for debugging
        const seenBots = [];

        // Get all current remote player IDs
        const currentIds = Object.keys(positions);

        // Check for players that are no longer in the update
        Object.keys(remotePlayers).forEach(id => {
            if (!currentIds.includes(id) && id !== socket.id) {
                // Remove players that are gone
                if (remotePlayers[id].parentNode === board) {
                    board.removeChild(remotePlayers[id]);
                }
                delete remotePlayers[id];
            }
        });

        // Update or create remote players
        for (const id in positions) {
            // Skip self
            if (id === socket.id) continue;

            const pos = positions[id].position;
            const playerData = positions[id];

            // Skip players in walls (addresses NPC going through walls)
            // Only do this check if the layout is available
            if (window.labyrinthLayout && checkWallCollision(pos, 40, 40)) {
                continue;
            }

            // Add to seen bots list for debugging
            if (id.startsWith('NPC-')) {
                seenBots.push(id);

                // Extract bot number
                const botNumberMatch = playerData.playerName ? playerData.playerName.match(/NPC-(\d+)/) : null;
                const botNumber = botNumberMatch ? parseInt(botNumberMatch[1]) : null;

                // Store debug info
                botDebugInfo[id] = {
                    name: playerData.playerName,
                    number: botNumber,
                    position: pos
                };
            }

            let remotePlayer = remotePlayers[id];

            // Create new remote player if needed
            if (!remotePlayer) {
                remotePlayer = document.createElement('div');
                remotePlayer.classList.add('remoteAvatar');
                remotePlayer.style.width = '40px';
                remotePlayer.style.height = '40px';
                remotePlayer.style.position = 'absolute';

                // Differentiate between human players and NPC
                if (id.startsWith('NPC-')) {
                    remotePlayer.dataset.NPCId = id;

                    // Extract NPC number from name if possible
                    const NPCNumberMatch = playerData.playerName ? playerData.playerName.match(/NPC-(\d+)/) : null;
                    if (NPCNumberMatch && NPCNumberMatch[1]) {
                        const NPCNumber = parseInt(NPCNumberMatch[1]);
                        remotePlayer.dataset.NPCNumber = NPCNumber;

                        // Assign distinct color based on NPC number
                        remotePlayer.style.backgroundColor = botColors[NPCNumber] || '#ff9900';
                    } else {
                        // Fallback color
                        remotePlayer.style.backgroundColor = '#ff9900';
                    }
                } else {
                    remotePlayer.style.backgroundColor = 'red'; // Red for human players
                }

                board.appendChild(remotePlayer);
                remotePlayers[id] = remotePlayer;
            }

            // Update position using transform for better performance
            remotePlayer.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        }

        // Debug log - uncomment when needed
        // console.log(`Seen bots this frame: ${seenBots.length}`, botDebugInfo);
    });

    // Socket event handlers
    socket.on('joinError', (msg) => {
        alert(msg);
        window.location.href = '/';
    });

    socket.on('scoresUpdated', (allScores) => {
        // Debug log - uncomment when needed
        // console.log("Scores updated:", allScores);
        updatePlayerScores(allScores);
    });

    socket.on('timeUpdate', (timeLeft) => {
        if (timeSpan) timeSpan.textContent = timeLeft;
    });

    socket.on('gamePaused', (data) => {
        gamePaused = true;
        menuMessage.textContent = data.message;
        inGameMenu.classList.remove('hidden');
    });

    socket.on('gameResumed', (data) => {
        gamePaused = false;
        menuMessage.textContent = data.message;
        setTimeout(() => inGameMenu.classList.add('hidden'), 2000);
    });

    socket.on('gameOver', (data) => {
        gameActive = false;

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
    });

    socket.on('powerUpEffect', (data) => {
        if (playerName !== data.source) {
            const originalSpeed = player.speed;
            player.speed *= 0.5;
            setTimeout(() => {
                player.speed = originalSpeed;
            }, data.duration);
        }
    });

    socket.on('gameQuit', (data) => {
        gameActive = false;
        alert(data.message);
        window.location.href = '/';
    });

    socket.on('playerLeft', (data) => {
        menuMessage.textContent = data.message;
    });

    socket.on('gameRestart', (data) => {
        gameActive = true;
        resourceManager.clearResources();
        menuMessage.textContent = data.message;
        updatePlayerScores(data.resetScores);

        if (timeSpan) timeSpan.textContent = "60";

        setTimeout(() => inGameMenu.classList.add('hidden'), 2000);
        gamePaused = false;
    });

    // Clean up resources on page unload
    window.addEventListener('beforeunload', () => {
        removeEventListeners();
        resourceManager.destroy();
    });
});