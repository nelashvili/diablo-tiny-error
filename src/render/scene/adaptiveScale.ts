/** Dynamic resolution scale for weak devices (pure). Drops quickly when slow, recovers slowly. */
export class AdaptiveScale {
  scale = 1;
  private slow = 0;
  private fast = 0;

  constructor(
    private readonly minScale = 0.6,
    private readonly slowMs = 26,
    private readonly fastMs = 15,
  ) {}

  /** Returns true when the scale changed. */
  update(frameMs: number): boolean {
    if (frameMs > this.slowMs) {
      this.slow += frameMs / 1000;
      this.fast = 0;
    } else if (frameMs < this.fastMs) {
      this.fast += frameMs / 1000;
      this.slow = 0;
    } else {
      this.slow = 0;
      this.fast = 0;
    }
    if (this.slow > 1.5 && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, this.scale - 0.1);
      this.slow = 0;
      return true;
    }
    if (this.fast > 8 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1);
      this.fast = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.scale = 1;
    this.slow = 0;
    this.fast = 0;
  }
}
