const resourcesOnScreen = {};

// Listen for resource spawn
socket.on('resourceSpawned', (resource) => {
    // Create a DOM element for the resource
    const resEl = document.createElement('div');
    resEl.classList.add('resource');
    resEl.style.position = 'absolute';
    resEl.style.width = '20px';
    resEl.style.height = '20px';
    resEl.style.backgroundColor = resource.type === 'powerup' ? 'purple' : 'yellow';
    resEl.style.borderRadius = '50%';
    resEl.style.left = resource.left + 'px';
    resEl.style.top = resource.top + 'px';
    board.appendChild(resEl);
    resourcesOnScreen[resource.id] = resEl;
});

// Listen for resource removal
socket.on('resourceRemoved', (resourceId) => {
    if (resourcesOnScreen[resourceId]) {
        board.removeChild(resourcesOnScreen[resourceId]);
        delete resourcesOnScreen[resourceId];
    }
});

// Update your collision detection function to check against these resources.
// When a collision is detected, emit an event to the server so it can remove the resource.
function checkCollisions() {
    const avatarRect = localAvatar.getBoundingClientRect();
    for (const resourceId in resourcesOnScreen) {
        const resEl = resourcesOnScreen[resourceId];
        const resourceRect = resEl.getBoundingClientRect();
        if (
            avatarRect.left < resourceRect.right &&
            avatarRect.right > resourceRect.left &&
            avatarRect.top < resourceRect.bottom &&
            avatarRect.bottom > resourceRect.top
        ) {
            // Collision detected.
            updateScore(10);
            // Inform the server that this resource was collected
            socket.emit('resourceCollected', { roomCode, resourceId, playerName });
            // Remove the resource locally
            board.removeChild(resEl);
            delete resourcesOnScreen[resourceId];
        }
    }
}
