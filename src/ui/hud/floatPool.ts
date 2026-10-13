/**
 * Pure pooling + animation math for floating combat text (damage numbers, XP gains).
 * The DOM layer (FloatLayer.tsx) owns one element per slot and copies slot state into styles.
 */
import type { Vec2 } from '../../core/types';

export type FloatKind = 'dmg' | 'crit' | 'hurt' | 'heal' | 'xp' | 'creditz' | 'info';

export interface FloatSpec {
  text: string;
  /** CSS color (usually a var(--token)). */
  color: string;
  kind: FloatKind;
  /** World anchor (tiles). */
  world: Vec2;
  /** Anchor height above ground in tiles (head height). */
  height: number;
  /** Seconds to live. */
  life: number;
  /** Horizontal pixel offset so simultaneous numbers don't stack. */
  dx: number;
}

export interface FloatSlot extends FloatSpec {
  active: boolean;
  age: number;
  /** Monotonic spawn order, used to recycle the oldest when the pool is full. */
  serial: number;
  /** Set when the slot's spec changed and the DOM needs text/color/class rewritten. */
  dirty: boolean;
}

export class FloatPool {
  readonly slots: FloatSlot[];
  private serial = 0;
  private fan = 0;

  constructor(readonly capacity: number) {
    this.slots = Array.from({ length: capacity }, () => ({
      text: '',
      color: '',
      kind: 'dmg' as FloatKind,
      world: { x: 0, y: 0 },
      height: 0,
      life: 1,
      dx: 0,
      active: false,
      age: 0,
      serial: 0,
      dirty: false,
    }));
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /** Spawns a float; reuses a free slot or recycles the oldest active one. Returns slot index. */
  spawn(spec: Omit<FloatSpec, 'dx'> & { dx?: number }): number {
    let idx = this.slots.findIndex((s) => !s.active);
    if (idx < 0) {
      let oldest = 0;
      for (let i = 1; i < this.slots.length; i++)
        if (this.slots[i]!.serial < this.slots[oldest]!.serial) oldest = i;
      idx = oldest;
    }
    const s = this.slots[idx]!;
    s.text = spec.text;
    s.color = spec.color;
    s.kind = spec.kind;
    s.world = { x: spec.world.x, y: spec.world.y };
    s.height = spec.height;
    s.life = spec.life;
    s.dx = spec.dx ?? this.nextFan();
    s.active = true;
    s.age = 0;
    s.serial = ++this.serial;
    s.dirty = true;
    return idx;
  }

  /** Advance all active slots; returns true while anything is still alive. */
  step(dt: number): boolean {
    let any = false;
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.life) s.active = false;
      else any = true;
    }
    return any;
  }

  clear(): void {
    for (const s of this.slots) s.active = false;
  }

  /** Fan-out offsets: 0, +22, -22, +40, -40, +12, -12 ... (pixels). */
  private nextFan(): number {
    const pattern = [0, 22, -22, 40, -40, 12, -12, 30, -30];
    const v = pattern[this.fan % pattern.length]!;
    this.fan++;
    return v;
  }
}

export interface FloatFrame {
  /** Pixel offset from the projected anchor. */
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animation curve for a float at normalized age t (0..1): pops in with an overshoot bounce,
 * drifts upward and fades out during the last 35%. Crits pop bigger and rise higher.
 */
export function floatFrame(t: number, kind: FloatKind, dx: number): FloatFrame {
  const k = Math.min(Math.max(t, 0), 1);
  const crit = kind === 'crit';
  const rise = kind === 'xp' || kind === 'creditz' ? 70 : crit ? 80 : 56;
  // Pop: 0 -> peak (overshoot) by 12%, settle to 1 by 25%.
  const peak = crit ? 1.7 : 1.3;
  let scale: number;
  if (k < 0.12) scale = 0.4 + (peak - 0.4) * (k / 0.12);
  else if (k < 0.25) scale = peak + (1 - peak) * ((k - 0.12) / 0.13);
  else scale = 1;
  // Small hop arc sideways for regular hits; crits go straight up.
  const x = dx * easeOutCubic(Math.min(k * 2, 1));
  const y = -rise * easeOutCubic(k);
  const opacity = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
  return { x, y, scale, opacity: Math.max(0, opacity) };
}
