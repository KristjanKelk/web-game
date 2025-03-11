// server/ai-controller.js
// Handles AI player logic for single-player mode

// AI player names
const AI_NAMES = ["Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta", "Bot Epsilon"];

// AI difficulty configurations - OPTIMIZED FOR FASTER GAMEPLAY
const AI_DIFFICULTY = {
    Easy: {
        decisionSpeed: 80, // ms between decisions
        moveAccuracy: 0.7,   // probability of moving in the correct direction
        resourceDetectionRange: 200, // how far the AI can "see" resources
        strategyChangeFrequency: 3000, // how often AI changes targets
        moveSpeed: 5, // Base movement speed
        resourceCollectionPrecision: 0.6 // How precisely it can collect resources
    },
    Medium: {
        decisionSpeed: 40,
        moveAccuracy: 0.85,
        resourceDetectionRange: 400,
        strategyChangeFrequency: 2500,
        moveSpeed: 6, // Slightly faster than easy
        resourceCollectionPrecision: 0.8
    },
    Hard: {
        decisionSpeed: 20, // Very fast decision making
        moveAccuracy: 0.95,
        resourceDetectionRange: 700,
        strategyChangeFrequency: 2000,
        moveSpeed: 7.5, // Faster movement
        resourceCollectionPrecision: 0.95 // Very accurate resource collection
    }
};

/**
 * Check if a position is safe for spawning (not colliding with walls)
 * @param {Object} position - Position to check
 * @param {Array} labyrinth - Labyrinth walls
 * @returns {boolean} True if position is safe
 */
function isSafeSpawnPosition(position, labyrinth) {
    const avatar = {
        x: position.x,
        y: position.y,
        width: 40,
        height: 40
    };

    return !checkWallCollision(avatar, labyrinth);
}

/**
 * Create AI players for a room
 * @param {Object} room - Room data
 * @param {number} count - Number of AI opponents
 * @param {string} difficulty - Difficulty level (Easy, Medium, Hard)
 */
function createAIPlayers(room, count, difficulty) {
    // Clear any existing AI players
    room.aiPlayers = {};

    // Spawn positions spread across the board
    const potentialSpawnPositions = [
        { x: 150, y: 150 },
        { x: 800, y: 150 },
        { x: 150, y: 600 },
        { x: 800, y: 600 },
        { x: 500, y: 400 }, // Center
        { x: 300, y: 300 },
        { x: 700, y: 300 },
        { x: 300, y: 500 },
        { x: 700, y: 500 }
    ];

    // Filter spawn positions that collide with walls
    const labyrinth = room.labyrinthLayout || [];
    const safeSpawnPositions = potentialSpawnPositions.filter(pos =>
        isSafeSpawnPosition(pos, labyrinth)
    );

    for (let i = 0; i < count; i++) {
        const aiName = `${AI_NAMES[i]} (${difficulty})`;
        const aiId = `ai-${i}-${Date.now()}`;

        // Select a safe spawn position or generate one if none available
        let spawnPosition;
        if (safeSpawnPositions.length > i) {
            // Use predetermined safe position
            spawnPosition = safeSpawnPositions[i];
        } else {
            // Generate a random position that doesn't collide with walls
            let attempts = 0;
            let candidateX, candidateY;
            let collision = true;

            while (collision && attempts < 20) {
                candidateX = 100 + Math.floor(Math.random() * 800);
                candidateY = 100 + Math.floor(Math.random() * 600);

                const candidatePos = {
                    x: candidateX,
                    y: candidateY,
                    width: 40,
                    height: 40
                };

                collision = checkWallCollision(candidatePos, labyrinth);
                attempts++;
            }

            // If we couldn't find a non-colliding position, use the center
            if (collision) {
                spawnPosition = { x: 500, y: 400 };
            } else {
                spawnPosition = { x: candidateX, y: candidateY };
            }
        }

        room.aiPlayers[aiId] = {
            name: aiName,
            difficulty: difficulty,
            score: 0,
            position: spawnPosition,
            targetResource: null,
            lastDecision: Date.now(),
            lastStrategyChange: Date.now(),
            // Add path memory to avoid getting stuck
            lastPositions: [],
            stuckCounter: 0
        };

        // Add to players list for score tracking
        room.players[aiId] = {
            name: aiName,
            score: 0,
            isAI: true
        };
    }

    return room;
}

/**
 * Update AI player positions and actions
 * @param {Object} room - Room data
 * @param {function} onResourceCollected - Callback when resource is collected
 */
function updateAIPlayers(room, onResourceCollected) {
    if (!room || !room.aiPlayers || !room.resources) return room;

    const now = Date.now();
    const labyrinth = room.labyrinthLayout || [];

    for (const aiId in room.aiPlayers) {
        const ai = room.aiPlayers[aiId];
        const difficultySettings = AI_DIFFICULTY[ai.difficulty] || AI_DIFFICULTY.Medium;

        // Only update AI position based on its decision speed
        if (now - ai.lastDecision < difficultySettings.decisionSpeed) continue;

        ai.lastDecision = now;

        // Keep track of positions to detect if stuck
        if (!ai.lastPositions) ai.lastPositions = [];
        ai.lastPositions.push({...ai.position});

        // Keep only the last 10 positions
        if (ai.lastPositions.length > 10) {
            ai.lastPositions.shift();
        }

        // Check if the AI is stuck (not moving much over time)
        if (ai.lastPositions.length >= 5) {
            const oldPos = ai.lastPositions[0];
            const currentPos = ai.position;
            const distance = Math.sqrt(
                Math.pow(currentPos.x - oldPos.x, 2) +
                Math.pow(currentPos.y - oldPos.y, 2)
            );

            // If barely moved, increase stuck counter
            if (distance < 20) {
                ai.stuckCounter++;

                // If stuck for too long, force a strategy change
                if (ai.stuckCounter > 3) {
                    ai.targetResource = null;
                    ai.stuckCounter = 0;
                    ai.lastStrategyChange = now;
                }
            } else {
                ai.stuckCounter = 0;
            }
        }

        // Periodically change strategy/target
        if (now - ai.lastStrategyChange > difficultySettings.strategyChangeFrequency) {
            ai.lastStrategyChange = now;
            ai.targetResource = null; // Will pick a new target
        }

        // Find closest resource if we don't have a target or target was collected
        if (!ai.targetResource || !room.resources.find(r => r.id === ai.targetResource)) {
            // Find all resources (prioritize resources in detection range but don't limit to them)
            const visibleResources = room.resources.filter(resource => {
                const dx = resource.left - ai.position.x;
                const dy = resource.top - ai.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return distance <= difficultySettings.resourceDetectionRange;
            });

            if (visibleResources.length > 0) {
                // Prefer power-ups more strongly based on difficulty
                const powerUps = visibleResources.filter(r => r.type === 'powerup');
                const powerUpPref = ai.difficulty === 'Hard' ? 0.9 :
                    ai.difficulty === 'Medium' ? 0.8 : 0.7;

                const targetPool = Math.random() < powerUpPref && powerUps.length > 0 ?
                    powerUps : visibleResources;

                // Pick closest resource or a random one based on difficulty
                if (ai.difficulty === 'Hard' && targetPool.length > 0) {
                    // Hard bots usually pick the closest resource
                    let closest = targetPool[0];
                    let closestDist = Infinity;

                    for (const resource of targetPool) {
                        const dx = resource.left - ai.position.x;
                        const dy = resource.top - ai.position.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < closestDist) {
                            closest = resource;
                            closestDist = dist;
                        }
                    }

                    ai.targetResource = closest.id;
                } else {
                    // Others pick somewhat randomly
                    ai.targetResource = targetPool[Math.floor(Math.random() * targetPool.length)].id;
                }
            } else if (room.resources.length > 0) {
                // If nothing in range but resources exist, target a random one (only for Medium/Hard)
                if (ai.difficulty !== 'Easy') {
                    // Get any resource, preferring power-ups
                    const allPowerUps = room.resources.filter(r => r.type === 'powerup');
                    const pickPowerUp = Math.random() < 0.8 && allPowerUps.length > 0;

                    const anyTarget = pickPowerUp ?
                        allPowerUps[Math.floor(Math.random() * allPowerUps.length)] :
                        room.resources[Math.floor(Math.random() * room.resources.length)];

                    ai.targetResource = anyTarget.id;
                }
            }
        }

        // Move towards target resource
        let dx = 0, dy = 0;
        const moveSpeed = difficultySettings.moveSpeed; // Use the difficulty-based speed

        if (ai.targetResource) {
            const target = room.resources.find(r => r.id === ai.targetResource);
            if (target) {
                dx = target.left - ai.position.x;
                dy = target.top - ai.position.y;

                // Normalize
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                if (magnitude > 0) {
                    dx = (dx / magnitude) * moveSpeed;
                    dy = (dy / magnitude) * moveSpeed;
                }

                // Apply move accuracy
                if (Math.random() > difficultySettings.moveAccuracy) {
                    // Random movement when decision accuracy fails
                    dx = (Math.random() * 2 - 1) * moveSpeed;
                    dy = (Math.random() * 2 - 1) * moveSpeed;
                }
            }
        } else {
            // Smarter random movement - explore toward center if no target
            const centerX = 500; // Approximate center of board
            const centerY = 400;
            const toCenter = Math.random() < 0.7; // 70% chance to move toward center

            if (toCenter) {
                // Move toward center with some randomness
                dx = ((centerX - ai.position.x) / 100) * moveSpeed * (0.5 + Math.random());
                dy = ((centerY - ai.position.y) / 100) * moveSpeed * (0.5 + Math.random());
            } else {
                // Pure random movement
                dx = (Math.random() * 2 - 1) * moveSpeed;
                dy = (Math.random() * 2 - 1) * moveSpeed;
            }
        }

        // Test new position for wall collisions
        const newX = ai.position.x + dx;
        const newY = ai.position.y + dy;

        // Check wall collisions
        let collides = false;
        for (const wall of labyrinth) {
            if (
                newX < wall.x + wall.width &&
                newX + 40 > wall.x &&
                newY < wall.y + wall.height &&
                newY + 40 > wall.y
            ) {
                collides = true;
                break;
            }
        }

        // If no collision, update position
        if (!collides) {
            // Constrain to board
            ai.position.x = Math.max(0, Math.min(960, newX));
            ai.position.y = Math.max(0, Math.min(760, newY));
        } else {
            // Wall avoidance - smarter path finding
            // Try first in X direction only
            const newXOnly = ai.position.x + dx;
            const testX = {
                x: newXOnly,
                y: ai.position.y,
                width: 40,
                height: 40
            };

            const canMoveX = !checkWallCollision(testX, labyrinth);

            // Then try Y direction only
            const newYOnly = ai.position.y + dy;
            const testY = {
                x: ai.position.x,
                y: newYOnly,
                width: 40,
                height: 40
            };

            const canMoveY = !checkWallCollision(testY, labyrinth);

            // Update position accordingly
            if (canMoveX) {
                ai.position.x = Math.max(0, Math.min(960, newXOnly));
            }

            if (canMoveY) {
                ai.position.y = Math.max(0, Math.min(760, newYOnly));
            }

            // If we can't move in either direction, try a new random direction
            if (!canMoveX && !canMoveY) {
                // Increment stuck counter faster when completely blocked
                ai.stuckCounter += 2;

                // Try moving in a perpendicular direction
                const perpX = dy * (Math.random() > 0.5 ? 1 : -1);
                const perpY = dx * (Math.random() > 0.5 ? 1 : -1);

                const perpTestPos = {
                    x: ai.position.x + perpX,
                    y: ai.position.y + perpY,
                    width: 40,
                    height: 40
                };

                if (!checkWallCollision(perpTestPos, labyrinth)) {
                    ai.position.x = Math.max(0, Math.min(960, ai.position.x + perpX));
                    ai.position.y = Math.max(0, Math.min(760, ai.position.y + perpY));
                }
            }
        }

        // Update the position in the positions list for rendering
        room.positions[aiId] = {
            playerName: ai.name,
            position: ai.position
        };

        // Check for resource collisions
        checkAIResourceCollisions(room, aiId, onResourceCollected);
    }

    return room;
}

/**
 * Check if AI player collects any resources
 * @param {Object} room - Room data
 * @param {string} aiId - AI player ID
 * @param {function} onResourceCollected - Callback when resource is collected
 */
function checkAIResourceCollisions(room, aiId, onResourceCollected) {
    if (!room || !room.resources || !room.aiPlayers[aiId]) return;

    const ai = room.aiPlayers[aiId];
    const difficultySettings = AI_DIFFICULTY[ai.difficulty] || AI_DIFFICULTY.Medium;

    // Improved collision detection with precision factor
    const avatarSize = 40;
    const resourceSize = 20;
    const collisionPrecision = difficultySettings.resourceCollectionPrecision;

    // Adjust collision box based on precision (lower precision = smaller effective hitbox)
    const collisionAdjustment = (1 - collisionPrecision) * 10; // 0 for perfect precision, up to 10px for low precision

    const aiRect = {
        left: ai.position.x + collisionAdjustment,
        right: ai.position.x + avatarSize - collisionAdjustment,
        top: ai.position.y + collisionAdjustment,
        bottom: ai.position.y + avatarSize - collisionAdjustment
    };

    for (const resource of [...room.resources]) {
        const resourceRect = {
            left: resource.left,
            right: resource.left + resourceSize,
            top: resource.top,
            bottom: resource.top + resourceSize
        };

        if (
            aiRect.left < resourceRect.right &&
            aiRect.right > resourceRect.left &&
            aiRect.top < resourceRect.bottom &&
            aiRect.bottom > resourceRect.top
        ) {
            // AI has sufficient precision to collect
            if (Math.random() <= difficultySettings.resourceCollectionPrecision) {
                // Remove resource from room's resource array first
                room.resources = room.resources.filter(r => r.id !== resource.id);

                // Reset target since we collected this resource
                if (ai.targetResource === resource.id) {
                    ai.targetResource = null;
                }

                // Add points to the AI's score
                const points = 10;
                room.players[aiId].score += points;
                room.aiPlayers[aiId].score += points;

                // Call the resource collected callback to remove resource visually for clients
                if (onResourceCollected) {
                    onResourceCollected(room, aiId, resource);
                }

                // Exit after collecting one resource per update
                break;
            }
        }
    }
}

/**
 * Check if player collides with any wall
 * @param {Object} player - Player object with position and size
 * @param {Array} labyrinthLayout - Array of wall objects
 * @returns {boolean} True if collision detected
 */
function checkWallCollision(player, labyrinthLayout) {
    for (const wall of labyrinthLayout) {
        if (
            player.x < wall.x + wall.width &&
            player.x + player.width > wall.x &&
            player.y < wall.y + wall.height &&
            player.y + player.height > wall.y
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Reset AI player positions for game restart
 * @param {Object} room - Room data
 */
function resetAIPlayers(room) {
    if (!room || !room.aiPlayers) return room;

    // Generate spawn positions that don't collide with walls
    const labyrinth = room.labyrinthLayout || [];

    // Potential spawn positions
    const potentialSpawnPositions = [
        { x: 150, y: 150 },
        { x: 800, y: 150 },
        { x: 150, y: 600 },
        { x: 800, y: 600 },
        { x: 500, y: 400 }, // Center
        { x: 300, y: 300 },
        { x: 700, y: 300 },
        { x: 300, y: 500 },
        { x: 700, y: 500 }
    ];

    // Filter safe positions
    const safeSpawnPositions = potentialSpawnPositions.filter(pos =>
        isSafeSpawnPosition(pos, labyrinth)
    );

    let i = 0;
    for (const aiId in room.aiPlayers) {
        // Reset score
        room.aiPlayers[aiId].score = 0;
        room.players[aiId].score = 0;

        // Choose a safe spawn position
        let spawnPosition;
        if (safeSpawnPositions.length > i) {
            spawnPosition = safeSpawnPositions[i];
        } else {
            // If no safe positions are available, find one
            let attempts = 0;
            let candidateX, candidateY;
            let collision = true;

            while (collision && attempts < 20) {
                candidateX = 100 + Math.floor(Math.random() * 800);
                candidateY = 100 + Math.floor(Math.random() * 600);

                const candidatePos = {
                    x: candidateX,
                    y: candidateY,
                    width: 40,
                    height: 40
                };

                collision = checkWallCollision(candidatePos, labyrinth);
                attempts++;
            }

            // Default to center if no safe position found
            if (collision) {
                spawnPosition = { x: 500, y: 400 };
            } else {
                spawnPosition = { x: candidateX, y: candidateY };
            }
        }

        // Set the spawn position
        room.aiPlayers[aiId].position = spawnPosition;

        // Reset target and timers
        room.aiPlayers[aiId].targetResource = null;
        room.aiPlayers[aiId].lastDecision = Date.now();
        room.aiPlayers[aiId].lastStrategyChange = Date.now();
        room.aiPlayers[aiId].lastPositions = [];
        room.aiPlayers[aiId].stuckCounter = 0;

        i++;
    }

    return room;
}

module.exports = {
    createAIPlayers,
    updateAIPlayers,
    resetAIPlayers,
    AI_NAMES,
    AI_DIFFICULTY
};