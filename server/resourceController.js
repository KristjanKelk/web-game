/**
 * Resource Controller
 * Handles resource spawning, collection, and management
 */
const labyrinthGenerator = require('./labyrinthGenerator');

/**
 * Spawns a resource in a room
 * @param {string} roomCode - The room identifier
 * @param {Object} room - The room object
 * @param {Object} io - Socket.io instance
 */
function spawnResourceForRoom(roomCode, room, io) {
    if (!room || !room.inGame) return;

    // Use the stored labyrinth layout
    const labyrinthLayout = room.labyrinthLayout || [];
    let candidateX, candidateY;
    let maxAttempts = 10, attempts = 0;

    // Try to find a position not inside a wall
    do {
        candidateX = Math.random() * 1300; // board width
        candidateY = Math.random() * 1000; // board height
        attempts++;
    } while (attempts < maxAttempts && labyrinthGenerator.isInsideWall(candidateX, candidateY, labyrinthLayout));

    if (attempts === maxAttempts && labyrinthGenerator.isInsideWall(candidateX, candidateY, labyrinthLayout)) {
        // Could not find an open space; skip spawning.
        return;
    }

    const isPowerUp = Math.random() < 0.05;
    const resource = {
        id: Math.random().toString(36).substr(2, 9),
        left: candidateX,
        top: candidateY,
        type: isPowerUp ? 'powerup' : 'normal'
    };

    if (!room.resources) {
        room.resources = [];
    }
    room.resources.push(resource);
    io.to(roomCode).emit('resourceSpawned', resource);

    // Set a timeout to remove the resource after a random duration
    const timeoutDuration = 6000 + Math.floor(Math.random() * 4000);
    setTimeout(() => {
        if (room && room.resources) {
            room.resources = room.resources.filter(r => r.id !== resource.id);
            io.to(roomCode).emit('resourceRemoved', resource.id);

            // Spawn a new resource if we're below the minimum
            if (room.resources.length < 5) {
                spawnResourceForRoom(roomCode, room, io);
            }
        }
    }, timeoutDuration);
}

/**
 * Starts the resource spawning interval for a room
 * @param {string} roomCode - The room identifier
 * @param {Object} room - The room object
 * @param {Object} io - Socket.io instance
 */
function startResourceSpawning(roomCode, room, io) {
    // Clear any existing interval
    if (room.resourceInterval) {
        clearInterval(room.resourceInterval);
    }

    // Initial spawn of resources
    for (let i = 0; i < 5; i++) {
        spawnResourceForRoom(roomCode, room, io);
    }

    // Set up interval for continuous spawning
    room.resourceInterval = setInterval(() => {
        if (!room || !room.inGame) {
            if (room.resourceInterval) {
                clearInterval(room.resourceInterval);
            }
            return;
        }

        if (room.paused) return;

        // Spawn 1-3 resources randomly
        const numResourcesToSpawn = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numResourcesToSpawn; i++) {
            spawnResourceForRoom(roomCode, room, io);
        }

        // Ensure minimum number of resources
        if (room.resources && room.resources.length < 5) {
            const additionalNeeded = 5 - room.resources.length;
            for (let i = 0; i < additionalNeeded; i++) {
                spawnResourceForRoom(roomCode, room, io);
            }
        }
    }, 1000);

    return room;
}

/**
 * Stops resource spawning for a room
 * @param {Object} room - The room object
 */
function stopResourceSpawning(room) {
    if (room && room.resourceInterval) {
        clearInterval(room.resourceInterval);
        room.resourceInterval = null;
    }
    return room;
}

/**
 * Handles a human player collecting a resource
 * @param {Object} room - The room object
 * @param {Object} data - Collection data (roomCode, resourceId, playerName)
 * @param {Object} io - Socket.io instance
 * @param {Function} updateScoresCallback - Function to update scores
 */
function handleResourceCollected(room, data, io, updateScoresCallback) {
    const { roomCode, resourceId, playerName } = data;

    if (!room || !room.resources) return;

    const collected = room.resources.find(r => r.id === resourceId);
    if (!collected) return;

    // Remove the resource
    room.resources = room.resources.filter(r => r.id !== resourceId);
    io.to(roomCode).emit('resourceRemoved', resourceId);

    // Determine which player collected the resource
    const playerSocketId = Object.keys(room.players).find(id => room.players[id].name === playerName);
    if (playerSocketId) {
        // Award points
        const points = 10; // or adjust based on type
        room.players[playerSocketId].score += points;
    }

    // Handle power-up effects
    if (collected.type === 'powerup') {
        io.to(roomCode).emit('powerUpEffect', {
            source: playerName,
            effect: 'slow',
            duration: 5000
        });
    }

    // Update scores
    updateScoresCallback(roomCode);
}

/**
 * Handles an NPC player collecting a resource
 * @param {Object} room - The room object
 * @param {string} NPCId - The NPC player ID
 * @param {Object} resource - The collected resource
 * @param {Object} io - Socket.io instance
 * @param {Function} updateScoresCallback - Function to update scores
 */
function handleNPCResourceCollected(room, NPCId, resource, io, updateScoresCallback) {
    if (!room || !room.resources || !resource) return room;

    // Remove the resource
    room.resources = room.resources.filter(r => r.id !== resource.id);
    io.to(room.roomCode).emit('resourceRemoved', resource.id);

    // Award points to NPC
    if (room.players[NPCId]) {
        room.players[NPCId].score += 10;
    }

    // Handle power-up effects
    if (resource.type === 'powerup') {
        const NPCPlayerName = room.players[NPCId].name;
        io.to(room.roomCode).emit('powerUpEffect', {
            source: NPCPlayerName,
            effect: 'slow',
            duration: 5000
        });
    }

    // Update scores
    updateScoresCallback(room.roomCode);

    return room;
}

/**
 * Clear all resources for a room
 * @param {Object} room - The room object
 * @param {Object} io - Socket.io instance
 */
function clearResources(room, io) {
    if (!room) return;

    // Stop the resource spawning interval
    if (room.resourceInterval) {
        clearInterval(room.resourceInterval);
        room.resourceInterval = null;
    }

    // Remove all resources from the client view
    if (room.resources && room.resources.length > 0) {
        room.resources.forEach(resource => {
            io.to(room.roomCode).emit('resourceRemoved', resource.id);
        });
    }

    // Clear the resources array
    room.resources = [];
}

module.exports = {
    spawnResourceForRoom,
    startResourceSpawning,
    stopResourceSpawning,
    handleResourceCollected,
    handleNPCResourceCollected,
    clearResources
};