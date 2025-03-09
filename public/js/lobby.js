// public/js/lobby.js
const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode');
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
// const displayRounds = document.getElementById('displayRounds'); // no rounds really

document.addEventListener('DOMContentLoaded', () => {

    if (gameMode === 'singleplayer') {

        console.log("Single-player mode detected. setting it up");

        // don't need this
        startButton.style.display = "block"; 
        gameSettingsPanel.style.display = "none";
        leaveLobbyButton.textContent = "Exit to Menu";

        const botConfigDiv = document.createElement("div");

        // injection for this single player stuff
        botConfigDiv.innerHTML = `
            <h3>Single Player Configuration</h3>

            <label>Game Difficulty (Map + Environment):</label>
            <select id="gameDifficulty">
                <option value="easy">Easy</option>
                <option value="medium" selected>Medium</option>
                <option value="hard">Hard</option>
            </select>

            <h3>Opponent Bots</h3>

            <div id="botSettings">
                <div>
                    <label>Bot 1:</label>
                    <select id="bot1">
                        <option value="none">None</option>
                        <option value="1">Level 1 (Random Movement)</option>
                        <option value="2">Level 2 (Chases Resources)</option>
                        <option value="3">Level 3 (Strategic Movement)</option>
                    </select>
                </div>

                <div>
                    <label>Bot 2:</label>
                    <select id="bot2">
                        <option value="none">None</option>
                        <option value="1">Level 1 (Random Movement)</option>
                        <option value="2">Level 2 (Chases Resources)</option>
                        <option value="3">Level 3 (Strategic Movement)</option>
                    </select>
                </div>

                <div>
                    <label>Bot 3:</label>
                    <select id="bot3">
                        <option value="none">None</option>
                        <option value="1">Level 1 (Random Movement)</option>
                        <option value="2">Level 2 (Chases Resources)</option>
                        <option value="3">Level 3 (Strategic Movement)</option>
                    </select>
                </div>
            </div>
        `;

        document.getElementById('container').appendChild(botConfigDiv);

    } else {

        console.log("multiplyer mode detected. no changes");

        if (!roomCode || !playerName) {

            lobbyErrorMsg.textContent = 'Room Code or Player Name missing. Redirecting...';
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);

        } else {

            roomInfo.textContent = `Room Code: ${roomCode}`;
            socket.emit('joinGame', { roomCode, playerName });

        }
    }

});

// ajdusted start
startButton.addEventListener('click', () => {

    const urlParams = new URLSearchParams(window.location.search);
    const gameMode = urlParams.get('mode');

    if (gameMode === 'singleplayer') {

        const difficulty = document.getElementById('gameDifficulty').value;

        const bot1 = document.getElementById('bot1').value;
        const bot2 = document.getElementById('bot2').value;
        const bot3 = document.getElementById('bot3').value;

        const botConfig = new URLSearchParams({
            mode: 'singleplayer',
            difficulty,
            bot1,
            bot2,
            bot3
        }).toString();

        window.location.href = `game.html?${botConfig}`;

    } else {

        socket.emit('startGame');

    }

});

socket.on('joinError', (msg) => {
    lobbyErrorMsg.textContent = msg;
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
});

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

    const amIModerator = (players.length > 0 && players[0].name === playerName);

    startButton.style.display = amIModerator ? 'inline-block' : 'none';

    gameSettingsPanel.style.display = amIModerator ? 'block' : 'none';
    displaySettingsDiv.style.display = 'block';

});

socket.on('settingsUpdated', (settings) => {

    displayDifficulty.textContent = settings.difficulty;
    displayRounds.textContent = settings.rounds;

});

socket.on('settingsError', (msg) => {
    settingsErrorMsg.textContent = msg;
});

saveSettingsBtn.addEventListener('click', () => {

    settingsErrorMsg.textContent = ''; // clear old error

    const newSettings = {
        difficulty: difficultySelect.value,
        //rounds: parseInt(roundsInput.value, 10) || 1
    };

    socket.emit('updateGameSettings', {
        roomCode,
        settings: newSettings
    });

});

// Start button in the lobby (only visible to moderator)
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
