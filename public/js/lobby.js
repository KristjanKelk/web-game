// public/js/lobby.js
const socket = io();

const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

// Get DOM elements with null checks
const getElement = (id) => document.getElementById(id);

const roomInfo = getElement('roomInfo');
const playersList = getElement('playersList');
const startButton = getElement('startButton');
const leaveLobbyButton = getElement('leaveLobbyButton');
const lobbyErrorMsg = getElement('lobbyErrorMsg');

// Settings elements
const gameSettingsPanel = getElement('gameSettingsPanel');
const saveSettingsBtn = getElement('saveSettingsBtn');
const settingsErrorMsg = getElement('settingsErrorMsg');
const difficultySelect = getElement('difficultySelect');

// Game mode elements
const gameModePanel = getElement('gameModePanel');
const gameModeRadios = document.getElementsByName('gameMode');
const saveGameModeBtn = getElement('saveGameModeBtn');
const gameModeErrorMsg = getElement('gameModeErrorMsg');

// AI settings elements
const aiSettingsPanel = getElement('aiSettingsPanel');
const aiOpponentsSelect = getElement('aiOpponentsSelect');
const aiDifficultySelect = getElement('aiDifficultySelect');
const saveAISettingsBtn = getElement('saveAISettingsBtn');
const aiSettingsErrorMsg = getElement('aiSettingsErrorMsg');

// Display elements
const displaySettingsDiv = getElement('displaySettings');
const displayGameMode = getElement('displayGameMode');
const aiSettingsDisplay = getElement('aiSettingsDisplay');
const displayAIOpponents = getElement('displayAIOpponents');
const displayAIDifficulty = getElement('displayAIDifficulty');
const displayDifficulty = getElement('displayDifficulty');

// Game mode state
let currentGameMode = 'Multiplayer';

// Validate roomCode and playerName
if (!roomCode || !playerName) {
    if (lobbyErrorMsg) lobbyErrorMsg.textContent = 'Room Code or Player Name missing. Redirecting...';
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
} else {
    if (roomInfo) roomInfo.textContent = `Room Code: ${roomCode}`;
    // Join the lobby
    socket.emit('joinGame', { roomCode, playerName });
}

// Handle join errors from server
socket.on('joinError', (msg) => {
    if (lobbyErrorMsg) lobbyErrorMsg.textContent = msg;
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
});

// Update the player list
socket.on('updatePlayerList', (players) => {
    if (!playersList) return;

    playersList.innerHTML = '';

    // The first player in 'players' array is always the moderator
    players.forEach((player, index) => {
        const li = document.createElement('li');
        let label = player.name;
        if (index === 0) {
            label += ' (Moderator)';
        }
        if (player.name === playerName) {
            label += ' (You)';
        }

        // Add (AI) label if appropriate
        if (player.isAI) {
            label += ' (AI)';
        }

        li.textContent = label;
        playersList.appendChild(li);
    });

    const amIModerator = (players.length > 0 && players[0].name === playerName);
    const otherHumanPlayers = players.filter(p => !p.isAI && p.name !== playerName).length;

    // Show settings panels only if I'm the moderator
    if (gameModePanel) gameModePanel.style.display = amIModerator ? 'block' : 'none';
    if (gameSettingsPanel) gameSettingsPanel.style.display = amIModerator ? 'block' : 'none';
    if (aiSettingsPanel) aiSettingsPanel.style.display = (amIModerator && currentGameMode === 'SinglePlayer') ? 'block' : 'none';

    // Show button only if I'm the moderator
    if (startButton) {
        startButton.style.display = amIModerator ? 'inline-block' : 'none';

        if (amIModerator) {
            // Set button text based on game mode
            if (currentGameMode === 'SinglePlayer') {
                startButton.textContent = 'Start Single-Player Game';
                startButton.className = 'single-player-btn';

                // Always enable in single player
                startButton.disabled = false;
                startButton.title = '';
                startButton.classList.remove('disabled-btn');
            } else {
                startButton.textContent = 'Start Multiplayer Game';
                startButton.className = 'multi-player-btn';

                // Disable button if fewer than 2 human players in multiplayer
                if (otherHumanPlayers < 1) {
                    startButton.disabled = true;
                    startButton.title = 'At least 2 human players are required to start multiplayer';
                    startButton.classList.add('disabled-btn');
                } else {
                    startButton.disabled = false;
                    startButton.title = '';
                    startButton.classList.remove('disabled-btn');
                }
            }
        }
    }

    // Show the read-only display for everyone
    if (displaySettingsDiv) displaySettingsDiv.style.display = 'block';
});

// Game settings update handler
socket.on('settingsUpdated', (settings) => {
    if (displayDifficulty) displayDifficulty.textContent = settings.difficulty;
});

// Game mode update handler
socket.on('gameModeUpdated', (data) => {
    currentGameMode = data.gameMode;

    if (displayGameMode) displayGameMode.textContent = data.gameMode;

    // Show/hide AI settings based on game mode
    if (aiSettingsDisplay) aiSettingsDisplay.style.display = currentGameMode === 'SinglePlayer' ? 'block' : 'none';

    // Update moderator controls
    if (playersList && playersList.children.length > 0 && playersList.children[0].textContent.includes('(You)')) {
        if (aiSettingsPanel) aiSettingsPanel.style.display = currentGameMode === 'SinglePlayer' ? 'block' : 'none';

        // Update start button
        if (startButton) {
            if (currentGameMode === 'SinglePlayer') {
                startButton.textContent = 'Start Single-Player Game';
                startButton.className = 'single-player-btn';
                startButton.disabled = false;
                startButton.title = '';
                startButton.classList.remove('disabled-btn');
            } else {
                startButton.textContent = 'Start Multiplayer Game';
                startButton.className = 'multi-player-btn';

                // Check if we have enough human players
                const humanPlayers = Array.from(playersList.children)
                    .filter(li => !li.textContent.includes('(AI)'))
                    .length;

                if (humanPlayers < 2) {
                    startButton.disabled = true;
                    startButton.title = 'At least 2 human players are required to start multiplayer';
                    startButton.classList.add('disabled-btn');
                } else {
                    startButton.disabled = false;
                    startButton.title = '';
                    startButton.classList.remove('disabled-btn');
                }
            }
        }
    }

    // Also update radio button selection
    for (const radio of gameModeRadios) {
        if (radio) radio.checked = radio.value === currentGameMode;
    }
});

// AI settings update handler
socket.on('aiSettingsUpdated', (settings) => {
    if (displayAIOpponents) displayAIOpponents.textContent = settings.aiOpponents;
    if (displayAIDifficulty) displayAIDifficulty.textContent = settings.aiDifficulty;

    // Update form values
    if (aiOpponentsSelect) aiOpponentsSelect.value = settings.aiOpponents;
    if (aiDifficultySelect) aiDifficultySelect.value = settings.aiDifficulty;
});

// Error handlers
socket.on('settingsError', (msg) => {
    if (settingsErrorMsg) settingsErrorMsg.textContent = msg;
});

socket.on('gameModeError', (msg) => {
    if (gameModeErrorMsg) gameModeErrorMsg.textContent = msg;
});

socket.on('aiSettingsError', (msg) => {
    if (aiSettingsErrorMsg) aiSettingsErrorMsg.textContent = msg;
});

// Add event listeners with null checks
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        if (settingsErrorMsg) settingsErrorMsg.textContent = '';

        if (difficultySelect) {
            const newSettings = {
                difficulty: difficultySelect.value
            };

            socket.emit('updateGameSettings', {
                roomCode,
                settings: newSettings
            });
        }
    });
}

if (saveGameModeBtn) {
    saveGameModeBtn.addEventListener('click', () => {
        if (gameModeErrorMsg) gameModeErrorMsg.textContent = '';

        let selectedGameMode = 'Multiplayer';
        for (const radio of gameModeRadios) {
            if (radio && radio.checked) {
                selectedGameMode = radio.value;
                break;
            }
        }

        socket.emit('updateGameMode', {
            roomCode,
            gameMode: selectedGameMode
        });
    });
}

if (saveAISettingsBtn) {
    saveAISettingsBtn.addEventListener('click', () => {
        if (aiSettingsErrorMsg) aiSettingsErrorMsg.textContent = '';

        if (aiOpponentsSelect && aiDifficultySelect) {
            socket.emit('updateAISettings', {
                roomCode,
                aiOpponents: aiOpponentsSelect.value,
                aiDifficulty: aiDifficultySelect.value
            });
        }
    });
}

// Set initial game mode state when radio buttons change
for (const radio of gameModeRadios) {
    if (radio) {
        radio.addEventListener('change', function() {
            if (this.checked && aiSettingsPanel) {
                // Toggle AI settings panel visibility
                aiSettingsPanel.style.display = this.value === 'SinglePlayer' ? 'block' : 'none';
            }
        });
    }
}

// Lobby start button (moderator only)
if (startButton) {
    startButton.addEventListener('click', () => {
        socket.emit('startGame', roomCode);
    });
}

socket.on('gameStarted', () => {
    window.location.href = '/game.html';
});

socket.on('lobbyClosed', () => {
    alert('The lobby has been closed by the moderator.');
    window.location.href = '/';
});

if (leaveLobbyButton) {
    leaveLobbyButton.addEventListener('click', () => {
        socket.emit('leaveLobby', roomCode);
        window.location.href = '/';
    });
}