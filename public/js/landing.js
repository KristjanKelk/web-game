// public/js/landing.js
const socket = io();

const createGameBtn = document.getElementById('createGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');

const createGameDialog = document.getElementById('createGameDialog');
const joinGameDialog = document.getElementById('joinGameDialog');

const cancelCreate = document.getElementById('cancelCreate');
const cancelJoin = document.getElementById('cancelJoin');

const createGameForm = document.getElementById('createGameForm');
const createNameInput = document.getElementById('createNameInput');
const gameNameInput = document.getElementById('gameNameInput');
const createErrorMsg = document.getElementById('createErrorMsg');

const joinGameForm = document.getElementById('joinGameForm');
const joinRoomCodeInput = document.getElementById('joinRoomCode');
const joinNameInput = document.getElementById('joinNameInput');
const joinErrorMsg = document.getElementById('joinErrorMsg');

// Toggle dialogs when buttons are clicked
createGameBtn.addEventListener('click', () => {

    const gameMode = document.querySelector('input[name="gameMode"]:checked').value;
    
    if (gameMode === "singleplayer") {
        // Directly move to the lobby with single-player mode
        window.location.href = "/lobby.html?mode=singleplayer";
    } else {
        // Show the multiplayer create game form
        createGameDialog.style.display = 'block';
        joinGameDialog.style.display = 'none';
    }

});

joinGameBtn.addEventListener('click', () => {
    joinGameDialog.style.display = 'block';
    createGameDialog.style.display = 'none';
});

cancelCreate.addEventListener('click', () => {
    createGameDialog.style.display = 'none';
});

cancelJoin.addEventListener('click', () => {
    joinGameDialog.style.display = 'none';
});

// Create game form submission
createGameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const playerName = createNameInput.value.trim();
    const gameName = gameNameInput.value.trim();
    if (playerName && gameName) {
        socket.emit('createGame', { playerName, gameName });
    }
});

// Listen for server response
socket.on('gameCreated', (data) => {
    // data: { roomCode }
    localStorage.setItem('roomCode', data.roomCode);
    localStorage.setItem('playerName', createNameInput.value.trim());
    localStorage.setItem('gameName', gameNameInput.value.trim());

    // Move to the lobby page, but also consider the mode
    window.location.href = "/lobby.html?mode=multiplayer";
});

// Join game form submission
joinGameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomCode = joinRoomCodeInput.value.trim().toUpperCase();
    const playerName = joinNameInput.value.trim();
    if (roomCode && playerName) {
        socket.emit('joinGame', { roomCode, playerName });
        localStorage.setItem('roomCode', roomCode);
        localStorage.setItem('playerName', playerName);
    }
});

// Listen for join errors
socket.on('joinError', (msg) => {
    joinErrorMsg.textContent = msg;
});

// Listen for player list update; a successful join (or create) will trigger this event.
// When the player list is updated, redirect the user to the lobby page.
socket.on('updatePlayerList', (players) => {
    const roomCode = localStorage.getItem('roomCode');
    if (roomCode) {
        window.location.href = '/lobby.html';
    }
});
