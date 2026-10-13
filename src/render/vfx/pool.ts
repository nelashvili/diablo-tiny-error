/**
 * Pure (no Three.js) pooling primitives for the VFX system.
 * - SlotPool: fixed-capacity free-list allocator (effect instances, ribbon slots).
 * - ParticleSet: dense struct-of-arrays CPU particle simulation; zero allocations after construction.
 */

export class SlotPool {
  private readonly free: Int32Array;
  private readonly used: Uint8Array;
  private top: number;
  constructor(readonly capacity: number) {
    this.free = new Int32Array(capacity);
    this.used = new Uint8Array(capacity);
    this.top = capacity;
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
  }
  get liveCount(): number {
    return this.capacity - this.top;
  }
  /** Returns a free slot index, or -1 when exhausted. */
  alloc(): number {
    if (this.top === 0) return -1;
    const i = this.free[--this.top] as number;
    this.used[i] = 1;
    return i;
  }
  release(i: number): void {
    if (i < 0 || i >= this.capacity || !this.used[i]) return;
    this.used[i] = 0;
    this.free[this.top++] = i;
  }
  isLive(i: number): boolean {
    return i >= 0 && i < this.capacity && this.used[i] === 1;
  }
}

export const P_STRIDE = 24;
const X = 0,
  Y = 1,
  Z = 2,
  VX = 3,
  VY = 4,
  VZ = 5,
  AGE = 6,
  LIFE = 7,
  S0 = 8,
  S1 = 9,
  R0 = 10,
  G0 = 11,
  B0 = 12,
  R1 = 13,
  G1 = 14,
  B1 = 15,
  A0 = 16,
  A1 = 17,
  DRAG = 18,
  GRAV = 19,
  ROT = 20,
  ROTV = 21,
  SHAPE = 22;

/** Particle shapes understood by the shader. */
export const SHAPE_SOFT = 0;
export const SHAPE_SCRAP = 1;
export const SHAPE_SPARK = 2;

export class ParticleSet {
  readonly data: Float32Array;
  count = 0;
  /** Quality cap (<= capacity). */
  limit: number;
  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * P_STRIDE);
    this.limit = capacity;
  }

  /** Spawn one particle. Colors are 0xRRGGBB. Returns false when full (particle dropped). */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    color0: number,
    color1: number,
    alpha0: number,
    alpha1: number,
    drag: number,
    gravity: number,
    shape: number,
    rot: number,
    rotVel: number,
  ): boolean {
    if (this.count >= this.limit || life <= 0) return false;
    const d = this.data;
    const o = this.count++ * P_STRIDE;
    d[o + X] = x;
    d[o + Y] = y;
    d[o + Z] = z;
    d[o + VX] = vx;
    d[o + VY] = vy;
    d[o + VZ] = vz;
    d[o + AGE] = 0;
    d[o + LIFE] = life;
    d[o + S0] = size0;
    d[o + S1] = size1;
    d[o + R0] = ((color0 >> 16) & 255) / 255;
    d[o + G0] = ((color0 >> 8) & 255) / 255;
    d[o + B0] = (color0 & 255) / 255;
    d[o + R1] = ((color1 >> 16) & 255) / 255;
    d[o + G1] = ((color1 >> 8) & 255) / 255;
    d[o + B1] = (color1 & 255) / 255;
    d[o + A0] = alpha0;
    d[o + A1] = alpha1;
    d[o + DRAG] = drag;
    d[o + GRAV] = gravity;
    d[o + ROT] = rot;
    d[o + ROTV] = rotVel;
    d[o + SHAPE] = shape;
    return true;
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * Advance the simulation and write render attributes densely:
   * pos4 = (x,y,z,size), col4 = (r,g,b,a), misc2 = (rot, shape). Returns live count.
   */
  update(dt: number, pos4: Float32Array, col4: Float32Array, misc2: Float32Array): number {
    const d = this.data;
    let i = 0;
    while (i < this.count) {
      const o = i * P_STRIDE;
      const age = (d[o + AGE] as number) + dt;
      const life = d[o + LIFE] as number;
      if (age >= life) {
        // swap-remove: move the last particle into slot i and re-process i
        const last = --this.count;
        if (i !== last) d.copyWithin(o, last * P_STRIDE, last * P_STRIDE + P_STRIDE);
        continue;
      }
      d[o + AGE] = age;
      const drag = Math.max(0, 1 - (d[o + DRAG] as number) * dt);
      let vx = (d[o + VX] as number) * drag;
      let vy = ((d[o + VY] as number) - (d[o + GRAV] as number) * dt) * drag;
      let vz = (d[o + VZ] as number) * drag;
      let y = (d[o + Y] as number) + vy * dt;
      if (y < 0.03 && d[o + SHAPE] === SHAPE_SCRAP) {
        y = 0.03;
        vy = -vy * 0.35;
        vx *= 0.7;
        vz *= 0.7;
        d[o + ROTV] = (d[o + ROTV] as number) * 0.5;
      }
      d[o + VX] = vx;
      d[o + VY] = vy;
      d[o + VZ] = vz;
      const x = (d[o + X] as number) + vx * dt;
      const z = (d[o + Z] as number) + vz * dt;
      d[o + X] = x;
      d[o + Y] = y;
      d[o + Z] = z;
      const rot = (d[o + ROT] as number) + (d[o + ROTV] as number) * dt;
      d[o + ROT] = rot;
      const t = age / life;
      const fade = t < 0.1 ? t * 10 : 1;
      const p = i * 4;
      pos4[p] = x;
      pos4[p + 1] = y;
      pos4[p + 2] = z;
      pos4[p + 3] = (d[o + S0] as number) + ((d[o + S1] as number) - (d[o + S0] as number)) * t;
      col4[p] = (d[o + R0] as number) + ((d[o + R1] as number) - (d[o + R0] as number)) * t;
      col4[p + 1] = (d[o + G0] as number) + ((d[o + G1] as number) - (d[o + G0] as number)) * t;
      col4[p + 2] = (d[o + B0] as number) + ((d[o + B1] as number) - (d[o + B0] as number)) * t;
      col4[p + 3] = ((d[o + A0] as number) + ((d[o + A1] as number) - (d[o + A0] as number)) * t) * fade;
      misc2[i * 2] = rot;
      misc2[i * 2 + 1] = d[o + SHAPE] as number;
      i++;
    }
    return this.count;
  }
}
