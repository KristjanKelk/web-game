// resourceController.js

function isInsideWall(x, y, labyrinthLayout) {
    for (const wall of labyrinthLayout) {
        if (x >= wall.x && x < wall.x + wall.width &&
            y >= wall.y && y < wall.y + wall.height) {
            return true;
        }
    }
    return false;
}

function spawnResource(room, roomCode, io) {
    if (!room.inGame) return;
    const labyrinthLayout = room.labyrinthLayout || [];
    let candidateX, candidateY;
    let maxAttempts = 15, attempts = 0;
    do {
        candidateX = Math.random() * 1200; // board width
        candidateY = Math.random() * 900;  // board height
        attempts++;
    } while (attempts < maxAttempts && isInsideWall(candidateX, candidateY, labyrinthLayout));
    if (attempts === maxAttempts && isInsideWall(candidateX, candidateY, labyrinthLayout)) {
        candidateX = 500 + (Math.random() * 200 - 100);
        candidateY = 400 + (Math.random() * 200 - 100);
    }
    const isPowerUp = Math.random() < 0.08;
    const resource = {
        id: Math.random().toString(36).substr(2, 9),
        left: candidateX,
        top: candidateY,
        type: isPowerUp ? 'powerup' : 'normal'
    };
    if (!room.resources) {
        room.resources = [];
    }
    // Avoid duplicate resource IDs
    if (!room.resources.some(r => r.id === resource.id)) {
        room.resources.push(resource);
        io.to(roomCode).emit('resourceSpawned', resource);
    }
    // Remove resource after a random timeout if not collected
    const timeoutDuration = 4000 + Math.floor(Math.random() * 3000);
    setTimeout(() => {
        if (room && room.resources) {
            const index = room.resources.findIndex(r => r.id === resource.id);
            if (index !== -1) {
                room.resources.splice(index, 1);
                io.to(roomCode).emit('resourceRemoved', resource.id);
                if (room.resources.length < 4) {
                    spawnResource(room, roomCode, io);
                }
            }
        }
    }, timeoutDuration);
}

function startResourceSpawner(rooms, io) {
    return setInterval(() => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            if (room.inGame) {
                const numResourcesToSpawn = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numResourcesToSpawn; i++) {
                    spawnResource(room, roomCode, io);
                }
                if (room.resources && room.resources.length < 5) {
                    const additionalNeeded = 5 - room.resources.length;
                    for (let i = 0; i < additionalNeeded; i++) {
                        spawnResource(room, roomCode, io);
                    }
                }
            }
        }
    }, 1000);
}

function handleResourceCollected(room, data, io, updateAndBroadcastScores) {
    const { resourceId, playerName } = data;
    const roomCode = room.roomCode;
    if (!room || !room.resources) return;
    const collected = room.resources.find(r => r.id === resourceId);
    if (!collected) {
        return; // Resource already collected
    }
    room.resources = room.resources.filter(r => r.id !== resourceId);
    io.to(roomCode).emit('resourceRemoved', resourceId);
    const playerSocketId = Object.keys(room.players).find(id => room.players[id].name === playerName);
    if (playerSocketId) {
        room.players[playerSocketId].score += 10;
    }
    if (collected.type === 'powerup') {
        io.to(roomCode).emit('powerUpEffect', {
            source: playerName,
            effect: 'slow',
            duration: 5000
        });
    }
    updateAndBroadcastScores(roomCode);
    setTimeout(() => {
        if (room && room.resources && room.resources.length < 5) {
            spawnResource(room, roomCode, io);
        }
    }, 800);
}

function handleAIResourceCollected(room, aiId, resource, io, updateAndBroadcastScores) {
    const roomCode = room.roomCode;
    console.log(`AI ${room.aiPlayers[aiId].name} collected resource ${resource.id}`);
    io.to(roomCode).emit('resourceRemoved', resource.id);
    io.to(roomCode).emit('aiCollectedResource', {
        aiId: aiId,
        aiName: room.aiPlayers[aiId].name,
        resourceId: resource.id,
        position: { x: resource.left, y: resource.top },
        type: resource.type
    });
    if (resource.type === 'powerup') {
        io.to(roomCode).emit('powerUpEffect', {
            source: room.aiPlayers[aiId].name,
            effect: 'slow',
            duration: 5000
        });
    }
    room.players[aiId].score += 10;
    room.aiPlayers[aiId].score += 10;
    updateAndBroadcastScores(roomCode);
    setTimeout(() => {
        if (room && room.resources && room.resources.length < 5) {
            spawnResource(room, roomCode, io);
        }
    }, 500);
}

module.exports = {
    spawnResource,
    startResourceSpawner,
    handleResourceCollected,
    handleAIResourceCollected
};
