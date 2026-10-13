import { TICK_SECONDS } from '../types';
import type { SimSystem, SimWorld } from './world';

/**
 * Fixed-timestep driver. Call `advance(realDeltaSec)` from requestAnimationFrame; it runs 0..N
 * ticks at 25 Hz and returns the interpolation alpha (0..1) for rendering.
 */
export class FixedLoop {
  private acc = 0;
  /** Avoid spiral of death on slow devices / tab switches. */
  maxTicksPerFrame = 5;

  constructor(
    private world: SimWorld,
    private systems: SimSystem[],
  ) {}

  advance(realDeltaSec: number): number {
    if (this.world.paused) return 0;
    this.acc += Math.min(realDeltaSec, TICK_SECONDS * this.maxTicksPerFrame);
    let n = 0;
    while (this.acc >= TICK_SECONDS && n < this.maxTicksPerFrame) {
      this.step();
      this.acc -= TICK_SECONDS;
      n++;
    }
    return this.acc / TICK_SECONDS;
  }

  /** Run exactly one tick (tests & headless balance sim use this). */
  step(): void {
    const w = this.world;
    for (const s of this.systems) s.update(w, TICK_SECONDS);
    w.sweep();
    w.tick++;
    w.time += TICK_SECONDS;
  }
}
