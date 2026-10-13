/** Ground-plane visibility rect used to skip per-frame work for off-screen entities. */
export interface GroundRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const makeRect = (): GroundRect => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });

export function rectContains(r: GroundRect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

export function rectsOverlap(r: GroundRect, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  return !(maxX < r.minX || minX > r.maxX || maxZ < r.minZ || minZ > r.maxZ);
}
