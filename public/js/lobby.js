// public/js/lobby.js - Debugged Version
const socket = io();

const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

// Debug function
function debug(message) {
    console.log(`[DEBUG] ${message}`);
}

debug("Script starting...");

// Get DOM elements with null checks
const getElement = (id) => {
    const element = document.getElementById(id);
    if (!element) debug(`Element with ID '${id}' not found!`);
    return element;
};

const roomInfo = getElement('roomInfo');
const playersList = getElement('playersList');
const startButton = getElement('startButton');
const leaveLobbyButton = getElement('leaveLobbyButton');
const lobbyErrorMsg = getElement('lobbyErrorMsg');

// Mode buttons
const multiplayerBtn = getElement('multiplayerBtn');
const singlePlayerBtn = getElement('singlePlayerBtn');

// Settings panels and elements
const gameSettingsPanel = getElement('gameSettingsPanel');
const difficultySelect = getElement('difficultySelect');
const saveSettingsBtn = getElement('saveSettingsBtn');

// NPC settings
const NPCOpponentsSelect = getElement('NPCOpponentsSelect');
const NPCDifficultySelect = getElement('NPCDifficultySelect');

// Display elements
const displaySettingsDiv = getElement('displaySettings');
const displayGameMode = getElement('displayGameMode');
const NPCSettingsDisplay = getElement('NPCSettingsDisplay');
const displayNPCOpponents = getElement('displayNPCOpponents');
const displayNPCDifficulty = getElement('displayNPCDifficulty');
const displayDifficulty = getElement('displayDifficulty');

// Game state
let currentGameMode = 'Multiplayer';
let amIModerator = false;
let previewBots = []; // Store preview bot information
let realPlayers = []; // Store real players

debug("DOM elements loaded, initializing...");

// Validate roomCode and playerName
if (!roomCode || !playerName) {
    if (lobbyErrorMsg) lobbyErrorMsg.textContent = 'Room Code or Player Name missing. Redirecting...';
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
} else {
    if (roomInfo) roomInfo.textContent = `Room Code: ${roomCode}`;
    debug(`Joining game with roomCode: ${roomCode}, playerName: ${playerName}`);
    // Join the lobby
    socket.emit('joinGame', { roomCode, playerName });
}

// Show some bots immediately to test - comment this out if not needed
function forceBotCreation() {
    debug("*** FORCING BOT CREATION FOR TESTING ***");
    previewBots = [
        { name: "BOT-1", isNPC: true, isPreview: true },
        { name: "BOT-2", isNPC: true, isPreview: true },
        { name: "BOT-3", isNPC: true, isPreview: true }
    ];
    updatePlayerListDisplay();
}

// Function to update the player list including real players and preview bots
function updatePlayerListDisplay() {
    if (!playersList) {
        debug("playersList element not found!");
        return;
    }

    debug(`Updating player list: ${realPlayers.length} real players, ${previewBots.length} preview bots`);

    playersList.innerHTML = '';

    // Add real players first
    realPlayers.forEach((player, index) => {
        const li = document.createElement('li');
        let label = player.name;
        if (index === 0) {
            label += ' (Moderator)';
        }
        if (player.name === playerName) {
            label += ' (You)';
        }

        // Add NPC label if this is a real NPC player
        if (player.isNPC) {
            label += ' (NPC)';
            li.classList.add('NPC-player');
        }

        li.textContent = label;
        playersList.appendChild(li);
        debug(`Added real player: ${label}`);
    });

    // Add preview bots if in single player mode
    if (currentGameMode === 'SinglePlayer' && amIModerator) {
        debug(`Adding ${previewBots.length} preview bots to player list`);
        previewBots.forEach(bot => {
            const li = document.createElement('li');
            li.textContent = `${bot.name} (NPC)`;
            li.classList.add('NPC-player', 'preview-bot');
            playersList.appendChild(li);
            debug(`Added preview bot: ${bot.name}`);
        });
    } else {
        debug(`Not adding preview bots. currentGameMode=${currentGameMode}, amIModerator=${amIModerator}`);
    }
}

// Function to create preview NPC bots based on settings
function updatePreviewBots() {
    if (!NPCOpponentsSelect) {
        debug("NPCOpponentsSelect element not found!");
        return;
    }

    const botCount = parseInt(NPCOpponentsSelect.value);
    const difficulty = NPCDifficultySelect ? NPCDifficultySelect.value : 'Medium';

    debug(`Creating ${botCount} preview bots with difficulty ${difficulty}`);

    // Create preview bots array
    previewBots = [];
    for (let i = 0; i < botCount; i++) {
        previewBots.push({
            name: `NPC-${i+1}`,
            isNPC: true,
            difficulty: difficulty,
            isPreview: true
        });
    }

    debug(`Created ${previewBots.length} preview bots`);

    // Update the display
    updatePlayerListDisplay();
}

function validateGameMode(mode) {
    debug(`Validating game mode ${mode} with ${realPlayers.length} real players`);

    if (mode === 'SinglePlayer' && realPlayers.length > 1) {
        if (lobbyErrorMsg) {
            lobbyErrorMsg.textContent = 'Single Player mode is only available when there is exactly 1 human player.';
            lobbyErrorMsg.style.display = 'block';

            // Automatically switch back to multiplayer
            setTimeout(() => {
                switchGameMode('Multiplayer');
                if (lobbyErrorMsg) {
                    lobbyErrorMsg.textContent = '';
                    lobbyErrorMsg.style.display = 'none';
                }
            }, 3000);
        }
        return false;
    }

    if (lobbyErrorMsg) {
        lobbyErrorMsg.textContent = '';
        lobbyErrorMsg.style.display = 'none';
    }
    return true;
}

// Function to switch game mode
function switchGameMode(mode) {

    if (!validateGameMode(mode)) {
        return;
    }

    currentGameMode = mode;

    // Show appropriate settings
    if (gameSettingsPanel) {
        if (mode === 'Multiplayer') {
            // Show multiplayer settings, hide NPC settings
            gameSettingsPanel.className = 'multiplayer-active';

            // Update buttons
            if (multiplayerBtn) multiplayerBtn.classList.add('active');
            if (singlePlayerBtn) singlePlayerBtn.classList.remove('active');

            if (startButton) {
                startButton.textContent = 'Start Multiplayer Game';
                startButton.className = 'action-btn multi-player-btn';
                updateStartButtonState();
            }

            // Clear preview bots in multiplayer mode
            previewBots = [];
            debug("Cleared preview bots for multiplayer mode");
        } else {
            // Hide multiplayer settings, show NPC settings
            gameSettingsPanel.className = 'singleplayer-active';

            // Update buttons
            if (multiplayerBtn) multiplayerBtn.classList.remove('active');
            if (singlePlayerBtn) singlePlayerBtn.classList.add('active');

            if (startButton) {
                startButton.textContent = 'Start Single-Player Game';
                startButton.className = 'action-btn single-player-btn';
                startButton.disabled = false;
                startButton.classList.remove('disabled-btn');
            }

            // Create preview bots
            updatePreviewBots();
        }
    }

    // Update display text
    if (displayGameMode) displayGameMode.textContent = mode;

    // Update display sections
    if (NPCSettingsDisplay) {
        NPCSettingsDisplay.style.display = mode === 'SinglePlayer' ? 'block' : 'none';
    }

    // Update the player list display
    updatePlayerListDisplay();

    // Send update to server
    debug(`Sending updateGameMode to server: ${mode}`);
    socket.emit('updateGameMode', {
        roomCode,
        gameMode: mode
    });

    // If switching to SinglePlayer, automatically send NPC settings too
    if (mode === 'SinglePlayer' && NPCOpponentsSelect && NPCDifficultySelect) {
        const NPCSettings = {
            roomCode,
            NPCOpponents: NPCOpponentsSelect.value,
            NPCDifficulty: NPCDifficultySelect.value
        };
        debug(`Sending NPC settings to server: ${JSON.stringify(NPCSettings)}`);
        socket.emit('updateNPCSettings', NPCSettings);

        // Also set difficulty to Easy
        debug("Setting difficulty to Easy for SinglePlayer mode");
        socket.emit('updateGameSettings', {
            roomCode,
            settings: { difficulty: 'Easy' }
        });
    }
}

// Update start button state for multiplayer
function updateStartButtonState() {
    if (!startButton || currentGameMode !== 'Multiplayer') return;

    // Count human players
    const humanPlayers = realPlayers.filter(p => !p.isNPC).length;
    const otherHumanPlayers = humanPlayers - 1; // Excluding self

    debug(`Updating start button state: ${humanPlayers} human players, ${otherHumanPlayers} other players`);

    if (otherHumanPlayers < 1) {
        startButton.disabled = true;
        startButton.classList.add('disabled-btn');
        debug("Start button disabled: not enough players");
    } else {
        startButton.disabled = false;
        startButton.classList.remove('disabled-btn');
        debug("Start button enabled");
    }
}

// Handle join errors from server
socket.on('joinError', (msg) => {
    debug(`Join error received: ${msg}`);
    if (lobbyErrorMsg) lobbyErrorMsg.textContent = msg;
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
});

// Update the player list
socket.on('updatePlayerList', (players) => {
    debug(`Received updatePlayerList: ${players.length} players`);
    debug(`Players: ${JSON.stringify(players)}`);

    // Store real players
    realPlayers = players;

    // Check if I'm the moderator
    amIModerator = (players.length > 0 && players[0].name === playerName);
    debug(`amIModerator: ${amIModerator}`);

    // Show/hide moderator controls
    const moderatorElements = document.querySelectorAll('.moderator-only');
    moderatorElements.forEach(el => {
        el.style.display = amIModerator ? 'block' : 'none';
    });

    if (startButton) {
        startButton.style.display = amIModerator ? 'inline-block' : 'none';
    }

    // If in SinglePlayer mode but multiple humans joined, auto-switch to Multiplayer
    if (currentGameMode === 'SinglePlayer' && players.filter(p => !p.isNPC).length > 1 && amIModerator) {
        debug("Multiple human players detected while in SinglePlayer mode - switching to Multiplayer");
        switchGameMode('Multiplayer');

        // Show a notification
        if (lobbyErrorMsg) {
            lobbyErrorMsg.textContent = 'Switched to Multiplayer mode because multiple human players are present.';
            lobbyErrorMsg.style.display = 'block';

            setTimeout(() => {
                lobbyErrorMsg.textContent = '';
                lobbyErrorMsg.style.display = 'none';
            }, 5000);
        }
    } else {
        if (amIModerator) {
            if (gameSettingsPanel) {
                gameSettingsPanel.className = currentGameMode === 'Multiplayer' ?
                    'multiplayer-active' : 'singleplayer-active';
            }

            if (multiplayerBtn && singlePlayerBtn) {
                multiplayerBtn.classList.toggle('active', currentGameMode === 'Multiplayer');
                singlePlayerBtn.classList.toggle('active', currentGameMode === 'SinglePlayer');
            }

            if (currentGameMode === 'SinglePlayer') {
                updatePreviewBots();
            }
        }
    }

    // Update player list display
    updatePlayerListDisplay();

    // Update start button state
    updateStartButtonState();

    // Show settings display for everyone
    if (displaySettingsDiv) {
        displaySettingsDiv.style.display = 'block';
    }
});

// Game settings update handler
socket.on('settingsUpdated', (settings) => {
    debug(`Received settingsUpdated: ${JSON.stringify(settings)}`);
    if (displayDifficulty) {
        displayDifficulty.textContent = settings.difficulty;
    }

    // Update the select element value
    if (difficultySelect) {
        difficultySelect.value = settings.difficulty;
    }
});

// Game mode update handler
socket.on('gameModeUpdated', (data) => {
    debug(`Received gameModeUpdated: ${JSON.stringify(data)}`);
    currentGameMode = data.gameMode;

    // Update display
    if (displayGameMode) {
        displayGameMode.textContent = data.gameMode;
    }

    // Update UI elements
    if (gameSettingsPanel) {
        gameSettingsPanel.className = data.gameMode === 'Multiplayer' ?
            'multiplayer-active' : 'singleplayer-active';
    }

    if (multiplayerBtn && singlePlayerBtn) {
        multiplayerBtn.classList.toggle('active', data.gameMode === 'Multiplayer');
        singlePlayerBtn.classList.toggle('active', data.gameMode === 'SinglePlayer');
    }

    // Show/hide appropriate settings displays
    if (NPCSettingsDisplay) {
        NPCSettingsDisplay.style.display = data.gameMode === 'SinglePlayer' ? 'block' : 'none';
    }

    // Update start button
    if (startButton && amIModerator) {
        if (data.gameMode === 'SinglePlayer') {
            startButton.textContent = 'Start Single-Player Game';
            startButton.className = 'action-btn single-player-btn';

            // Disable the button if there are multiple human players
            if (realPlayers.filter(p => !p.isNPC).length > 1) {
                startButton.disabled = true;
                startButton.classList.add('disabled-btn');
            } else {
                startButton.disabled = false;
                startButton.classList.remove('disabled-btn');
            }

            // Create preview bots when switching to SinglePlayer
            debug("Switching to SinglePlayer mode, updating preview bots");
            updatePreviewBots();
        } else {
            startButton.textContent = 'Start Multiplayer Game';
            startButton.className = 'action-btn multi-player-btn';
            updateStartButtonState();
            previewBots = [];
        }
    }
    updatePlayerListDisplay();
});

// NPC settings update handler
socket.on('NPCSettingsUpdated', (settings) => {
    debug(`Received NPCSettingsUpdated: ${JSON.stringify(settings)}`);
    if (displayNPCOpponents) {
        displayNPCOpponents.textContent = settings.NPCOpponents;
    }

    if (displayNPCDifficulty) {
        displayNPCDifficulty.textContent = settings.NPCDifficulty;
    }

    // Update form values
    if (NPCOpponentsSelect) {
        NPCOpponentsSelect.value = settings.NPCOpponents;
    }

    if (NPCDifficultySelect) {
        NPCDifficultySelect.value = settings.NPCDifficulty;
    }

    // Update preview bots if in single player mode
    if (currentGameMode === 'SinglePlayer') {
        updatePreviewBots();
    }
});

// Event listeners for mode buttons
if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
        if (amIModerator) {
            switchGameMode('Multiplayer');
        }
    });
}

if (singlePlayerBtn) {
    singlePlayerBtn.addEventListener('click', () => {
        if (amIModerator) {
            // Check if we have more than one human player
            const humanPlayerCount = realPlayers.filter(p => !p.isNPC).length;

            if (humanPlayerCount > 1) {
                // Don't allow switching to single player with multiple humans
                if (lobbyErrorMsg) {
                    lobbyErrorMsg.textContent = 'Single Player mode requires exactly 1 human player. Please ask other players to leave first.';
                    lobbyErrorMsg.style.display = 'block';

                    setTimeout(() => {
                        lobbyErrorMsg.textContent = '';
                        lobbyErrorMsg.style.display = 'none';
                    }, 5000);
                }
            } else {
                switchGameMode('SinglePlayer');
            }
        } else {
            debug("Not moderator, can't switch mode");
        }
    });
}

// Save settings (only used for multiplayer difficulty now)
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        if (amIModerator && difficultySelect) {
            const settings = {
                roomCode,
                settings: { difficulty: difficultySelect.value }
            };
            socket.emit('updateGameSettings', settings);
        } else {
        }
    });
}

// Save NPC settings when changing them
if (NPCOpponentsSelect) {
    NPCOpponentsSelect.addEventListener('change', () => {
        debug(`NPCOpponentsSelect changed to ${NPCOpponentsSelect.value}`);
        if (amIModerator && currentGameMode === 'SinglePlayer') {
            const settings = {
                roomCode,
                NPCOpponents: NPCOpponentsSelect.value,
                NPCDifficulty: NPCDifficultySelect ? NPCDifficultySelect.value : 'Medium'
            };
            debug(`Sending NPC settings update: ${JSON.stringify(settings)}`);
            socket.emit('updateNPCSettings', settings);

            // Update preview bots
            debug("Updating preview bots after opponents change");
            updatePreviewBots();
        } else {
            debug("Not sending NPC settings: not moderator or not in SinglePlayer mode");
        }
    });
}

if (NPCDifficultySelect) {
    NPCDifficultySelect.addEventListener('change', () => {
        debug(`NPCDifficultySelect changed to ${NPCDifficultySelect.value}`);
        if (amIModerator && currentGameMode === 'SinglePlayer') {
            const settings = {
                roomCode,
                NPCOpponents: NPCOpponentsSelect ? NPCOpponentsSelect.value : '1',
                NPCDifficulty: NPCDifficultySelect.value
            };
            debug(`Sending NPC settings update: ${JSON.stringify(settings)}`);
            socket.emit('updateNPCSettings', settings);

            // Update preview bots
            debug("Updating preview bots after difficulty change");
            updatePreviewBots();
        } else {
            debug("Not sending NPC settings: not moderator or not in SinglePlayer mode");
        }
    });
}

// Lobby start button
if (startButton) {
    startButton.addEventListener('click', () => {
        debug("Start button clicked");
        socket.emit('startGame', roomCode);
    });
}

socket.on('gameStarted', () => {
    debug("Game started, redirecting to game.html");
    window.location.href = '/game.html';
});

socket.on('lobbyClosed', () => {
    debug("Lobby closed");
    alert('The lobby has been closed by the moderator.');
    window.location.href = '/';
});

if (leaveLobbyButton) {
    leaveLobbyButton.addEventListener('click', () => {
        debug("Leave lobby button clicked");
        socket.emit('leaveLobby', roomCode);
        window.location.href = '/';
    });
}


// Debug when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    debug("DOM fully loaded");
    debug(`Current elements status:
    - playersList: ${playersList ? 'Found' : 'Not found'}
    - NPCOpponentsSelect: ${NPCOpponentsSelect ? 'Found' : 'Not found'}
    - singlePlayerBtn: ${singlePlayerBtn ? 'Found' : 'Not found'}
    - gameSettingsPanel: ${gameSettingsPanel ? 'Found' : 'Not found'}
    `);
});