// public/js/lobby.js
const socket = io();

const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

const roomInfo = document.getElementById('roomInfo');
const playersList = document.getElementById('playersList');
const startButton = document.getElementById('startButton');
const leaveLobbyButton = document.getElementById('leaveLobbyButton');
const lobbyErrorMsg = document.getElementById('lobbyErrorMsg');

// Settings elements
const gameSettingsPanel = document.getElementById('gameSettingsPanel');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsErrorMsg = document.getElementById('settingsErrorMsg');
const difficultySelect = document.getElementById('difficultySelect');
//const roundsInput = document.getElementById('roundsInput');

// Displayed for everyone (read-only)
const displaySettingsDiv = document.getElementById('displaySettings');
const displayDifficulty = document.getElementById('displayDifficulty');
const displayRounds = document.getElementById('displayRounds');

// Validate roomCode and playerName
if (!roomCode || !playerName) {
    lobbyErrorMsg.textContent = 'Room Code or Player Name missing. Redirecting...';
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
} else {
    roomInfo.textContent = `Room Code: ${roomCode}`;
    // Join the lobby
    socket.emit('joinGame', { roomCode, playerName });
}

// Handle join errors from server
socket.on('joinError', (msg) => {
    lobbyErrorMsg.textContent = msg;
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
});

// Update the player list
socket.on('updatePlayerList', (players) => {
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
        li.textContent = label;
        playersList.appendChild(li);
    });

    // Check if *I* am the moderator
    const amIModerator = (players.length > 0 && players[0].name === playerName);

    // Show button only if I'm the moderator
    startButton.style.display = amIModerator ? 'inline-block' : 'none';

    // Update button text and style based on player count
    if (amIModerator) {
        if (players.length === 1) {
            startButton.textContent = 'Start Single-Player Game';
            startButton.className = 'single-player-btn';
        } else {
            startButton.textContent = 'Start Multiplayer Game';
            startButton.className = 'multi-player-btn';
        }
    }

    // Show the settings panel only if I'm the moderator
    gameSettingsPanel.style.display = amIModerator ? 'block' : 'none';
    // Show the read-only display for everyone
    displaySettingsDiv.style.display = 'block';
});

socket.on('settingsUpdated', (settings) => {
    displayDifficulty.textContent = settings.difficulty;

});

socket.on('settingsError', (msg) => {
    settingsErrorMsg.textContent = msg;
});

saveSettingsBtn.addEventListener('click', () => {
    settingsErrorMsg.textContent = '';

    const newSettings = {
        difficulty: difficultySelect.value,

    };

    socket.emit('updateGameSettings', {
        roomCode,
        settings: newSettings
    });
});

// Lobby start button (moderator only)
startButton.addEventListener('click', () => {
    socket.emit('startGame', roomCode);
});

socket.on('gameStarted', () => {
    window.location.href = '/game.html';
});

socket.on('lobbyClosed', () => {
    alert('The lobby has been closed by the moderator.');
    window.location.href = '/';
});

leaveLobbyButton.addEventListener('click', () => {
    socket.emit('leaveLobby', roomCode);
    window.location.href = '/';
});
