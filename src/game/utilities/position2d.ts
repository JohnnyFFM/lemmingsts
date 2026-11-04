export class Position2D {
    /** X position in the container */
    public x:number = 0;
    /** Y position in the container */
    public y:number = 0;
    /** Optional extra targeting radius in this coordinate space. */
    public hitSlop = 0;
    /** True when the position came from a touch contact rather than a mouse or pen. */
    public touch = false;

    constructor(x:number = 0, y:number = 0) {
        this.x = x;
        this.y = y;
    }
} 
