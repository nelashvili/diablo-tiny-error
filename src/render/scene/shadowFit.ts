/** Fit the sun's orthographic shadow frustum to the visible ground, texel-snapped so shadows don't shimmer. */
import * as THREE from 'three';

export interface ShadowBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Light-space bounds (relative to a shadow camera at `eye` looking at `target`) that cover the ground
 * polygon `corners` from y=0 up to `height`. The span is rounded up to `step` world units and the edges
 * snapped to whole shadow-map texels: with a fixed eye, a panning view only ever shifts the shadow map by
 * whole texels, so shadow edges don't shimmer. near/far hug the covered depth (plus `casterMargin` toward
 * the light for tall casters just outside the view).
 */
export function fitShadowBounds(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  corners: readonly { x: number; z: number }[],
  height: number,
  mapSize: number,
  out: ShadowBounds,
  step = 2,
  casterMargin = 8,
): ShadowBounds {
  // Same orientation three.js gives the shadow camera (Object3D.lookAt for cameras).
  _m.lookAt(eye, target, THREE.Object3D.DEFAULT_UP);
  _m.extractBasis(_x, _y, _z);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minD = Infinity;
  let maxD = -Infinity;
  for (const c of corners) {
    for (let k = 0; k < 2; k++) {
      _p.set(c.x - eye.x, k * height - eye.y, c.z - eye.z);
      const lx = _p.dot(_x);
      const ly = _p.dot(_y);
      const d = -_p.dot(_z); // cameras look down their -z
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
    }
  }
  const w = Math.max(step, Math.ceil((maxX - minX) / step) * step);
  const h = Math.max(step, Math.ceil((maxY - minY) / step) * step);
  const tx = w / mapSize;
  const ty = h / mapSize;
  out.left = Math.floor(minX / tx) * tx;
  out.right = out.left + w;
  out.bottom = Math.floor(minY / ty) * ty;
  out.top = out.bottom + h;
  out.near = minD - casterMargin;
  out.far = maxD + 1;
  return out;
}
