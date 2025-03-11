/**
 * AI Controller Module
 * Manages AI players for single-player mode
 */
const labyrinthGenerator = require('./labyrinthGenerator');

/**
 * Creates AI players for a room
 * @param {Object} room - The room object
 * @param {number} numOpponents - Number of AI opponents to create
 * @param {string} difficulty - AI difficulty level (Easy, Medium, Hard)
 * @returns {Object} Updated room object with AI players
 */
function createAIPlayers(room, numOpponents, difficulty) {
    if (!room) return room;

    // Initialize AI players container if it doesn't exist
    if (!room.aiPlayers) {
        room.aiPlayers = {};
    }

    // Determine AI speed based on difficulty
    let aiSpeed = 3; // Default Medium
    if (difficulty === 'Easy') {
        aiSpeed = 2;
    } else if (difficulty === 'Hard') {
        aiSpeed = 4;
    }

    // Create the specified number of AI players
    for (let i = 0; i < numOpponents; i++) {
        const aiId = `ai-${i}-${Date.now()}`;
        const aiName = `AI-${i+1}`;

        // Create AI player record in the players list
        room.players[aiId] = {
            name: aiName,
            score: 0,
            isAI: true
        };

        // Create AI player configuration
        room.aiPlayers[aiId] = {
            id: aiId,
            name: aiName,
            position: {
                x: Math.random() * 950 + 50, // Random position away from edges
                y: Math.random() * 750 + 50
            },
            target: null,
            lastTargetUpdate: Date.now(),
            speed: aiSpeed,
            difficulty
        };

        // Add to positions for rendering
        if (!room.positions) {
            room.positions = {};
        }
        room.positions[aiId] = {
            playerName: aiName,
            position: room.aiPlayers[aiId].position
        };
    }

    return room;
}

/**
 * Updates AI player positions and actions
 * @param {Object} room - The room object
 * @param {Function} resourceCollectionCallback - Callback when AI collects resource
 * @returns {Object} Updated room object
 */
function updateAIPlayers(room, resourceCollectionCallback) {
    if (!room || !room.aiPlayers || Object.keys(room.aiPlayers).length === 0) {
        return room;
    }

    // For each AI player
    for (const aiId in room.aiPlayers) {
        const ai = room.aiPlayers[aiId];

        // Skip if AI doesn't have a valid position
        if (!ai.position) continue;

        // Find a new target periodically or when target is null
        if (!ai.target || Date.now() - ai.lastTargetUpdate > 3000) {
            findNewTarget(room, ai);
        }

        // Move toward target if one exists
        if (ai.target) {
            moveTowardTarget(room, ai);

            // Check for resource collection
            checkResourceCollection(room, ai, resourceCollectionCallback);
        }

        // Update position in the positions object for rendering
        if (!room.positions[aiId]) {
            room.positions[aiId] = { playerName: ai.name, position: { x: 0, y: 0 } };
        }
        room.positions[aiId].position = ai.position;
    }

    return room;
}

/**
 * Finds a new target for the AI
 * @param {Object} room - The room object
 * @param {Object} ai - The AI player object
 */
function findNewTarget(room, ai) {
    // If resources exist, pick one as a target
    if (room.resources && room.resources.length > 0) {
        // Choose closest resource or random resource based on difficulty
        let targetResource;

        if (ai.difficulty === 'Hard') {
            // Hard AI picks the closest resource
            let closestDistance = Infinity;

            for (const resource of room.resources) {
                const distance = calculateDistance(
                    ai.position.x, ai.position.y,
                    resource.left, resource.top
                );

                if (distance < closestDistance) {
                    closestDistance = distance;
                    targetResource = resource;
                }
            }
        } else {
            // Easy/Medium AI picks a random resource
            const randomIndex = Math.floor(Math.random() * room.resources.length);
            targetResource = room.resources[randomIndex];
        }

        // Set the target
        if (targetResource) {
            ai.target = {
                id: targetResource.id,
                x: targetResource.left,
                y: targetResource.top,
                type: targetResource.type
            };
            ai.lastTargetUpdate = Date.now();
        }
    } else {
        // No resources available, wander randomly
        ai.target = {
            id: 'random',
            x: Math.random() * 950 + 50,
            y: Math.random() * 750 + 50,
            type: 'random'
        };
        ai.lastTargetUpdate = Date.now();
    }
}

/**
 * Moves AI toward its target
 * @param {Object} room - The room object
 * @param {Object} ai - The AI player object
 */
function moveTowardTarget(room, ai) {
    if (!ai.target || !ai.position) return;

    // Calculate direction vector
    const dx = ai.target.x - ai.position.x;
    const dy = ai.target.y - ai.position.y;

    // Normalize the direction vector
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we're very close to target, consider it reached
    if (distance < 5) {
        if (ai.target.id !== 'random') {
            // Target was a resource but we've reached it
            // We'll pick a new target on next update
            ai.target = null;
        }
        return;
    }

    // Calculate normalized movement vector
    const normalizedDx = dx / distance;
    const normalizedDy = dy / distance;

    // Calculate new position
    const newX = ai.position.x + normalizedDx * ai.speed;
    const newY = ai.position.y + normalizedDy * ai.speed;

    // Check if new position would hit a wall
    if (room.labyrinthLayout && room.labyrinthLayout.length > 0) {
        // Check a few points along the path to detect wall collisions
        const steps = 3;
        let collision = false;

        for (let i = 1; i <= steps; i++) {
            const checkX = ai.position.x + (normalizedDx * ai.speed * i) / steps;
            const checkY = ai.position.y + (normalizedDy * ai.speed * i) / steps;

            if (labyrinthGenerator.isInsideWall(checkX, checkY, room.labyrinthLayout)) {
                collision = true;
                break;
            }
        }

        if (collision) {
            // Wall collision detected, pick a new random target
            ai.target = {
                id: 'random',
                x: Math.random() * 950 + 50,
                y: Math.random() * 750 + 50,
                type: 'random'
            };
            ai.lastTargetUpdate = Date.now();
            return;
        }
    }

    // Update position
    ai.position.x = newX;
    ai.position.y = newY;

    // Ensure AI stays within board boundaries
    ai.position.x = Math.max(0, Math.min(1300 - 40, ai.position.x)); // Assuming width of 40
    ai.position.y = Math.max(0, Math.min(1000 - 40, ai.position.y)); // Assuming height of 40
}

/**
 * Checks if AI has collected a resource
 * @param {Object} room - The room object
 * @param {Object} ai - The AI player object
 * @param {Function} resourceCollectionCallback - Callback when AI collects resource
 */
function checkResourceCollection(room, ai, resourceCollectionCallback) {
    if (!room.resources || !ai.position) return;

    const aiRect = {
        left: ai.position.x,
        right: ai.position.x + 40, // Assuming width of 40
        top: ai.position.y,
        bottom: ai.position.y + 40 // Assuming height of 40
    };

    for (const resource of room.resources) {
        const resourceRect = {
            left: resource.left,
            right: resource.left + 20, // Assuming width of 20
            top: resource.top,
            bottom: resource.top + 20 // Assuming height of 20
        };

        // Check for collision
        if (aiRect.left < resourceRect.right &&
            aiRect.right > resourceRect.left &&
            aiRect.top < resourceRect.bottom &&
            aiRect.bottom > resourceRect.top) {

            // AI has collected this resource
            resourceCollectionCallback(room, ai.id, resource);

            // Clear target since resource is collected
            ai.target = null;

            break;
        }
    }
}

/**
 * Resets AI player positions for game restart
 * @param {Object} room - The room object
 * @returns {Object} Updated room object
 */
function resetAIPlayers(room) {
    if (!room || !room.aiPlayers) return room;

    for (const aiId in room.aiPlayers) {
        // Reset position to a new random location
        room.aiPlayers[aiId].position = {
            x: Math.random() * 950 + 50,
            y: Math.random() * 750 + 50
        };

        // Reset target
        room.aiPlayers[aiId].target = null;
        room.aiPlayers[aiId].lastTargetUpdate = Date.now();

        // Update position in the positions object
        if (room.positions && room.positions[aiId]) {
            room.positions[aiId].position = room.aiPlayers[aiId].position;
        }

        // Reset score
        if (room.players && room.players[aiId]) {
            room.players[aiId].score = 0;
        }
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
    createAIPlayers,
    updateAIPlayers,
    resetAIPlayers
};