// server/ai-controller.js
// Overhauled AI controller with optimized resource collection

// AI player names
const AI_NAMES = ["Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta", "Bot Epsilon"];

// AI difficulty configurations with higher performance parameters
const AI_DIFFICULTY = {
    Easy: {
        decisionSpeed: 60, // ms between decisions
        moveAccuracy: 0.75,
        resourceDetectionRange: 250,
        strategyChangeFrequency: 3000,
        moveSpeed: 5.5,
        collisionBuffer: 20, // larger collision area = easier to collect
        targetPrecision: 10, // how close the bot tries to get to the center of a resource
    },
    Medium: {
        decisionSpeed: 40,
        moveAccuracy: 0.85,
        resourceDetectionRange: 450,
        strategyChangeFrequency: 2500,
        moveSpeed: 7,
        collisionBuffer: 15,
        targetPrecision: 7,
    },
    Hard: {
        decisionSpeed: 20,
        moveAccuracy: 0.95,
        resourceDetectionRange: 800,
        strategyChangeFrequency: 2000,
        moveSpeed: 8.5,
        collisionBuffer: 8, // smaller buffer = more precise targeting
        targetPrecision: 3,
    }
};

/**
 * Check if a position is safe for spawning (not colliding with walls)
 */
function isSafeSpawnPosition(position, labyrinth) {
    // Add a safety buffer around the avatar
    const avatar = {
        x: position.x - 5,
        y: position.y - 5,
        width: 50, // Larger than actual avatar for safety
        height: 50
    };

    return !checkWallCollision(avatar, labyrinth);
}

/**
 * Create AI players for a room
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
        { x: 500, y: 400 },
        { x: 300, y: 300 },
        { x: 700, y: 300 },
        { x: 300, y: 500 },
        { x: 700, y: 500 }
    ];

    // Shuffle positions for randomness
    const shuffledPositions = [...potentialSpawnPositions]
        .sort(() => Math.random() - 0.5);

    // Filter spawn positions that collide with walls
    const labyrinth = room.labyrinthLayout || [];
    const safeSpawnPositions = shuffledPositions.filter(pos =>
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
            targetPrecision: AI_DIFFICULTY[difficulty].targetPrecision,
            lastDecision: Date.now(),
            lastStrategyChange: Date.now(),
            // Path memory to avoid getting stuck
            lastPositions: [],
            stuckCounter: 0,
            // Add collection state to indicate when very close to resource
            collectingState: false,
            collectingResourceId: null,
            collisionBuffer: AI_DIFFICULTY[difficulty].collisionBuffer,
            moveSpeed: AI_DIFFICULTY[difficulty].moveSpeed
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
 */
// Replace this function in your ai-controller.js:

function updateAIPlayers(room, onResourceCollected) {
    if (!room || !room.aiPlayers || !room.resources) return room;

    const now = Date.now();
    const labyrinth = room.labyrinthLayout || [];

    // Process potential resource collections first
    for (const aiId in room.aiPlayers) {
        const ai = room.aiPlayers[aiId];

        // Check for collisions with any resources
        for (const resource of [...room.resources]) {
            // Use a larger collision buffer for initial detection
            if (checkResourceCollision(ai, resource, 10)) {
                console.log(`AI ${ai.name} collecting resource ${resource.id}`);

                // Remove resource from room's resource array
                room.resources = room.resources.filter(r => r.id !== resource.id);

                // Add points to the AI's score
                const points = 10;
                room.players[aiId].score += points;
                room.aiPlayers[aiId].score += points;

                // Reset targeting for this AI
                if (ai.targetResource === resource.id) {
                    ai.targetResource = null;
                    ai.collectingState = false;
                    ai.collectingResourceId = null;
                }

                // Call resource collected callback
                if (onResourceCollected) {
                    onResourceCollected(room, aiId, resource);
                }

                // Only collect one resource per update
                break;
            }
        }
    }

    // Then handle AI movement
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

        // Check if the AI is stuck
        if (ai.lastPositions.length >= 5) {
            const oldPos = ai.lastPositions[0];
            const currentPos = ai.position;
            const distance = Math.sqrt(
                Math.pow(currentPos.x - oldPos.x, 2) +
                Math.pow(currentPos.y - oldPos.y, 2)
            );

            if (distance < 20) {
                ai.stuckCounter++;

                if (ai.stuckCounter > 3) {
                    ai.targetResource = null;
                    ai.stuckCounter = 0;
                    ai.lastStrategyChange = now;
                    ai.collectingState = false;
                }
            } else {
                ai.stuckCounter = 0;
            }
        }

        // Periodically change strategy/target
        if (now - ai.lastStrategyChange > difficultySettings.strategyChangeFrequency) {
            ai.lastStrategyChange = now;
            ai.targetResource = null;
            ai.collectingState = false;
        }

        // Find a new target if needed
        if (!ai.targetResource || !room.resources.find(r => r.id === ai.targetResource)) {
            ai.collectingState = false;
            ai.collectingResourceId = null;

            // Find all resources in detection range
            const visibleResources = room.resources.filter(resource => {
                const dx = resource.left - ai.position.x;
                const dy = resource.top - ai.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return distance <= difficultySettings.resourceDetectionRange;
            });

            if (visibleResources.length > 0) {
                // Prefer power-ups based on difficulty
                const powerUps = visibleResources.filter(r => r.type === 'powerup');
                const powerUpPref = ai.difficulty === 'Hard' ? 0.9 :
                    ai.difficulty === 'Medium' ? 0.8 : 0.7;

                const targetPool = Math.random() < powerUpPref && powerUps.length > 0 ?
                    powerUps : visibleResources;

                // Hard bots prioritize closest resources
                if (ai.difficulty === 'Hard' && targetPool.length > 0) {
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
            } else if (room.resources.length > 0 && ai.difficulty !== 'Easy') {
                // If nothing in range but resources exist, target a random one (Medium/Hard only)
                const allPowerUps = room.resources.filter(r => r.type === 'powerup');
                const pickPowerUp = Math.random() < 0.8 && allPowerUps.length > 0;

                const anyTarget = pickPowerUp ?
                    allPowerUps[Math.floor(Math.random() * allPowerUps.length)] :
                    room.resources[Math.floor(Math.random() * room.resources.length)];

                ai.targetResource = anyTarget.id;
            }
        }

        // Move towards target resource
        let dx = 0, dy = 0;
        const moveSpeed = ai.moveSpeed || difficultySettings.moveSpeed;

        if (ai.targetResource) {
            const target = room.resources.find(r => r.id === ai.targetResource);

            if (target) {
                // Calculate center points
                const aiCenterX = ai.position.x + 20; // Avatar is 40x40
                const aiCenterY = ai.position.y + 20;
                const resourceCenterX = target.left + 10; // Resource is 20x20
                const resourceCenterY = target.top + 10;

                // Vector from AI to resource center
                dx = resourceCenterX - aiCenterX;
                dy = resourceCenterY - aiCenterY;

                // Calculate distance to target
                const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

                // Check if we're close enough to consider collecting
                const collectionDistance = 25 + ai.collisionBuffer;

                // If close to target, enter collection mode with higher precision
                if (distanceToTarget < collectionDistance) {
                    ai.collectingState = true;
                    ai.collectingResourceId = target.id;

                    // Slow down and increase precision when very close
                    const slowFactor = Math.max(0.3, distanceToTarget / collectionDistance);

                    // Precise movement directly to resource center
                    if (distanceToTarget > ai.targetPrecision) {
                        // Normalize and scale movement
                        const normalizedSpeed = moveSpeed * slowFactor;
                        dx = (dx / distanceToTarget) * normalizedSpeed;
                        dy = (dy / distanceToTarget) * normalizedSpeed;
                    } else {
                        // Do a final collision check
                        const collisionDetected = checkResourceCollision(ai, target, ai.collisionBuffer);

                        if (collisionDetected) {
                            // Remove resource from room's resource array
                            room.resources = room.resources.filter(r => r.id !== target.id);

                            // Add points to the AI's score
                            const points = 10;
                            room.players[aiId].score += points;
                            room.aiPlayers[aiId].score += points;

                            // Call resource collected callback
                            if (onResourceCollected) {
                                onResourceCollected(room, aiId, target);
                            }

                            // Reset targeting
                            ai.targetResource = null;
                            ai.collectingState = false;
                            ai.collectingResourceId = null;

                            // Skip movement for this cycle
                            continue;
                        }
                    }
                } else {
                    // Normal movement toward target
                    // Normalize
                    if (distanceToTarget > 0) {
                        dx = (dx / distanceToTarget) * moveSpeed;
                        dy = (dy / distanceToTarget) * moveSpeed;
                    }

                    // Apply move accuracy
                    if (Math.random() > difficultySettings.moveAccuracy) {
                        // Random movement when decision accuracy fails
                        dx = (Math.random() * 2 - 1) * moveSpeed;
                        dy = (Math.random() * 2 - 1) * moveSpeed;
                    }
                }
            }
        } else {
            // No target - intelligent exploration
            const centerX = 500;
            const centerY = 400;
            const toCenter = Math.random() < 0.7;

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
            // Smart wall avoidance
            // Try X direction only
            const newXOnly = ai.position.x + dx;
            const testX = {
                x: newXOnly,
                y: ai.position.y,
                width: 40,
                height: 40
            };

            const canMoveX = !checkWallCollision(testX, labyrinth);

            // Try Y direction only
            const newYOnly = ai.position.y + dy;
            const testY = {
                x: ai.position.x,
                y: newYOnly,
                width: 40,
                height: 40
            };

            const canMoveY = !checkWallCollision(testY, labyrinth);

            // Update position
            if (canMoveX) {
                ai.position.x = Math.max(0, Math.min(960, newXOnly));
            }

            if (canMoveY) {
                ai.position.y = Math.max(0, Math.min(760, newYOnly));
            }

            // If completely blocked, try perpendicular direction
            if (!canMoveX && !canMoveY) {
                ai.stuckCounter += 2;

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
    }

    return room;
}

/**
 * Check if an AI avatar collides with a resource
 */
function checkResourceCollision(ai, resource, buffer = 0) {
    // Get AI avatar center
    const aiCenterX = ai.position.x + 20; // Half of 40
    const aiCenterY = ai.position.y + 20;

    // Get resource center
    const resourceCenterX = resource.left + 10; // Half of 20
    const resourceCenterY = resource.top + 10;

    // Calculate distance between centers
    const dx = aiCenterX - resourceCenterX;
    const dy = aiCenterY - resourceCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Consider it a hit if centers are close enough
    // Buffer increases the effective hit radius
    return distance < (20 + buffer); // 20 = radius of AI (20) + radius of resource (10) - 10 for overlap
}

/**
 * Check if player collides with any wall
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
        { x: 500, y: 400 },
        { x: 300, y: 300 },
        { x: 700, y: 300 },
        { x: 300, y: 500 },
        { x: 700, y: 500 }
    ];

    // Shuffle positions
    const shuffledPositions = [...potentialSpawnPositions]
        .sort(() => Math.random() - 0.5);

    // Filter safe positions
    const safeSpawnPositions = shuffledPositions.filter(pos =>
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
            // Find a safe position
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

            if (collision) {
                spawnPosition = { x: 500, y: 400 };
            } else {
                spawnPosition = { x: candidateX, y: candidateY };
            }
        }

        // Reset bot state
        room.aiPlayers[aiId].position = spawnPosition;
        room.aiPlayers[aiId].targetResource = null;
        room.aiPlayers[aiId].lastDecision = Date.now();
        room.aiPlayers[aiId].lastStrategyChange = Date.now();
        room.aiPlayers[aiId].lastPositions = [];
        room.aiPlayers[aiId].stuckCounter = 0;
        room.aiPlayers[aiId].collectingState = false;
        room.aiPlayers[aiId].collectingResourceId = null;

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