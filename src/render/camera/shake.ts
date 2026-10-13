/** Trauma-based screen shake (pure). Offsets are in screen-space world units. */
export class Shake {
  trauma = 0;
  enabled = true;
  private t = 0;
  offX = 0;
  offY = 0;

  add(amount: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.trauma = 0;
      this.offX = 0;
      this.offY = 0;
    }
  }

  update(dt: number, maxOffset = 0.35): void {
    if (this.trauma <= 0) {
      this.offX = 0;
      this.offY = 0;
      return;
    }
    this.t += dt * 40;
    const s = this.trauma * this.trauma * maxOffset;
    this.offX = (Math.sin(this.t * 1.3) + Math.sin(this.t * 2.7 + 1.1)) * 0.5 * s;
    this.offY = (Math.sin(this.t * 1.9 + 2.3) + Math.sin(this.t * 3.1)) * 0.5 * s;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
  }
}
