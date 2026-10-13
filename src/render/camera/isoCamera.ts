import * as THREE from 'three';
import {
  ISO_PITCH,
  ISO_YAW,
  effectiveViewHeight,
  isoBasis,
  ndcToGround,
  smoothFactor,
  worldToNdc,
  type IsoBasis,
} from './isoMath';
import { Shake } from './shake';

export const ZOOM_VIEW_HEIGHTS = [15, 22] as const;
const CAM_DIST = 70;

/** D2-style isometric orthographic follow camera. Hot-path methods are allocation-free. */
export class IsoCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAM_DIST * 2.5);
  readonly basis: IsoBasis = isoBasis(ISO_YAW, ISO_PITCH);
  readonly shake = new Shake();
  /** Smoothed follow target on the ground (world x, z). */
  readonly target = new THREE.Vector3();
  /** Effective camera center after shake. */
  readonly center = new THREE.Vector3();

  width = 1;
  height = 1;
  private zoomLevel = 0;
  private viewHeight: number = ZOOM_VIEW_HEIGHTS[0];
  private halfW = 1;
  private halfH = 1;
  private initialized = false;
  private readonly ndc = { x: 0, y: 0 };
  private readonly gnd = { x: 0, z: 0 };

  setZoom(level: number): void {
    this.zoomLevel = Math.max(0, Math.min(ZOOM_VIEW_HEIGHTS.length - 1, Math.round(level)));
  }
  getZoom(): number {
    return this.zoomLevel;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applyFrustum();
  }

  /** CSS pixels per world unit along the screen vertical. */
  get pxPerUnit(): number {
    return this.height / (this.halfH * 2);
  }

  private applyFrustum(): void {
    const aspect = this.width / this.height;
    const vh = effectiveViewHeight(this.viewHeight, aspect);
    this.halfH = vh / 2;
    this.halfW = this.halfH * aspect;
    const c = this.camera;
    c.left = -this.halfW;
    c.right = this.halfW;
    c.top = this.halfH;
    c.bottom = -this.halfH;
    c.updateProjectionMatrix();
  }

  /** Snap to a world position immediately (level load / teleport). */
  snapTo(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.initialized = true;
  }

  /** Follow (wx, wz) smoothly; call once per frame. */
  update(wx: number, wz: number, dt: number): void {
    if (!this.initialized) this.snapTo(wx, wz);
    const f = smoothFactor(9, dt);
    this.target.x += (wx - this.target.x) * f;
    this.target.z += (wz - this.target.z) * f;
    const goal = ZOOM_VIEW_HEIGHTS[this.zoomLevel] ?? ZOOM_VIEW_HEIGHTS[0];
    if (Math.abs(goal - this.viewHeight) > 0.001) {
      this.viewHeight += (goal - this.viewHeight) * smoothFactor(8, dt);
      this.applyFrustum();
    }
    this.shake.update(dt);
    const b = this.basis;
    const sx = this.shake.offX;
    const sy = this.shake.offY;
    this.center.set(
      this.target.x + b.right.x * sx + b.up.x * sy,
      b.up.y * sy,
      this.target.z + b.right.z * sx + b.up.z * sy,
    );
    this.camera.position.set(
      this.center.x + b.toCam.x * CAM_DIST,
      this.center.y + b.toCam.y * CAM_DIST,
      this.center.z + b.toCam.z * CAM_DIST,
    );
    this.camera.lookAt(this.center);
    this.camera.updateMatrixWorld();
  }

  /** Screen CSS pixel -> ground (world x, z). */
  screenToGround(px: number, py: number, out: { x: number; z: number }): boolean {
    const nx = (px / this.width) * 2 - 1;
    const ny = 1 - (py / this.height) * 2;
    return ndcToGround(this.basis, this.center, nx, ny, this.halfW, this.halfH, out);
  }

  /** World point -> screen CSS pixels. Returns false when far outside the viewport. */
  worldToScreen(wx: number, wy: number, wz: number, out: { x: number; y: number }): boolean {
    worldToNdc(this.basis, this.center, wx, wy, wz, this.halfW, this.halfH, this.ndc);
    out.x = (this.ndc.x * 0.5 + 0.5) * this.width;
    out.y = (0.5 - this.ndc.y * 0.5) * this.height;
    return Math.abs(this.ndc.x) < 3 && Math.abs(this.ndc.y) < 3;
  }

  /** Axis-aligned ground rect (world x/z) that contains the visible area, padded. */
  groundBounds(pad: number, out: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    out.minX = Infinity;
    out.maxX = -Infinity;
    out.minZ = Infinity;
    out.maxZ = -Infinity;
    const g = this.gnd;
    for (let i = 0; i < 4; i++) {
      const nx = i & 1 ? 1 : -1;
      const ny = i & 2 ? 1 : -1;
      ndcToGround(this.basis, this.center, nx, ny, this.halfW, this.halfH, g);
      if (g.x < out.minX) out.minX = g.x;
      if (g.x > out.maxX) out.maxX = g.x;
      if (g.z < out.minZ) out.minZ = g.z;
      if (g.z > out.maxZ) out.maxZ = g.z;
    }
    out.minX -= pad;
    out.minZ -= pad;
    out.maxX += pad;
    out.maxZ += pad;
  }
}
