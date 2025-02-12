// public/js/game/resources.js

// Export a class to manage resources.
export class ResourceManager {
    constructor(board, socket, roomCode, playerName, updateScoreCallback) {
        this.board = board;
        this.socket = socket;
        this.roomCode = roomCode;
        this.playerName = playerName;
        this.updateScore = updateScoreCallback; // Callback to update the score
        this.resourcesOnScreen = {}; // Object to track resource DOM elements
    }

    // Listen for resource spawn and removal events from the server.
    init() {
        this.socket.on('resourceSpawned', (resource) => {
            this.spawnResource(resource);
        });

        this.socket.on('resourceRemoved', (resourceId) => {
            this.removeResource(resourceId);
        });
    }

    spawnResource(resource) {
        // Create a DOM element for the resource.
        const resEl = document.createElement('div');
        resEl.classList.add('resource');
        resEl.style.position = 'absolute';
        resEl.style.width = '20px';
        resEl.style.height = '20px';
        // Use purple for power-ups and yellow for normal resources.
        resEl.style.backgroundColor = resource.type === 'powerup' ? 'purple' : 'yellow';
        resEl.style.borderRadius = '50%';
        resEl.style.left = resource.left + 'px';
        resEl.style.top = resource.top + 'px';
        this.board.appendChild(resEl);
        this.resourcesOnScreen[resource.id] = resEl;
    }

    removeResource(resourceId) {
        if (this.resourcesOnScreen[resourceId]) {
            this.board.removeChild(this.resourcesOnScreen[resourceId]);
            delete this.resourcesOnScreen[resourceId];
        }
    }

    // Check for collisions between the player's avatar and resources.
    // `playerAvatar` is the DOM element of the player's avatar.
    checkCollisions(playerAvatar) {
        let avatarRect = playerAvatar.getBoundingClientRect();
        // Optionally, add a small buffer to the collision area:
        const buffer = 5;
        avatarRect = {
            left: avatarRect.left - buffer,
            right: avatarRect.right + buffer,
            top: avatarRect.top - buffer,
            bottom: avatarRect.bottom + buffer
        };

        for (const resourceId in this.resourcesOnScreen) {
            const resEl = this.resourcesOnScreen[resourceId];
            const resourceRect = resEl.getBoundingClientRect();
            if (
                avatarRect.left < resourceRect.right &&
                avatarRect.right > resourceRect.left &&
                avatarRect.top < resourceRect.bottom &&
                avatarRect.bottom > resourceRect.top
            ) {
                // Collision detected—award points.
                this.updateScore(10);
                // Notify the server that this resource was collected.
                this.socket.emit('resourceCollected', {
                    roomCode: this.roomCode,
                    resourceId: resourceId,
                    playerName: this.playerName
                });
                // Remove the resource locally.
                this.board.removeChild(resEl);
                delete this.resourcesOnScreen[resourceId];
            }
        }
    }

    // Optional: Clear all resources (if needed).
    clearResources() {
        for (const resourceId in this.resourcesOnScreen) {
            this.board.removeChild(this.resourcesOnScreen[resourceId]);
        }
        this.resourcesOnScreen = {};
    }
}
