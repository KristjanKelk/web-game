/**
 * Labyrinth generator module
 * Handles the creation of mazes and walls for the game
 */

/**
 * Generate a labyrinth layout based on difficulty
 * @param {string} difficulty - 'easy' or 'hard'
 * @returns {Array} Array of wall objects with x, y, width, height properties
 */
function generateLabyrinth(difficulty) {
    const boardWidth = 1300;
    const boardHeight = 1000;
    const cols = 26;
    const rows = 20;
    const cellWidth = boardWidth / cols;
    const cellHeight = boardHeight / rows;

    let wallProbability = difficulty === 'hard' ? 0.25 : 0.1;

    const walls = [];
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);
    const clearZoneSize = 3;
    const centerX = boardWidth / 2;
    const centerY = boardHeight / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Skip walls in the center to create a clear spawn area
            if (c >= centerCol - clearZoneSize && c <= centerCol + clearZoneSize &&
                r >= centerRow - clearZoneSize && r <= centerRow + clearZoneSize) {
                continue;
            }

            if (Math.random() < wallProbability) {
                const wallX = c * cellWidth;
                const wallY = r * cellHeight;

                // Calculate distance from center for safe spawn zone
                const distanceFromCenter = Math.sqrt(
                    Math.pow((wallX + cellWidth / 2) - centerX, 2) +
                    Math.pow((wallY + cellHeight / 2) - centerY, 2)
                );

                const safeDistance = Math.max(cellWidth, cellHeight) * 3;

                // Only place walls outside the safe spawn zone
                if (distanceFromCenter > safeDistance) {
                    walls.push({
                        x: wallX,
                        y: wallY,
                        width: cellWidth,
                        height: cellHeight
                    });
                }
            }
        }
    }
    return walls;
}

/**
 * Checks if a point is inside any wall
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Array} labyrinthLayout - Array of wall objects
 * @returns {boolean} True if the point is inside a wall
 */
function isInsideWall(x, y, labyrinthLayout) {
    for (const wall of labyrinthLayout) {
        if (x >= wall.x && x < wall.x + wall.width &&
            y >= wall.y && y < wall.y + wall.height) {
            return true;
        }
    }
    return false;
}

module.exports = {
    generateLabyrinth,
    isInsideWall
};