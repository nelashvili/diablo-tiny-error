/**
 * Procedural rigid armor and droid bodies for the universal humanoid rig. Pieces (plates, tubes,
 * helmets, a B1 droid head) are laid out per bone and merged into ONE vertex-colored SkinnedMesh bound
 * to the model's skeleton (each piece weighted fully to its bone), plus one for glowing bits — so a
 * fully armored trooper or a whole droid costs two draw calls and plays every humanoid animation.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { unit } from './rig';
import { getGradientMap, glowMaterial } from './toon';
import { helmetShapes } from './headgear';

export type ArmorStyle = 'trooper' | 'mando' | 'droid';

export interface ArmorSpec {
  style: ArmorStyle;
  /** Main plate / droid shell color. */
  color: number;
  /** Secondary color (belts, jetpack, droid joints). */
  trim?: number;
  /** Eye / lamp glow (droids). */
  eye?: number;
}

/** One piece: a unit shape placed in its bone's segment frame (x side, y along the bone, z forward). */
interface Piece {
  bone: string;
  geo: THREE.BufferGeometry;
  pos: [number, number, number];
  size: [number, number, number];
  rot?: [number, number, number];
  color: number;
  glow?: boolean;
}

/** Segment frame of a bone: y along the bone toward `child`, z toward the model's front. */
const CHILD: Record<string, string> = {
  pelvis: 'spine_01',
  spine_01: 'spine_02',
  spine_02: 'spine_03',
  spine_03: 'neck_01',
  neck_01: 'Head',
  upperarm_l: 'lowerarm_l',
  upperarm_r: 'lowerarm_r',
  lowerarm_l: 'hand_l',
  lowerarm_r: 'hand_r',
  hand_l: 'middle_01_l',
  hand_r: 'middle_01_r',
  thigh_l: 'calf_l',
  thigh_r: 'calf_r',
  calf_l: 'foot_l',
  calf_r: 'foot_r',
  foot_l: 'ball_l',
  foot_r: 'ball_r',
};

const SIDES = ['l', 'r'] as const;

/** Bone lengths (bind pose) the layouts scale with; fallbacks are a ~1.8 m human. */
type Lengths = (bone: string) => number;

function tube(bone: string, len: number, from: number, to: number, r: number, color: number): Piece {
  return {
    bone,
    geo: unit.cylinder(),
    pos: [0, len * (from + to) * 0.5, 0],
    size: [r * 2, len * (to - from), r * 2],
    color,
  };
}

function ball(bone: string, y: number, r: number, color: number, glow = false): Piece {
  return { bone, geo: unit.sphere(), pos: [0, y, 0], size: [r * 2, r * 2, r * 2], color, glow };
}

function plate(
  bone: string,
  pos: [number, number, number],
  size: [number, number, number],
  color: number,
): Piece {
  return { bone, geo: unit.box(), pos, size, color };
}

/** Helmet meshes (headgear.ts) fitted around the head: centered above the Head bone, ~0.27 m. */
function helmet(style: 'trooper' | 'mando', color: number): Piece[] {
  return helmetShapes(style, color).map((m) => {
    const mat = m.material as THREE.MeshToonMaterial;
    const k = 0.27;
    return {
      bone: 'Head',
      geo: m.geometry,
      pos: [m.position.x * k, 0.11 + m.position.y * k, 0.02 + m.position.z * k],
      size: [m.scale.x * k, m.scale.y * k * 1.08, m.scale.z * k],
      rot: [m.rotation.x, m.rotation.y, m.rotation.z],
      color: mat.color.getHex(),
    };
  });
}

function armorLayout(spec: ArmorSpec, L: Lengths): Piece[] {
  const main = spec.color;
  const trim = spec.trim ?? 0x2a2c32;
  const out: Piece[] = [
    // Chest and back plates, abdomen, belt.
    plate('spine_03', [0, L('spine_03') * 0.35, 0.05], [0.36, 0.24, 0.12], main),
    plate('spine_03', [0, L('spine_03') * 0.3, -0.08], [0.32, 0.26, 0.1], main),
    plate('spine_01', [0, L('spine_01') * 0.6, 0.06], [0.28, 0.12, 0.08], main),
    plate('pelvis', [0, 0.02, 0], [0.34, 0.09, 0.24], trim),
  ];
  for (const s of SIDES) {
    out.push(
      ball(`upperarm_${s}`, 0.02, 0.085, main),
      tube(`upperarm_${s}`, L(`upperarm_${s}`), 0.25, 0.85, 0.052, main),
      tube(`lowerarm_${s}`, L(`lowerarm_${s}`), 0.15, 0.9, 0.048, main),
      tube(`thigh_${s}`, L(`thigh_${s}`), 0.04, 0.96, 0.118, main),
      tube(`calf_${s}`, L(`calf_${s}`), 0.04, 0.95, 0.095, main),
      // Knee and elbow caps hide where the rigid tubes meet when the joint bends.
      ball(`calf_${s}`, 0.0, 0.112, trim),
      ball(`lowerarm_${s}`, 0.0, 0.058, trim),
      plate(`foot_${s}`, [0, L(`foot_${s}`) * 0.45, -0.01], [0.12, L(`foot_${s}`) * 1.35, 0.1], trim),
    );
  }
  if (spec.style === 'mando')
    // Jetpack between the shoulder blades.
    out.push(
      plate('spine_03', [0, L('spine_03') * 0.25, -0.17], [0.22, 0.28, 0.1], trim),
      { ...tube('spine_03', 0.2, 0, 1, 0.035, main), pos: [0.075, L('spine_03') * 0.4, -0.2] },
      { ...tube('spine_03', 0.2, 0, 1, 0.035, main), pos: [-0.075, L('spine_03') * 0.4, -0.2] },
    );
  out.push(...helmet(spec.style === 'mando' ? 'mando' : 'trooper', main));
  return out;
}

/** B1-style battle droid: spindly limbs, joint knobs, a slim chest pack and the long snouted head. */
function droidLayout(spec: ArmorSpec, L: Lengths): Piece[] {
  const shell = spec.color;
  const joint = spec.trim ?? 0x2e241a;
  const eye = spec.eye ?? 0x4fc3ff;
  const out: Piece[] = [
    plate('spine_03', [0, L('spine_03') * 0.35, 0.02], [0.22, 0.2, 0.12], shell),
    plate('spine_03', [0, L('spine_03') * 0.3, -0.09], [0.18, 0.18, 0.08], joint),
    tube('spine_01', L('spine_01') + L('spine_02'), 0, 1, 0.025, joint),
    plate('pelvis', [0, 0.02, 0], [0.2, 0.07, 0.12], shell),
    tube('neck_01', L('neck_01') + 0.04, 0, 1, 0.018, joint),
    // Head: a long rounded snout pointing forward, tilted down a little.
    {
      bone: 'Head',
      geo: unit.capsule(),
      pos: [0, 0.06, 0.08],
      size: [0.09, 0.1, 0.1],
      rot: [Math.PI / 2 + 0.2, 0, 0],
      color: shell,
    },
    { bone: 'Head', geo: unit.box(), pos: [0, 0.05, -0.04], size: [0.11, 0.1, 0.1], color: shell },
    { ...ball('Head', 0.075, 0.016, eye, true), pos: [0.05, 0.075, 0.0] },
    { ...ball('Head', 0.075, 0.016, eye, true), pos: [-0.05, 0.075, 0.0] },
  ];
  for (const s of SIDES) {
    out.push(
      ball(`upperarm_${s}`, 0, 0.04, shell),
      tube(`upperarm_${s}`, L(`upperarm_${s}`), 0, 1, 0.022, shell),
      ball(`lowerarm_${s}`, 0, 0.032, joint),
      tube(`lowerarm_${s}`, L(`lowerarm_${s}`), 0, 1, 0.02, shell),
      plate(`hand_${s}`, [0, 0.05, 0], [0.05, 0.1, 0.025], joint),
      ball(`thigh_${s}`, 0, 0.045, joint),
      tube(`thigh_${s}`, L(`thigh_${s}`), 0, 1, 0.026, shell),
      ball(`calf_${s}`, 0, 0.038, joint),
      tube(`calf_${s}`, L(`calf_${s}`), 0, 1, 0.024, shell),
      plate(`foot_${s}`, [0, L(`foot_${s}`) * 0.55, -0.02], [0.08, L(`foot_${s}`) * 1.5, 0.05], shell),
    );
  }
  return out;
}

const vcMaterials = new Map<string, THREE.MeshToonMaterial>();
/** Shared vertex-colored toon material (base color white, pieces carry their color). */
export function vertexColorToon(color = 0xffffff): THREE.MeshToonMaterial {
  const key = `vc${color}`;
  let m = vcMaterials.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, vertexColors: true, gradientMap: getGradientMap() });
    m.name = 'ArmorVC';
    vcMaterials.set(key, m);
  }
  return m;
}

const _m = new THREE.Matrix4();
const _f = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _x = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Build the armor / droid body for `spec` on a cloned universal-rig model in its bind pose. Returns
 * the new skinned meshes (already added next to the model's body mesh). `hideBody` hides the model's
 * own meshes (droids).
 */
export function buildArmor(model: THREE.Object3D, spec: ArmorSpec, hideBody: boolean): THREE.SkinnedMesh[] {
  const layout = (L: Lengths) => (spec.style === 'droid' ? droidLayout(spec, L) : armorLayout(spec, L));
  const out = bindPieces(model, layout, vertexColorToon(), 'Armor', spec.eye ?? 0x4fc3ff);
  if (hideBody)
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !out.includes(o as THREE.SkinnedMesh)) o.visible = false;
    });
  return out;
}

/**
 * A helmet alone (worn helm items), skinned to the Head bone. Its vertex colors are white for the
 * shell, so `material.color` paints it; visor and metal keep their dark tones. The model must be in
 * its rest pose.
 */
export function buildHelmet(
  model: THREE.Object3D,
  style: 'trooper' | 'mando',
  material: THREE.Material,
): THREE.SkinnedMesh | null {
  return bindPieces(model, () => helmet(style, 0xffffff), material, 'Helmet_Worn', 0)[0] ?? null;
}

function bindPieces(
  model: THREE.Object3D,
  layout: (L: Lengths) => Piece[],
  solidMat: THREE.Material,
  name: string,
  glowColor: number,
): THREE.SkinnedMesh[] {
  const own: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) own.push(o as THREE.SkinnedMesh);
  });
  const host = own[0];
  if (!host) return [];
  const skeleton = host.skeleton;
  model.updateMatrixWorld(true);
  const index = new Map(skeleton.bones.map((b, i) => [b.name, i]));
  const boneOf = (n: string) => {
    const i = index.get(n);
    return i === undefined ? null : { i, bone: skeleton.bones[i]! };
  };
  const lengths: Lengths = (n) => {
    const b = boneOf(n)?.bone;
    const c = CHILD[n] && boneOf(CHILD[n]!)?.bone;
    return b && c ? c.position.length() : 0.12;
  };
  // Model front (+Z) in world space, for each bone's segment frame.
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(_q)).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q).normalize();
  const pieces = layout(lengths);

  const solid: THREE.BufferGeometry[] = [];
  const glowing: THREE.BufferGeometry[] = [];
  for (const p of pieces) {
    const hit = boneOf(p.bone);
    if (!hit) continue;
    const { i, bone } = hit;
    // Segment frame in bone-local space: y toward the child bone, z toward the model's front.
    const child = CHILD[p.bone] ? boneOf(CHILD[p.bone]!)?.bone : undefined;
    _y.copy(child ? child.position : _y.set(0, 1, 0)).normalize();
    bone.getWorldQuaternion(_q).invert();
    _z.copy(front).applyQuaternion(_q);
    // Bones running front-to-back (feet) take "up" as their second axis instead.
    if (Math.abs(_z.dot(_y)) > 0.7) _z.copy(up).applyQuaternion(_q);
    _z.addScaledVector(_y, -_z.dot(_y));
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
    _z.normalize();
    _x.crossVectors(_y, _z).normalize();
    _f.makeBasis(_x, _y, _z);
    // piece -> bone local -> bind space of the host mesh (inverse of the bone's inverse bind matrix).
    _m.compose(
      new THREE.Vector3(...p.pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...p.size),
    );
    _m.premultiply(_f);
    _m.premultiply(new THREE.Matrix4().copy(skeleton.boneInverses[i]!).invert());
    _m.premultiply(host.bindMatrixInverse);
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(_m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    _c.setHex(p.color);
    for (let k = 0; k < n; k++) col.set([_c.r, _c.g, _c.b], k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      si[k * 4] = i;
      sw[k * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    (p.glow ? glowing : solid).push(g);
  }

  const out: THREE.SkinnedMesh[] = [];
  const make = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) return;
    const mesh = new THREE.SkinnedMesh(merged, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.bind(skeleton, host.bindMatrix);
    host.parent?.add(mesh);
    out.push(mesh);
  };
  make(solid, solidMat, name);
  make(glowing, glowMaterial(glowColor), `${name}_Glow`);
  return out;
}
