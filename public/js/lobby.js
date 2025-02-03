// public/js/lobby.js
const socket = io();

const roomCode = localStorage.getItem('roomCode');
const playerName = localStorage.getItem('playerName');

const roomInfo = document.getElementById('roomInfo');
const playersList = document.getElementById('playersList');
const startButton = document.getElementById('startButton');
const lobbyErrorMsg = document.getElementById('lobbyErrorMsg');

// Validate that roomCode and playerName exist; if not, redirect back.
if (!roomCode || !playerName) {
    lobbyErrorMsg.textContent = 'Room Code or Player Name missing. Redirecting...';
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
} else {
    roomInfo.textContent = `Room Code: ${roomCode}`;

    // Emit join event so this socket joins the room.
    socket.emit('joinGame', { roomCode, playerName });
}

// Listen for join errors from the server (e.g., if the room isn’t found).
socket.on('joinError', (msg) => {
    lobbyErrorMsg.textContent = msg;
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
});

// Listen for updates to the player list.
socket.on('updatePlayerList', (players) => {
    playersList.innerHTML = '';
    players.forEach((player, index) => {
        const li = document.createElement('li');
        // Mark moderator (assumed first player) and indicate your own name.
        li.textContent = player.name + (index === 0 ? ' (Moderator)' : (player.name === playerName ? ' (You)' : ''));
        playersList.appendChild(li);
    });

    // Show the start button only if you are the moderator.
    if (players.length > 0 && players[0].name === playerName) {
        startButton.style.display = 'inline-block';
    } else {
        startButton.style.display = 'none';
    }
});

// When the moderator clicks "Start Game"
startButton.addEventListener('click', () => {
    socket.emit('startGame', roomCode);
});

// Listen for the game start event.
socket.on('gameStarted', () => {
    alert('The game has started!');
    // Redirect to the game screen if needed:
    // window.location.href = '/game.html';
});
