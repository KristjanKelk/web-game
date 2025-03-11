/**
 * NPC Controller Module
 * Manages NPC players for single-player mode
 */
const labyrinthGenerator = require('./labyrinthGenerator');

/**
 * Creates NPC players for a room
 * @param {Object} room - The room object
 * @param {number} numOpponents - Number of NPC opponents to create
 * @param {string} difficulty - NPC difficulty level (Easy, Medium, Hard)
 * @returns {Object} Updated room object with NPC players
 */
function createNPCPlayers(room, numOpponents, difficulty) {
    if (!room) return room;


    if (!room.NPCPlayers) {
        room.NPCPlayers = {};
    }

    // Clear existing NPC players if any
    for (const key in room.NPCPlayers) {
        delete room.NPCPlayers[key];
        if (room.players[key]) {
            delete room.players[key];
        }
        if (room.positions && room.positions[key]) {
            delete room.positions[key];
        }
    }

    // Determine NPC speed based on difficulty
    let NPCSpeed = 6;
    if (difficulty === 'Easy') {
        NPCSpeed = 5;
    } else if (difficulty === 'Hard') {
        NPCSpeed = 9;
    }

    // Create the specified number of NPC players
    for (let i = 0; i < numOpponents; i++) {
        const NPCId = `NPC-${i}-${Date.now()}`;
        const NPCNumber = i + 1; // 1-based NPC numbering
        const NPCName = `NPC-${NPCNumber}`;

        // Generate different starting positions based on NPC number
        // to avoid NPC players stacking on top of each other
        const posX = Math.random() * 500 + 250 + (NPCNumber * 50);
        const posY = Math.random() * 400 + 200 + (NPCNumber * 50);

        // Create NPC player record in the players list
        room.players[NPCId] = {
            name: NPCName,
            score: 0,
            isNPC: true
        };

        // Create NPC player configuration
        room.NPCPlayers[NPCId] = {
            id: NPCId,
            name: NPCName,
            position: {
                x: posX,
                y: posY
            },
            target: null,
            lastTargetUpdate: Date.now(),
            speed: NPCSpeed,
            difficulty
        };

        // Add to positions for rendering
        if (!room.positions) {
            room.positions = {};
        }
        room.positions[NPCId] = {
            playerName: NPCName,
            position: room.NPCPlayers[NPCId].position
        };
    }

    return room;
}

/**
 * Updates NPC player positions and actions
 * @param {Object} room - The room object
 * @param {Function} resourceCollectionCallback - Callback when NPC collects resource
 * @returns {Object} Updated room object
 */
function updateNPCPlayers(room, resourceCollectionCallback) {
    if (!room || !room.NPCPlayers || Object.keys(room.NPCPlayers).length === 0) {
        return room;
    }

    // For each NPC player
    for (const NPCId in room.NPCPlayers) {
        const NPC = room.NPCPlayers[NPCId];

        // Skip if NPC doesn't have a valid position
        if (!NPC.position) continue;

        // Find a new target periodically or when target is null
        if (!NPC.target || Date.now() - NPC.lastTargetUpdate > 3000) {
            findNewTarget(room, NPC);
        }

        // Move toward target if one exists
        if (NPC.target) {
            moveTowardTarget(room, NPC);

            // Check for resource collection
            checkResourceCollection(room, NPC, resourceCollectionCallback);
        }

        // Update position in the positions object for rendering
        if (!room.positions[NPCId]) {
            room.positions[NPCId] = { playerName: NPC.name, position: { x: 0, y: 0 } };
        }
        room.positions[NPCId].position = NPC.position;
    }

    return room;
}

/**
 * Finds a new target for the NPC
 * @param {Object} room - The room object
 * @param {Object} NPC - The NPC player object
 */
function findNewTarget(room, NPC) {
    // If resources exist, pick one as a target
    if (room.resources && room.resources.length > 0) {
        // Choose closest resource or random resource based on difficulty
        let targetResource;

        if (NPC.difficulty === 'Hard') {
            // Hard NPC picks the closest resource
            let closestDistance = Infinity;

            for (const resource of room.resources) {
                const distance = calculateDistance(
                    NPC.position.x, NPC.position.y,
                    resource.left, resource.top
                );

                if (distance < closestDistance) {
                    closestDistance = distance;
                    targetResource = resource;
                }
            }
        } else {
            // Easy/Medium NPC picks a random resource
            const randomIndex = Math.floor(Math.random() * room.resources.length);
            targetResource = room.resources[randomIndex];
        }

        // Set the target
        if (targetResource) {
            NPC.target = {
                id: targetResource.id,
                x: targetResource.left,
                y: targetResource.top,
                type: targetResource.type
            };
            NPC.lastTargetUpdate = Date.now();
        }
    } else {
        // No resources available, wander randomly
        NPC.target = {
            id: 'random',
            x: Math.random() * 950 + 50,
            y: Math.random() * 750 + 50,
            type: 'random'
        };
        NPC.lastTargetUpdate = Date.now();
    }
}

/**
 * Moves NPC toward its target
 * @param {Object} room - The room object
 * @param {Object} NPC - The NPC player object
 */
function moveTowardTarget(room, NPC) {
    if (!NPC.target || !NPC.position) return;

    // Calculate direction vector
    const dx = NPC.target.x - NPC.position.x;
    const dy = NPC.target.y - NPC.position.y;

    // Normalize the direction vector
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we're very close to target, consider it reached
    if (distance < 5) {
        if (NPC.target.id !== 'random') {
            // Target was a resource but we've reached it
            // We'll pick a new target on next update
            NPC.target = null;
        }
        return;
    }

    // Calculate normalized movement vector
    const normalizedDx = dx / distance;
    const normalizedDy = dy / distance;

    // Calculate new position
    const newX = NPC.position.x + normalizedDx * NPC.speed;
    const newY = NPC.position.y + normalizedDy * NPC.speed;

    // NPC dimensions - consistent with the client side
    const NPCWidth = 40;
    const NPCHeight = 40;

    // First check if new position would hit a wall
    let collision = false;

    if (room.labyrinthLayout && room.labyrinthLayout.length > 0) {
        // Check the intended position for collisions
        if (labyrinthGenerator.isInsideWall(newX, newY, room.labyrinthLayout) ||
            labyrinthGenerator.isInsideWall(newX + NPCWidth, newY, room.labyrinthLayout) ||
            labyrinthGenerator.isInsideWall(newX, newY + NPCHeight, room.labyrinthLayout) ||
            labyrinthGenerator.isInsideWall(newX + NPCWidth, newY + NPCHeight, room.labyrinthLayout)) {
            collision = true;
        }
    }

    if (collision) {
        // Wall collision detected, pick a new random target
        NPC.target = {
            id: 'random',
            x: Math.random() * 950 + 50,
            y: Math.random() * 750 + 50,
            type: 'random'
        };
        NPC.lastTargetUpdate = Date.now();
        return;
    }

    // Update position
    NPC.position.x = newX;
    NPC.position.y = newY;

    // Ensure NPC stays within board boundaries
    NPC.position.x = Math.max(0, Math.min(1000 - NPCWidth, NPC.position.x));
    NPC.position.y = Math.max(0, Math.min(800 - NPCHeight, NPC.position.y));
}

/**
 * Checks if NPC has collected a resource
 * @param {Object} room - The room object
 * @param {Object} NPC - The NPC player object
 * @param {Function} resourceCollectionCallback - Callback when NPC collects resource
 */
function checkResourceCollection(room, NPC, resourceCollectionCallback) {
    if (!room.resources || !NPC.position) return;

    const NPCRect = {
        left: NPC.position.x,
        right: NPC.position.x + 40, // Assuming width of 40
        top: NPC.position.y,
        bottom: NPC.position.y + 40 // Assuming height of 40
    };

    for (const resource of room.resources) {
        const resourceRect = {
            left: resource.left,
            right: resource.left + 20, // Assuming width of 20
            top: resource.top,
            bottom: resource.top + 20 // Assuming height of 20
        };

        // Check for collision
        if (NPCRect.left < resourceRect.right &&
            NPCRect.right > resourceRect.left &&
            NPCRect.top < resourceRect.bottom &&
            NPCRect.bottom > resourceRect.top) {

            // NPC has collected this resource
            resourceCollectionCallback(room, NPC.id, resource);

            // Clear target since resource is collected
            NPC.target = null;

            break;
        }
    }
}

/**
 * Resets NPC player positions for game restart
 * @param {Object} room - The room object
 * @returns {Object} Updated room object
 */
function resetNPCPlayers(room) {
    if (!room || !room.NPCPlayers) return room;

    let NPCIndex = 0;
    for (const NPCId in room.NPCPlayers) {
        // Generate different positions for each NPC
        const NPCNumber = NPCIndex + 1;
        const posX = Math.random() * 500 + 250 + (NPCNumber * 50);
        const posY = Math.random() * 400 + 200 + (NPCNumber * 50);

        // Reset position to a new spaced location
        room.NPCPlayers[NPCId].position = {
            x: posX,
            y: posY
        };

        // Reset target
        room.NPCPlayers[NPCId].target = null;
        room.NPCPlayers[NPCId].lastTargetUpdate = Date.now();

        // Update position in the positions object
        if (room.positions && room.positions[NPCId]) {
            room.positions[NPCId].position = room.NPCPlayers[NPCId].position;
        }

        // Reset score
        if (room.players && room.players[NPCId]) {
            room.players[NPCId].score = 0;
        }

        NPCIndex++;
    }

    return room;
}

/**
 * Calculate distance between two points
 * @param {number} x1 - First point x coordinate
 * @param {number} y1 - First point y coordinate
 * @param {number} x2 - Second point x coordinate
 * @param {number} y2 - Second point y coordinate
 * @returns {number} Distance between points
 */
function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

module.exports = {
    createNPCPlayers,
    updateNPCPlayers,
    resetNPCPlayers
};