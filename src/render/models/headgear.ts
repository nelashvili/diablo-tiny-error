/**
 * Procedural helmets that replace a model's own helmet mesh (KayKit's knight helm reads as fantasy):
 * a Mandalorian T-visor bucket or a trooper helmet. Built in a unit box facing +Z, then fitted to the
 * replaced mesh's bounds and parented to the head bone so it follows the animation.
 */
import * as THREE from 'three';
import { mk, unit } from './rig';
import { toonMaterial } from './toon';

export type HelmetStyle = 'mando' | 'trooper' | 'hood' | 'circlet';

/** Shapes in a unit box centered on the origin (x across, y up, z toward the face). */
export function helmetShapes(style: HelmetStyle, color: number): THREE.Mesh[] {
  const main = toonMaterial(color);
  const visor = toonMaterial(0x0c0c10);
  const metal = toonMaterial(0x3a3e46);
  if (style === 'hood') {
    // Cloth hood (worn hood items on heroes whose model has none): a cowl over the crown and back
    // of the head, set back so the face shows, with a peak at the back and a drape on the shoulders.
    return [
      mk(unit.sphere(), main, 1.1, 1.05, 0.95, 0, 0.14, -0.2),
      mk(unit.cone(), main, 0.42, 0.4, 0.42, 0, 0.42, -0.5).rotateX(-1.0),
      mk(unit.taper(), main, 1.15, 0.5, 1.0, 0, -0.42, -0.2),
    ];
  }
  if (style === 'circlet')
    // Forse Adept circlet: a thin band around the brow (hair stays out) with a crystal at the front.
    return [
      mk(unit.torus(), main, 0.8, 0.8, 1.2, 0, 0.11, 0.02).rotateX(Math.PI / 2 + 0.12),
      mk(unit.box(), main, 0.15, 0.13, 0.05, 0, 0.07, 0.41),
      mk(unit.gem(), metal, 0.1, 0.14, 0.07, 0, 0.08, 0.44),
    ];
  if (style === 'mando')
    return [
      // Bucket: a dome over straight sides, with a flat face plate in front.
      mk(unit.sphere(), main, 0.98, 0.84, 0.96, 0, 0.12, 0),
      mk(unit.cylinder(), main, 0.96, 0.6, 0.92, 0, -0.14, 0),
      mk(unit.box(), main, 0.64, 0.66, 0.1, 0, -0.08, 0.41),
      // T visor set into the face: brow slit and the strip down the middle.
      mk(unit.box(), visor, 0.6, 0.12, 0.06, 0, 0.07, 0.46),
      mk(unit.box(), visor, 0.15, 0.36, 0.06, 0, -0.14, 0.46),
      // Cheek flares angled back, and a chin vent.
      mk(unit.box(), main, 0.2, 0.24, 0.08, 0.36, -0.3, 0.3).rotateY(0.65),
      mk(unit.box(), main, 0.2, 0.24, 0.08, -0.36, -0.3, 0.3).rotateY(-0.65),
      mk(unit.box(), metal, 0.18, 0.05, 0.04, 0, -0.38, 0.46),
      // Ear caps; a rangefinder stalk on the left with its eyepiece swung down.
      mk(unit.cylinder(), metal, 0.22, 0.07, 0.22, 0.49, -0.04, 0).rotateZ(Math.PI / 2),
      mk(unit.cylinder(), metal, 0.22, 0.07, 0.22, -0.49, -0.04, 0).rotateZ(Math.PI / 2),
      mk(unit.cylinder(), metal, 0.045, 0.42, 0.045, 0.53, 0.2, 0.02),
      mk(unit.box(), metal, 0.06, 0.08, 0.16, 0.53, 0.39, 0.1),
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
  const meshes = helmetShapes(style, color);
  meshes.forEach((m, i) => {
    m.name = `Helmet_${i}`;
    m.castShadow = true;
    m.userData.rawMaterial = m.material;
    g.add(m);
  });
  head.add(g);
  return meshes;
}
