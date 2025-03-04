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

    // Show "Start Game" only if I'm the moderator
    startButton.style.display = amIModerator ? 'inline-block' : 'none';

    // Show the settings panel only if I'm the moderator
    gameSettingsPanel.style.display = amIModerator ? 'block' : 'none';
    // Show the read-only display for everyone
    displaySettingsDiv.style.display = 'block';
});

// Listen for updated settings from the server
socket.on('settingsUpdated', (settings) => {
    // Update the read-only display
    displayDifficulty.textContent = settings.difficulty;
    displayRounds.textContent = settings.rounds;
});

// If there's an error updating settings
socket.on('settingsError', (msg) => {
    settingsErrorMsg.textContent = msg;
});

// Moderator clicks "Save Settings"
saveSettingsBtn.addEventListener('click', () => {
    settingsErrorMsg.textContent = ''; // clear old error

    const newSettings = {
        difficulty: difficultySelect.value,
        //rounds: parseInt(roundsInput.value, 10) || 1
    };

    // Send to server
    socket.emit('updateGameSettings', {
        roomCode,
        settings: newSettings
    });
});

// Start button in the lobby (only visible to moderator)
startButton.addEventListener('click', () => {
    socket.emit('startGame', roomCode);
});

// When the server emits 'gameStarted', redirect all players:
socket.on('gameStarted', () => {
    // Optionally store any final data you need in localStorage:
    // localStorage.setItem('someKey', JSON.stringify(yourData));

    // Redirect to the actual game page
    window.location.href = '/game.html';
});

// Listen for "lobbyClosed" event (means moderator left or disconnected)
socket.on('lobbyClosed', () => {
    alert('The lobby has been closed by the moderator.');
    window.location.href = '/';
});

// Handle user clicking "Leave Lobby"
leaveLobbyButton.addEventListener('click', () => {
    // Emit leave event
    socket.emit('leaveLobby', roomCode);

    // Non-moderator will be removed from the room. We can
    // immediately redirect them. The server will handle
    // the rest.
    // For the moderator, the server will broadcast 'lobbyClosed',
    // which triggers *all* players to redirect. The moderator
    // can either rely on that, or just do an immediate redirect too:
    window.location.href = '/';
});
