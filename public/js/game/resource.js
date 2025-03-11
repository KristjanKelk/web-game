// public/js/game/resource.js - Updated ResourceManager class

export class ResourceManager {
    constructor(board, socket, roomCode, playerName, updateScoreCallback) {
        this.board = board;
        this.socket = socket;
        this.roomCode = roomCode;
        this.playerName = playerName;
        this.updateScore = updateScoreCallback;
        this.resourcesOnScreen = {}; // Object to track resource DOM elements

        // Initialize the resource event handlers
        this.init();
    }

    // Listen for all resource-related events from the server
    init() {
        // Resource spawning
        this.socket.on('resourceSpawned', (resource) => {
            this.spawnResource(resource);
        });

        // Resource removal (from any source)
        this.socket.on('resourceRemoved', (resourceId) => {
            this.removeResource(resourceId);
        });

        // AI resource collection for visual feedback
        this.socket.on('aiCollectedResource', (data) => {
            this.handleAICollection(data);
        });
    }

    spawnResource(resource) {
        // Create a DOM element for the resource
        const resEl = document.createElement('div');
        resEl.classList.add('resource');
        resEl.style.position = 'absolute';
        resEl.style.width = '20px';
        resEl.style.height = '20px';

        // Use purple for power-ups and yellow for normal resources
        resEl.style.backgroundColor = resource.type === 'powerup' ? 'purple' : 'yellow';
        resEl.style.borderRadius = '50%';
        resEl.style.left = resource.left + 'px';
        resEl.style.top = resource.top + 'px';

        // Add a data attribute to track the resource ID
        resEl.dataset.resourceId = resource.id;

        this.board.appendChild(resEl);
        this.resourcesOnScreen[resource.id] = resEl;
    }

    removeResource(resourceId) {
        // Check if this resource exists in our tracking object
        if (this.resourcesOnScreen[resourceId]) {
            console.log(`Removing resource ${resourceId} from screen`);

            try {
                // Only remove if it's actually in the DOM
                if (this.resourcesOnScreen[resourceId].parentNode === this.board) {
                    this.board.removeChild(this.resourcesOnScreen[resourceId]);
                }
            } catch (e) {
                console.error("Error removing resource from DOM:", e);
            }

            // Always delete from tracking object
            delete this.resourcesOnScreen[resourceId];
        }
    }

    // Handle visual feedback for AI collection
    handleAICollection(data) {
        console.log(`AI ${data.aiName} collected resource ${data.resourceId}`);

        // Create a visual indicator
        const indicator = document.createElement('div');
        indicator.className = 'ai-collection-indicator';
        indicator.textContent = '+10';
        indicator.style.position = 'absolute';
        indicator.style.left = data.position.x + 'px';
        indicator.style.top = data.position.y + 'px';
        indicator.style.color = data.type === 'powerup' ? '#ff00ff' : '#ffff00';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontSize = '16px';
        indicator.style.zIndex = '100';
        indicator.style.textShadow = '0 0 5px #000';
        indicator.style.pointerEvents = 'none';
        indicator.style.animation = 'fadeUpAndOut 1s forwards';

        // Add to the board
        this.board.appendChild(indicator);

        // Remove after animation completes
        setTimeout(() => {
            if (indicator.parentNode === this.board) {
                this.board.removeChild(indicator);
            }
        }, 1000);

        // Ensure resource is removed from screen
        this.removeResource(data.resourceId);
    }

    // Check for collisions between the player and resources
    checkCollisions(playerAvatar) {
        const avatarRect = playerAvatar.getBoundingClientRect();
        // Add a small buffer for more forgiving collision detection
        const buffer = 5;
        const adjustedRect = {
            left: avatarRect.left - buffer,
            right: avatarRect.right + buffer,
            top: avatarRect.top - buffer,
            bottom: avatarRect.bottom + buffer
        };

        for (const resourceId in this.resourcesOnScreen) {
            const resEl = this.resourcesOnScreen[resourceId];
            const resourceRect = resEl.getBoundingClientRect();

            if (
                adjustedRect.left < resourceRect.right &&
                adjustedRect.right > resourceRect.left &&
                adjustedRect.top < resourceRect.bottom &&
                adjustedRect.bottom > resourceRect.top
            ) {
                // Collision detected - award points
                this.updateScore(10);

                // Notify the server that this resource was collected
                this.socket.emit('resourceCollected', {
                    roomCode: this.roomCode,
                    resourceId: resourceId,
                    playerName: this.playerName
                });

                // Remove the resource locally right away
                this.removeResource(resourceId);
            }
        }
    }

    // Clear all resources (used for restart/reset)
    clearResources() {
        for (const resourceId in this.resourcesOnScreen) {
            this.removeResource(resourceId);
        }
    }
}