
export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;

  constructor(x: number, y: number, color: string) {
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

export interface GhostNote {
    lane: number;
    timeDiff: number; 
    life: number;
}

export interface HitEffect {
    id: number;
    text: string;
    time: number;
    lane: number;
    color: string;
    scale: number;
}
