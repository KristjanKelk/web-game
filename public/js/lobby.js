// public/js/lobby.js
const socket = io();

const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

const roomInfo = document.getElementById('roomInfo');
const playersList = document.getElementById('playersList');
const startButton = document.getElementById('startButton');
const leaveLobbyButton = document.getElementById('leaveLobbyButton');
const lobbyErrorMsg = document.getElementById('lobbyErrorMsg');

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

    // Show "Start Game" button only to the moderator (first player)
    if (players.length > 0 && players[0].name === playerName) {
        startButton.style.display = 'inline-block';
    } else {
        startButton.style.display = 'none';
    }
});

// Moderator clicks "Start Game"
startButton.addEventListener('click', () => {
    socket.emit('startGame', roomCode);
});

// Listen for game start
socket.on('gameStarted', () => {
    alert('The game has started!');
    // If you want to redirect to a game page, do it here:
    // window.location.href = '/game.html';
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
