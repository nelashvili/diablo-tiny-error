// STUB (Wave 0) — replaced by agent "render-vfx". Keep the exported signature.
import type * as THREE from 'three';
import type { QualityLevel } from '../types';

export interface PostFx {
  render(dt: number): void;
  resize(w: number, h: number, dpr: number): void;
  setQuality(q: QualityLevel): void;
  /** Per-act color grade key (e.g. 'endoor', 'tatoonie'). */
  setGrade(key: string | null): void;
  dispose(): void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  return {
    render: () => renderer.render(scene, camera),
    resize: () => {},
    setQuality: () => {},
    setGrade: () => {},
    dispose: () => {},
  };
}
