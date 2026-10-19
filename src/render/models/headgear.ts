/**
 * Procedural helmets that replace a model's own helmet mesh (KayKit's knight helm reads as fantasy):
 * a Mandalorian T-visor bucket or a trooper helmet. Built in a unit box facing +Z, then fitted to the
 * replaced mesh's bounds and parented to the head bone so it follows the animation.
 */
import * as THREE from 'three';
import { mk, unit } from './rig';
import { toonMaterial } from './toon';

export type HelmetStyle = 'mando' | 'trooper';

/** Shapes in a unit box centered on the origin (x across, y up, z toward the face). */
function shapes(style: HelmetStyle, color: number): THREE.Mesh[] {
  const main = toonMaterial(color);
  const visor = toonMaterial(0x0c0c10);
  const metal = toonMaterial(0x3a3e46);
  if (style === 'mando')
    return [
      mk(unit.sphere(), main, 1, 0.9, 1, 0, 0.08, 0),
      mk(unit.cylinder(), main, 0.94, 0.5, 0.94, 0, -0.18, 0),
      // T visor: brow slit and a nose strip down the middle.
      mk(unit.box(), visor, 0.72, 0.13, 0.12, 0, 0.04, 0.44),
      mk(unit.box(), visor, 0.17, 0.36, 0.12, 0, -0.17, 0.44),
      // Ear caps and a rangefinder stalk on the left.
      mk(unit.cylinder(), metal, 0.2, 0.08, 0.2, 0.48, -0.02, 0).rotateZ(Math.PI / 2),
      mk(unit.cylinder(), metal, 0.2, 0.08, 0.2, -0.48, -0.02, 0).rotateZ(Math.PI / 2),
      mk(unit.cylinder(), metal, 0.05, 0.5, 0.05, 0.52, 0.28, 0.04),
    ];
  return [
    mk(unit.sphere(), main, 1, 0.95, 1, 0, 0.05, 0),
    mk(unit.cylinder(), main, 0.9, 0.42, 0.9, 0, -0.22, 0),
    // Big black eye lenses, a frown of a mouth grille and the side "ears".
    mk(unit.sphere(), visor, 0.26, 0.2, 0.12, -0.17, 0.02, 0.43),
    mk(unit.sphere(), visor, 0.26, 0.2, 0.12, 0.17, 0.02, 0.43),
    mk(unit.box(), metal, 0.3, 0.12, 0.1, 0, -0.24, 0.43),
    mk(unit.box(), visor, 0.6, 0.05, 0.08, 0, 0.26, 0.45),
    mk(unit.cylinder(), metal, 0.16, 0.08, 0.16, 0.47, -0.12, 0).rotateZ(Math.PI / 2),
    mk(unit.cylinder(), metal, 0.16, 0.08, 0.16, -0.47, -0.12, 0).rotateZ(Math.PI / 2),
  ];
}

const box = new THREE.Box3();
const inv = new THREE.Matrix4();
const center = new THREE.Vector3();
const size = new THREE.Vector3();

/**
 * Replace `old` (hidden) with a `style` helmet under `head`. Returns the new meshes (named
 * `Helmet_*` so armor outfits recolor them as head gear). The model must be in its bind pose.
 */
export function replaceHelmet(
  model: THREE.Object3D,
  old: THREE.Object3D,
  head: THREE.Object3D,
  style: HelmetStyle,
  color: number,
): THREE.Mesh[] {
  model.updateMatrixWorld(true);
  box.setFromObject(old, true);
  old.visible = false;
  // Fit in the head bone's frame (bind pose): unit box -> the old helmet's bounds, a bit larger.
  inv.copy(head.matrixWorld).invert();
  box.getCenter(center).applyMatrix4(inv);
  box.getSize(size);
  const s = new THREE.Vector3().setFromMatrixScale(head.matrixWorld);
  const g = new THREE.Group();
  g.name = 'Helmet';
  g.position.copy(center);
  g.scale.set((size.x / s.x) * 1.02, (size.y / s.y) * 1.0, (size.z / s.z) * 1.02);
  const q = new THREE.Quaternion();
  head.getWorldQuaternion(q);
  g.quaternion.copy(q.invert()).multiply(model.getWorldQuaternion(new THREE.Quaternion()));
  const meshes = shapes(style, color);
  meshes.forEach((m, i) => {
    m.name = `Helmet_${i}`;
    m.castShadow = true;
    m.userData.rawMaterial = m.material;
    g.add(m);
  });
  head.add(g);
  return meshes;
}
