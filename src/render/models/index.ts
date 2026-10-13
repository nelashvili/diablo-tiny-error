// STUB (Wave 0) — replaced by agent "render-models". Keep the exported signature.
import * as THREE from 'three';
import type { EntityVisual, VisualFactory } from '../types';
import { DEFAULT_PLACEHOLDER, MODEL_CATALOG } from '../assets/catalog';

export function createVisualFactory(): VisualFactory {
  return {
    async preload() {},
    create(modelId): EntityVisual {
      const ph = MODEL_CATALOG.find((m) => m.id === modelId)?.placeholder ?? DEFAULT_PLACEHOLDER;
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(ph.radius, ph.height - ph.radius * 2, 4, 8),
        new THREE.MeshStandardMaterial({ color: ph.color }),
      );
      mesh.position.y = ph.height / 2;
      const object = new THREE.Group();
      object.add(mesh);
      return {
        object,
        setMode() {},
        setFacing(rad) {
          object.rotation.y = -rad;
        },
        setAttachment() {},
        setHighlight() {},
        setTint() {},
        update() {},
        dispose() {
          mesh.geometry.dispose();
        },
      };
    },
    getStaticMesh() {
      return [
        {
          geometry: new THREE.BoxGeometry(1, 1, 1),
          material: new THREE.MeshStandardMaterial({ color: 0x555555 }),
        },
      ];
    },
  };
}
