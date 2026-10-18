/** Pure audio logic: volume buses, voice limiting, throttling, positional math. No DOM / Web Audio. */

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Perceptual curve: slider value (0..1) → linear gain. */
export function curve(v: number): number {
  const c = clamp01(v);
  return c * c;
}

/** Linear gains of each bus given the slider values. */
export function busGains(v: Volumes): Volumes {
  return { master: curve(v.master), music: curve(v.music), sfx: curve(v.sfx) };
}

/** Final linear gain of a single sound = base * bus * master. */
export function finalGain(base: number, bus: 'music' | 'sfx', v: Volumes): number {
  const g = busGains(v);
  return clamp01(base) * g[bus] * g.master;
}

/** Distance attenuation: 1 within `near`, 0 beyond `far`, smooth quadratic falloff between. */
export function distanceGain(dist: number, near = 3, far = 22): number {
  if (!(dist > near)) return 1;
  if (dist >= far) return 0;
  const g = 1 - (dist - near) / (far - near);
  return g * g;
}

/** Stereo pan (-1..1) for an isometric camera: screen-x grows with (x - y) in tile space. */
export function panFor(dx: number, dy: number, range = 14): number {
  return Math.max(-1, Math.min(1, (dx - dy) / (2 * range)));
}

export function positional(
  listener: { x: number; y: number },
  pos: { x: number; y: number },
  near?: number,
  far?: number,
): { gain: number; pan: number } {
  const dx = pos.x - listener.x;
  const dy = pos.y - listener.y;
  return { gain: distanceGain(Math.hypot(dx, dy), near, far), pan: panFor(dx, dy) };
}

/** Limits concurrent voices per sound id and globally. Handles are released on end. */
export class VoiceLimiter {
  private perId = new Map<string, number>();
  private active = new Map<number, string>();
  private next = 1;

  constructor(
    private maxPerId = 4,
    private globalMax = 24,
    private overrides: Record<string, number> = {},
  ) {}

  /** Returns a handle (>0) or 0 if the voice should be dropped. */
  acquire(id: string): number {
    if (this.active.size >= this.globalMax) return 0;
    const cap = this.overrides[id] ?? this.maxPerId;
    const n = this.perId.get(id) ?? 0;
    if (n >= cap) return 0;
    const h = this.next++;
    this.active.set(h, id);
    this.perId.set(id, n + 1);
    return h;
  }

  release(handle: number): void {
    const id = this.active.get(handle);
    if (id === undefined) return;
    this.active.delete(handle);
    const n = (this.perId.get(id) ?? 1) - 1;
    if (n <= 0) this.perId.delete(id);
    else this.perId.set(id, n);
  }

  count(id?: string): number {
    return id === undefined ? this.active.size : (this.perId.get(id) ?? 0);
  }
}

/** Per-id cooldown plus per-batch cap, so 50 simultaneous hits become a handful of sounds. */
export class SfxThrottle {
  private last = new Map<string, number>();
  private batch = new Map<string, number>();

  constructor(
    private minInterval = 0.04,
    private perBatch = 4,
    private intervals: Record<string, number> = {},
    private batchCaps: Record<string, number> = {},
  ) {}

  beginBatch(): void {
    this.batch.clear();
  }

  /** True if the sound may play (and records it). `now` is seconds on a monotonic clock. */
  allow(id: string, now: number): boolean {
    const b = this.batch.get(id) ?? 0;
    if (b >= (this.batchCaps[id] ?? this.perBatch)) return false;
    const last = this.last.get(id);
    if (last !== undefined && now - last < (this.intervals[id] ?? this.minInterval)) return false;
    this.batch.set(id, b + 1);
    this.last.set(id, now);
    return true;
  }
}

/** Catalog fields that drive per-play variety. */
export interface TakeInfo {
  variants?: string[];
  rate?: [number, number];
}

/**
 * Choose which recorded take to play and its pitch: the entry or one of its variants (uniformly),
 * at a playback rate drawn from the chosen take's `rate` range. `r1`, `r2` in [0,1).
 */
export function pickTake(
  id: string,
  catalog: Readonly<Record<string, TakeInfo | undefined>>,
  r1: number,
  r2: number,
): { id: string; rate: number } {
  const e = catalog[id];
  const all = [id, ...(e?.variants ?? []).filter((v) => catalog[v] !== undefined)];
  const pick = all[Math.min(all.length - 1, Math.floor(r1 * all.length))] ?? id;
  const range = catalog[pick]?.rate;
  const rate = range ? range[0] + (range[1] - range[0]) * r2 : 1;
  return { id: pick, rate };
}
