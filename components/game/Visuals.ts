
export class Particle {
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
  life: number = 0;
  color: string = '#fff';
  size: number = 0;

  constructor() {
      // Empty for pooling
  }

  reset(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    // Fast pseudo-random spread
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.color = color;
    // Smaller random sizes for performance
    this.size = Math.random() * 2 + 2;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2; // Gravity
    this.life -= 0.04; // Slower decay for better persistence visual
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    
    // Optimization: avoid globalAlpha if possible, but for particles it's needed
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    
    // CRITICAL: Use fillRect instead of arc for massive mobile performance gain
    ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    
    ctx.globalAlpha = 1.0;
  }
}

export class GhostNoteObj {
    lane: number = 0;
    timeDiff: number = 0;
    life: number = 0;

    constructor() {}

    reset(lane: number, timeDiff: number, life: number) {
        this.lane = lane;
        this.timeDiff = timeDiff;
        this.life = life;
    }
}

// Renaming to avoid conflict if necessary, but GameCanvas imports GhostNote. 
// We can alias it.
export type GhostNote = GhostNoteObj; 

export interface HitEffect {
    id: number;
    text: string;
    time: number;
    lane: number;
    color: string;
    scale: number;
}

export class ObjectPool<T> {
    private pool: T[] = [];
    private createFn: () => T;

    constructor(createFn: () => T, initialSize: number = 50) {
        this.createFn = createFn;
        for(let i=0; i<initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    get(): T {
        const item = this.pool.pop();
        return item || this.createFn();
    }

    release(item: T) {
        this.pool.push(item);
    }
}
