/** Minimap / automap reveal state: one bit per tile. */
import type { Vec2 } from '../types';
import type { TileMap } from './types';

export class RevealMap {
  readonly bits: Uint32Array;
  /** Incremented whenever new tiles are revealed (cheap dirty check for the minimap texture). */
  version = 0;
  revealedCount = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    bits?: Uint32Array,
  ) {
    const words = Math.ceil((width * height) / 32);
    this.bits = bits && bits.length === words ? bits : new Uint32Array(words);
    if (bits && bits.length === words) {
      for (let i = 0; i < words; i++) this.revealedCount += popcount(bits[i] as number);
    }
  }

  static forMap(map: TileMap): RevealMap {
    return new RevealMap(map.width, map.height);
  }

  isRevealed(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    const i = ty * this.width + tx;
    return ((this.bits[i >> 5] as number) & (1 << (i & 31))) !== 0;
  }

  /** Reveal a disc around (cx, cy). Returns the number of newly revealed tiles. */
  reveal(cx: number, cy: number, radius: number): number {
    const r2 = radius * radius;
    let added = 0;
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const w = i >> 5;
        const m = 1 << (i & 31);
        if (((this.bits[w] as number) & m) === 0) {
          this.bits[w] = (this.bits[w] as number) | m;
          added++;
        }
      }
    if (added > 0) {
      this.revealedCount += added;
      this.version++;
    }
    return added;
  }

  revealAround(pos: Vec2, radius: number): number {
    return this.reveal(pos.x, pos.y, radius);
  }

  revealAll(): void {
    this.bits.fill(0xffffffff);
    this.revealedCount = this.width * this.height;
    this.version++;
  }

  /** Fraction of tiles revealed, 0..1. */
  get fraction(): number {
    return this.revealedCount / (this.width * this.height);
  }

  /** Serializable copy (for save games). */
  serialize(): number[] {
    return Array.from(this.bits);
  }

  static deserialize(width: number, height: number, data: readonly number[]): RevealMap {
    return new RevealMap(width, height, Uint32Array.from(data));
  }
}

function popcount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
