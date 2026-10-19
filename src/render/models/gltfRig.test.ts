import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clipsForModel } from './gltfRig';
import type { LoadedAsset } from './loader';

function asset(pelvisY: number, animations: THREE.AnimationClip[] = []): LoadedAsset {
  const scene = new THREE.Group();
  const pelvis = new THREE.Object3D();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.04, pelvisY);
  scene.add(pelvis);
  return { scene, animations, clipNames: animations.map((a) => a.name), height: 1.8 };
}

describe('clipsForModel', () => {
  const lib = asset(0.917, [
    new THREE.AnimationClip('Walk_Loop', 1, [
      new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 0.04, 0.917, 0, 0.06, 0.9]),
      new THREE.QuaternionKeyframeTrack('Head.quaternion', [0], [0, 0, 0, 1]),
    ]),
    new THREE.AnimationClip('Wave', 1, [
      new THREE.QuaternionKeyframeTrack('Head.quaternion', [0], [0, 0, 0, 1]),
    ]),
  ]);

  it("shifts the library's pelvis keys by the model's rest-pose difference", () => {
    const clips = clipsForModel(lib, asset(0.949));
    const v = clips[0]!.tracks[0]!.values;
    expect(v[2]).toBeCloseTo(0.949, 6);
    expect(v[5]).toBeCloseTo(0.932, 6);
    expect(v[4]).toBeCloseTo(0.06, 6);
    // the library itself is untouched
    expect(lib.animations[0]!.tracks[0]!.values[2]).toBeCloseTo(0.917, 6);
  });

  it('reuses clips without a pelvis track and caches per model', () => {
    const model = asset(0.949);
    const a = clipsForModel(lib, model);
    expect(a[1]).toBe(lib.animations[1]);
    expect(clipsForModel(lib, model)).toBe(a);
  });

  it('passes the clips through when the model matches the library', () => {
    const clips = clipsForModel(lib, asset(0.917));
    expect(clips[0]).toBe(lib.animations[0]);
  });
});
