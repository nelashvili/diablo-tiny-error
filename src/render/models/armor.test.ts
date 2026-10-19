import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildArmor } from './armor';

/** A tiny universal-rig skeleton (bone names and rough bind positions of the Quaternius rig). */
function rig(): { model: THREE.Group; body: THREE.SkinnedMesh; bones: Map<string, THREE.Bone> } {
  const bones = new Map<string, THREE.Bone>();
  const bone = (name: string, parent: THREE.Object3D | null, x: number, y: number, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent?.add(b);
    bones.set(name, b);
    return b;
  };
  const pelvis = bone('pelvis', null, 0, 0.95);
  const s1 = bone('spine_01', pelvis, 0, 0.12);
  const s2 = bone('spine_02', s1, 0, 0.12);
  const s3 = bone('spine_03', s2, 0, 0.12);
  const neck = bone('neck_01', s3, 0, 0.2);
  bone('Head', neck, 0, 0.08);
  for (const [s, sx] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const ua = bone(`upperarm_${s}`, s3, sx * 0.18, 0.15);
    const la = bone(`lowerarm_${s}`, ua, sx * 0.26, 0);
    const h = bone(`hand_${s}`, la, sx * 0.24, 0);
    bone(`middle_01_${s}`, h, sx * 0.1, 0);
    const th = bone(`thigh_${s}`, pelvis, sx * 0.09, -0.02);
    const ca = bone(`calf_${s}`, th, 0, -0.43);
    const ft = bone(`foot_${s}`, ca, 0, -0.45);
    bone(`ball_${s}`, ft, 0, -0.07, 0.14);
  }
  const model = new THREE.Group();
  model.add(pelvis);
  model.updateMatrixWorld(true);
  const list = [...bones.values()];
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
  const body = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  model.add(body);
  body.bind(new THREE.Skeleton(list));
  return { model, body, bones };
}

/** World positions of the armor's vertices skinned to `boneName`, in the bind pose. */
function verticesOn(mesh: THREE.SkinnedMesh, boneName: string): THREE.Vector3[] {
  const idx = mesh.skeleton.bones.findIndex((b) => b.name === boneName);
  const pos = mesh.geometry.getAttribute('position');
  const si = mesh.geometry.getAttribute('skinIndex');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    if (si.getX(i) !== idx) continue;
    out.push(
      mesh
        .applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(pos, i))
        .applyMatrix4(mesh.matrixWorld),
    );
  }
  return out;
}

describe('buildArmor', () => {
  it('builds a droid as one solid + one glowing skinned mesh on the model skeleton, hiding the body', () => {
    const { model, body } = rig();
    const meshes = buildArmor(model, { style: 'droid', color: 0xdcc690, eye: 0x4fc3ff }, true);
    expect(meshes.map((m) => m.name)).toEqual(['Armor', 'Armor_Glow']);
    for (const m of meshes) expect(m.skeleton).toBe(body.skeleton);
    expect(body.visible).toBe(false);
    // every vertex is rigidly bound to exactly one bone
    const w = meshes[0]!.geometry.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i++) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBe(1);
  });

  it('places pieces on their bones in the bind pose (head on top, feet on the ground)', () => {
    const { model, bones } = rig();
    const [armor] = buildArmor(model, { style: 'trooper', color: 0xffffff }, false);
    model.updateMatrixWorld(true);
    armor!.skeleton.update();
    const head = bones.get('Head')!.getWorldPosition(new THREE.Vector3());
    const helmet = verticesOn(armor!, 'Head');
    expect(helmet.length).toBeGreaterThan(0);
    const c = helmet.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(helmet.length);
    expect(c.distanceTo(head)).toBeLessThan(0.2);
    const feet = verticesOn(armor!, 'foot_l');
    expect(Math.min(...feet.map((v) => v.y))).toBeLessThan(0.12);
  });

  it('follows its bone when the skeleton moves', () => {
    const { model, bones } = rig();
    const [armor] = buildArmor(model, { style: 'trooper', color: 0xffffff }, false);
    model.updateMatrixWorld(true);
    armor!.skeleton.update();
    const before = verticesOn(armor!, 'lowerarm_r')[0]!.clone();
    bones.get('upperarm_r')!.rotation.z = Math.PI / 2;
    model.updateMatrixWorld(true);
    armor!.skeleton.update();
    const after = verticesOn(armor!, 'lowerarm_r')[0]!;
    expect(after.distanceTo(before)).toBeGreaterThan(0.1);
  });

  it('keeps the body visible for armor', () => {
    const { model, body } = rig();
    const meshes = buildArmor(model, { style: 'mando', color: 0x7a8a5c }, false);
    expect(body.visible).toBe(true);
    expect(meshes).toHaveLength(1);
  });
});
