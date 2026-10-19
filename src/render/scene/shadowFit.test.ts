import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitShadowBounds, type ShadowBounds } from './shadowFit';

const SUN = new THREE.Vector3(-0.55, 1.0, 0.35).normalize();
const TARGET = new THREE.Vector3(0, 0, 0);
const EYE = SUN.clone().multiplyScalar(45);
const square = (cx: number, cz: number, r: number) => [
  { x: cx - r, z: cz - r },
  { x: cx + r, z: cz - r },
  { x: cx - r, z: cz + r },
  { x: cx + r, z: cz + r },
];
const empty = (): ShadowBounds => ({ left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 });
const fit = (cx: number, cz: number, r: number, size = 2048) =>
  fitShadowBounds(EYE, TARGET, square(cx, cz, r), 2.5, size, empty());

/** Project a world point with a shadow camera built from the bounds; true when it lies inside. */
function covers(b: ShadowBounds, p: THREE.Vector3): boolean {
  const cam = new THREE.OrthographicCamera(b.left, b.right, b.top, b.bottom, b.near, b.far);
  cam.position.copy(EYE);
  cam.lookAt(TARGET);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const v = p.clone().project(cam);
  return Math.abs(v.x) <= 1 + 1e-6 && Math.abs(v.y) <= 1 + 1e-6 && Math.abs(v.z) <= 1 + 1e-6;
}

describe('fitShadowBounds', () => {
  it('covers every corner of the view, at ground and caster height, far from the eye', () => {
    for (const [cx, cz] of [
      [0, 0],
      [60, -40],
      [-80, 90],
    ] as const) {
      const b = fit(cx, cz, 9);
      for (const c of square(cx, cz, 9))
        for (const y of [0, 2.5]) expect(covers(b, new THREE.Vector3(c.x, y, c.z))).toBe(true);
    }
  });

  it('is much tighter than the old fixed 34-unit frustum for a small view', () => {
    const b = fit(0, 0, 6);
    expect((b.right - b.left) * (b.top - b.bottom)).toBeLessThan(34 * 34 * 0.6);
  });

  it('keeps the span and the texel grid stable while panning', () => {
    const a = fit(0, 0, 9, 1024);
    const b = fit(0.37, 0.11, 9, 1024);
    expect(b.right - b.left).toBeCloseTo(a.right - a.left, 9);
    expect(b.top - b.bottom).toBeCloseTo(a.top - a.bottom, 9);
    const tx = (a.right - a.left) / 1024;
    const ty = (a.top - a.bottom) / 1024;
    const onGrid = (v: number, t: number) => Math.abs(v / t - Math.round(v / t)) < 1e-6;
    expect(onGrid(a.left, tx) && onGrid(b.left, tx)).toBe(true);
    expect(onGrid(a.bottom, ty) && onGrid(b.bottom, ty)).toBe(true);
  });
});
