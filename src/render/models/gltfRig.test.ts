import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GltfRig, clipSpec, clipsForModel, mirrorClip, nextVariant } from './gltfRig';
import type { LoadedAsset } from './loader';
import type { ModelEntry } from '../types';

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

describe('attack and hit variants', () => {
  const track = (v: number) => [new THREE.NumberKeyframeTrack('bone.position[x]', [0, 0.5, 1], [0, v, 0])];
  const anim = asset(0.9, [
    new THREE.AnimationClip('Idle', 1, track(0)),
    new THREE.AnimationClip('Swing', 0.5, track(1)),
    new THREE.AnimationClip('Combo', 2, track(2)),
    new THREE.AnimationClip('Hurt', 0.4, track(3)),
  ]);
  anim.scene.add(Object.assign(new THREE.Object3D(), { name: 'bone' }));
  const entry: ModelEntry = {
    id: 'hero.test',
    url: 'x.glb',
    scale: 1,
    clips: { idle: 'Idle', attack: 'Swing', 'attack.2': 'Combo@0.5-1.25', 'attack.3': 'Swing', hit: 'Hurt' },
    placeholder: { shape: 'capsule', color: 0, height: 1, radius: 0.3 },
  };
  const playing = (rig: GltfRig) =>
    (rig as unknown as { current: THREE.AnimationAction | null }).current?.getClip();

  it('parses clip slices', () => {
    expect(clipSpec('Swing')).toEqual({ name: 'Swing', from: 0, to: Infinity });
    expect(clipSpec('Sword_Attack@0.3-1.1')).toEqual({ name: 'Sword_Attack', from: 0.3, to: 1.1 });
  });

  it('never picks the same variant twice in a row', () => {
    let seed = 0.37;
    const rnd = () => (seed = (seed * 9301 + 0.49297) % 1);
    let prev = nextVariant(-1, 3, rnd);
    for (let i = 0; i < 50; i++) {
      const next = nextVariant(prev, 3, rnd);
      expect(next).not.toBe(prev);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(3);
      prev = next;
    }
    expect(nextVariant(0, 1, rnd)).toBe(0);
  });

  it('alternates swings between the main clip and the sliced one (duplicates dropped)', () => {
    const rig = new GltfRig(anim, entry);
    const seen = new Set<string>();
    let last = '';
    for (let i = 0; i < 6; i++) {
      rig.setMode('attack', 0, 1);
      const clip = playing(rig)!;
      expect(clip.name).not.toBe(last);
      last = clip.name;
      seen.add(clip.name);
    }
    expect(seen).toEqual(new Set(['Swing', 'Combo@0.5-1.25']));
  });

  it('replays a one-shot clip from the top; a single hit clip stays the same', () => {
    const rig = new GltfRig(anim, entry);
    rig.setMode('idle', 0, 1);
    const idle = (rig as unknown as { current: THREE.AnimationAction }).current;
    rig.setMode('idle', 0.4, 1);
    expect((rig as unknown as { current: THREE.AnimationAction }).current).toBe(idle);
    rig.setMode('hit', 0, 1);
    expect(playing(rig)?.name).toBe('Hurt');
    rig.setMode('hit', 0, 1);
    expect(playing(rig)?.name).toBe('Hurt');
  });
});

describe('mirrorClip', () => {
  it('swaps left/right tracks and reflects transforms across x', () => {
    const clip = new THREE.AnimationClip('Swing', 1, [
      new THREE.QuaternionKeyframeTrack('upperarm_r.quaternion', [0], [0.1, 0.2, 0.3, 0.9]),
      new THREE.VectorKeyframeTrack('pelvis.position', [0], [0.5, 1, 2]),
      new THREE.QuaternionKeyframeTrack('index_04_leaf_l.quaternion', [0], [0, 0, 0, 1]),
    ]);
    const m = mirrorClip(clip);
    expect(m.tracks.map((t) => t.name)).toEqual([
      'upperarm_l.quaternion',
      'pelvis.position',
      'index_04_leaf_r.quaternion',
    ]);
    expect(Array.from(m.tracks[0]!.values)).toEqual([0.1, -0.2, -0.3, 0.9].map(Math.fround));
    expect(Array.from(m.tracks[1]!.values)).toEqual([-0.5, 1, 2]);
    expect(m.tracks[0]).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
    expect(mirrorClip(clip)).toBe(m);
  });
});
