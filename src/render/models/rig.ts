import * as THREE from 'three';
import type { ActorMode } from '../../core/sim/entities';
import type { HeadgearStyle } from './outfit';

export type AttachSlot = 'mainHand' | 'offHand' | 'head' | 'chest';

/** One animated body (procedural placeholder or loaded glTF) inside an EntityVisual. */
export interface Rig {
  readonly root: THREE.Object3D;
  /** Meshes affected by setTint/setHighlight (excludes glows and attachments). */
  readonly bodyMeshes: THREE.Mesh[];
  /** `offHand`: swing with the left hand (rigs without mirrored clips ignore it). */
  setMode(mode: ActorMode, t: number, speedMul: number, offHand?: boolean): void;
  update(dt: number): void;
  /** Object3D to parent an attachment to. */
  socket(slot: AttachSlot): THREE.Object3D;
  /** Rotation (about X) applied to long-axis attachments so they point forward from the hand. */
  readonly handTilt: number;
  /**
   * Rigs that dress the body for helm and body-armor items (instead of hanging item models on
   * sockets): put on a helm look (`null` takes it off). Adds/removes meshes in `bodyMeshes`.
   */
  wearHeadgear?(style: HeadgearStyle | null, color: number): void;
  /** Bodies modelled in their own armor and helmet: helm and body-armor items recolor it, never hang on it. */
  readonly armored?: boolean;
  dispose(): void;
}

/** Shared unit geometries; meshes are scaled instead of building one geometry per size. */
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const unit = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  sphere: () => cached('sphere', () => new THREE.SphereGeometry(0.5, 14, 10)),
  /** Hemisphere (dome), base at y=0, radius 0.5. */
  dome: () => cached('dome', () => new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  cylinder: () => cached('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
  /** Open-ended tapered cylinder: wider at the bottom. */
  taper: () => cached('taper', () => new THREE.CylinderGeometry(0.32, 0.5, 1, 10)),
  cone: () => cached('cone', () => new THREE.ConeGeometry(0.5, 1, 10)),
  torus: () => cached('torus', () => new THREE.TorusGeometry(0.5, 0.08, 6, 20)),
  gem: () => cached('gem', () => new THREE.OctahedronGeometry(0.5, 0)),
  capsule: () => cached('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 4, 10)),
};

export function mk(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

const tmp = new THREE.Color();
/** Multiply a hex color's brightness. */
export function shade(hex: number, f: number): number {
  tmp.setHex(hex).multiplyScalar(f);
  return tmp.getHex();
}
