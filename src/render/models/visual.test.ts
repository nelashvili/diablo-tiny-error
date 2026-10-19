import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Visual } from './visual';
import type { AttachSlot, Rig } from './rig';

function rig(dresses: boolean) {
  const sockets: Record<AttachSlot, THREE.Object3D> = {
    mainHand: new THREE.Object3D(),
    offHand: new THREE.Object3D(),
    head: new THREE.Object3D(),
    chest: new THREE.Object3D(),
  };
  const root = new THREE.Group();
  for (const s of Object.values(sockets)) root.add(s);
  const wearHeadgear = vi.fn();
  const r: Rig = {
    root,
    bodyMeshes: [],
    handTilt: 0,
    setMode() {},
    update() {},
    socket: (slot) => sockets[slot],
    dispose() {},
    ...(dresses ? { wearHeadgear } : {}),
  };
  return { r, sockets, wearHeadgear };
}

const env = { entryFor: () => undefined, assetFor: () => null };

describe('Visual armor items', () => {
  it('wears helms and skips chest items on rigs that dress for armor', () => {
    const { r, sockets, wearHeadgear } = rig(true);
    const v = new Visual(env, r);
    v.setAttachment('head', 'item.trooperHelm');
    v.setAttachment('chest', 'item.trooperArmor');
    expect(sockets.head.children).toHaveLength(0);
    expect(sockets.chest.children).toHaveLength(0);
    expect(wearHeadgear).toHaveBeenLastCalledWith('trooper', expect.any(Number));
    v.setAttachment('head', null);
    expect(wearHeadgear).toHaveBeenLastCalledWith(null, expect.any(Number));
  });

  it('still socket-mounts helm and chest items on other rigs', () => {
    const { r, sockets } = rig(false);
    const v = new Visual(env, r);
    v.setAttachment('head', 'item.trooperHelm');
    v.setAttachment('chest', 'item.trooperArmor');
    expect(sockets.head.children).toHaveLength(1);
    expect(sockets.chest.children).toHaveLength(1);
  });

  it('holds a saber clear of the body while idle: blade points forward and up', () => {
    const { r, sockets } = rig(false);
    const v = new Visual(env, r);
    // A hand frame that would point the ready pose's blade sideways across the hips.
    sockets.mainHand.rotation.set(0, 0, Math.PI / 2);
    v.setAttachment('mainHand', 'item.blueLitesaber', 0x4fc3ff);
    v.setMode('idle', 0);
    for (let i = 0; i < 30; i++) v.update(1 / 60);
    const att = sockets.mainHand.children[0]!;
    v.object.updateMatrixWorld(true);
    const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(att.getWorldQuaternion(new THREE.Quaternion()));
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
      v.object.getWorldQuaternion(new THREE.Quaternion()),
    );
    expect(blade.dot(fwd)).toBeGreaterThan(0.5);
    expect(blade.y).toBeGreaterThan(0.4);
  });
});
