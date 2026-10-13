/** Interpolation of sim state between the last two ticks (pure, allocation-free). */

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export interface MotionSample {
  x: number;
  y: number;
  facing: number;
}

/** Remembers the last two sim states of one entity. */
export class MotionBuffer {
  prevX = 0;
  prevY = 0;
  prevF = 0;
  curX = 0;
  curY = 0;
  curF = 0;
  tick = -1;
  /** Jumps larger than snapDist (tiles) snap instead of interpolating (teleports). */
  constructor(private readonly snapDist = 4) {}

  push(tick: number, x: number, y: number, facing: number): void {
    if (tick === this.tick) return;
    if (this.tick < 0) {
      this.prevX = this.curX = x;
      this.prevY = this.curY = y;
      this.prevF = this.curF = facing;
    } else {
      this.prevX = this.curX;
      this.prevY = this.curY;
      this.prevF = this.curF;
      this.curX = x;
      this.curY = y;
      this.curF = facing;
      const dx = x - this.prevX;
      const dy = y - this.prevY;
      if (dx * dx + dy * dy > this.snapDist * this.snapDist) {
        this.prevX = x;
        this.prevY = y;
      }
    }
    this.tick = tick;
  }

  sample(alpha: number, out: MotionSample): MotionSample {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    out.x = this.prevX + (this.curX - this.prevX) * a;
    out.y = this.prevY + (this.curY - this.prevY) * a;
    out.facing = lerpAngle(this.prevF, this.curF, a);
    return out;
  }
}
