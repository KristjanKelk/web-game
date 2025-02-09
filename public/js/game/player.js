// public/js/game/player.js

export class Player {
    constructor(board, initialPosition, color = 'blue') {
        this.board = board;
        this.position = { ...initialPosition };
        this.velocity = { x: 0, y: 0 };
        this.speed = 5;
        this.width = 40;
        this.height = 40;

        // Create the avatar element
        this.avatar = document.createElement('div');
        this.avatar.id = 'localAvatar';
        this.avatar.classList.add('avatar');
        this.avatar.style.backgroundColor = color;
        this.avatar.style.width = `${this.width}px`;
        this.avatar.style.height = `${this.height}px`;
        board.appendChild(this.avatar);
    }

    update() {
        // Update position based on velocity
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        // Constrain within board boundaries
        this.position.x = Math.max(0, Math.min(this.board.clientWidth - this.width, this.position.x));
        this.position.y = Math.max(0, Math.min(this.board.clientHeight - this.height, this.position.y));

        // Update avatar display
        this.avatar.style.transform = `translate(${this.position.x}px, ${this.position.y}px)`;
    }

    setVelocity(x, y) {
        this.velocity = { x, y };
    }
}
