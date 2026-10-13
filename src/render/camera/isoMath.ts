/**
 * Pure isometric-camera math (no Three.js): D2-style orthographic projection helpers.
 * World mapping: sim (x, y) -> world (x, 0, y). Camera looks from (+x, +up, +z) toward the target.
 */

export const ISO_YAW = Math.PI / 4;
/** True isometric pitch: atan(1/sqrt(2)) = 35.264 degrees. */
export const ISO_PITCH = Math.atan(1 / Math.SQRT2);

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface IsoBasis {
  /** Unit vector from target toward camera. */
  toCam: Vec3Like;
  /** Camera forward (look direction) = -toCam. */
  fwd: Vec3Like;
  right: Vec3Like;
  up: Vec3Like;
}

export function isoBasis(yaw = ISO_YAW, pitch = ISO_PITCH): IsoBasis {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const toCam = { x: cp * Math.sin(yaw), y: sp, z: cp * Math.cos(yaw) };
  const fwd = { x: -toCam.x, y: -toCam.y, z: -toCam.z };
  // right = normalize(fwd x worldUp)
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  // up = right x fwd
  const up = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  return { toCam, fwd, right, up };
}

/**
 * Effective ortho view height (world units). On narrow/portrait screens the horizontal extent is
 * kept at least `minAspect` * viewHeight wide so the playfield never gets too thin.
 */
export function effectiveViewHeight(viewHeight: number, aspect: number, minAspect = 1.25): number {
  return aspect >= minAspect ? viewHeight : (viewHeight * minAspect) / Math.max(aspect, 0.1);
}

/** Project a world point (relative to camera center `c`) to NDC. */
export function worldToNdc(
  b: IsoBasis,
  c: Vec3Like,
  px: number,
  py: number,
  pz: number,
  halfW: number,
  halfH: number,
  out: { x: number; y: number },
): void {
  const dx = px - c.x;
  const dy = py - c.y;
  const dz = pz - c.z;
  out.x = (dx * b.right.x + dy * b.right.y + dz * b.right.z) / halfW;
  out.y = (dx * b.up.x + dy * b.up.y + dz * b.up.z) / halfH;
}

/** Intersect the camera ray through NDC (nx, ny) with the ground plane y=0. */
export function ndcToGround(
  b: IsoBasis,
  c: Vec3Like,
  nx: number,
  ny: number,
  halfW: number,
  halfH: number,
  out: { x: number; z: number },
): boolean {
  const ox = c.x + b.right.x * nx * halfW + b.up.x * ny * halfH;
  const oy = c.y + b.right.y * nx * halfW + b.up.y * ny * halfH;
  const oz = c.z + b.right.z * nx * halfW + b.up.z * ny * halfH;
  if (Math.abs(b.fwd.y) < 1e-6) return false;
  const s = -oy / b.fwd.y;
  out.x = ox + b.fwd.x * s;
  out.z = oz + b.fwd.z * s;
  return true;
}

/** Squared distance from point to segment (all 2D). */
export function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + abx * t - px;
  const dy = ay + aby * t - py;
  return dx * dx + dy * dy;
}

/** Frame-rate independent exponential smoothing factor. */
export function smoothFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
