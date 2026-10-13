// STUB (Wave 0) — replaced by agent "render-vfx". Keep the exported signature.
import * as THREE from 'three';
import type { VfxSystem } from '../types';

export function createVfxSystem(): VfxSystem {
  const root = new THREE.Group();
  return {
    root,
    spawn() {},
    attach() {
      return { stop() {} };
    },
    handleEvents() {},
    update() {},
    setQuality() {},
    dispose() {},
  };
}
