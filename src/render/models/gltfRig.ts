/** Rig for a loaded glTF model: AnimationMixer with crossfaded clips mapped from ActorMode. */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorMode } from '../../core/sim/entities';
import type { ModelEntry } from '../types';
import { ALL_MODES, computePose, makePose, modeLoops, resolveClip } from './helpers';
import type { LoadedAsset } from './loader';
import type { AttachSlot, Rig } from './rig';
import { recolorMaterial } from './toon';
import { replaceHelmet } from './headgear';

const FADE = 0.15;

export class GltfRig implements Rig {
  readonly root = new THREE.Group();
  readonly bodyMeshes: THREE.Mesh[] = [];
  readonly handTilt = 0;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ActorMode, THREE.AnimationAction | null>();
  private current: THREE.AnimationAction | null = null;
  private currentMode: ActorMode | null = null;
  private readonly pose = makePose();
  private readonly model: THREE.Object3D;
  private readonly procedural: boolean;
  private readonly sockets: Record<AttachSlot, THREE.Object3D>;

  constructor(asset: LoadedAsset, entry: ModelEntry) {
    this.model = SkeletonUtils.clone(asset.scene);
    this.model.scale.multiplyScalar(entry.scale);
    this.root.add(this.model);
    const hidden = new Set((entry.hide ?? []).map((n) => THREE.PropertyBinding.sanitizeNodeName(n)));
    this.model.traverse((o) => {
      if (hidden.has(THREE.PropertyBinding.sanitizeNodeName(o.name))) o.visible = false;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.userData.rawMaterial = mesh.material; // pre-palette material, for armor outfits
      if (entry.recolor?.length && !Array.isArray(mesh.material))
        mesh.material = recolorMaterial(mesh.material, entry.recolor, entry.id);
      this.bodyMeshes.push(mesh);
    });
    const hp = entry.helmet;
    const oldHelm = hp && this.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(hp.replace));
    const headBone = entry.bones?.head && this.model.getObjectByName(entry.bones.head);
    if (hp && oldHelm && headBone)
      this.bodyMeshes.push(...replaceHelmet(this.model, oldHelm, headBone, hp.style, hp.color));
    this.mixer = new THREE.AnimationMixer(this.model);
    const byClip = new Map<string, THREE.AnimationAction>();
    for (const mode of ALL_MODES) {
      const name = resolveClip(mode, asset.clipNames, entry.clips);
      if (name === null) {
        this.actions.set(mode, null);
        continue;
      }
      let a = byClip.get(name);
      if (!a) {
        const clip = asset.animations.find((c) => c.name === name);
        a = clip ? this.mixer.clipAction(clip) : undefined;
        if (a) byClip.set(name, a);
      }
      this.actions.set(mode, a ?? null);
    }
    this.procedural = byClip.size === 0;
    for (const [name, sc] of Object.entries(entry.boneScale ?? {})) {
      const bone = this.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      if (bone) this.scaledBones.push([bone, new THREE.Vector3(...sc)]);
    }

    const h = asset.height * entry.scale;
    // GLTFLoader sanitizes node names ('handslot.r' -> 'handslotr'), so try both spellings.
    const find = (n?: string) =>
      n
        ? (this.model.getObjectByName(n) ??
          this.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)) ??
          null)
        : null;
    const mkSock = (parent: THREE.Object3D, y: number) => {
      const s = new THREE.Object3D();
      s.position.y = y;
      parent.add(s);
      return s;
    };
    this.sockets = {
      mainHand: find(entry.bones?.rightHand) ?? mkSock(this.root, h * 0.5),
      offHand: find(entry.bones?.leftHand) ?? mkSock(this.root, h * 0.5),
      head: find(entry.bones?.head) ?? mkSock(this.root, h),
      chest: mkSock(this.root, h * 0.65),
    };
  }

  setMode(mode: ActorMode, t: number, speedMul: number): void {
    const sp = speedMul > 0 ? speedMul : 1;
    if (this.procedural) {
      const p = computePose(mode, t, sp, this.pose);
      this.model.position.y = p.bob - p.sink;
      this.root.rotation.x = p.lean;
      this.root.rotation.z = p.roll;
      this.root.scale.setScalar(p.scale);
      return;
    }
    const next = this.actions.get(mode) ?? null;
    if (mode !== this.currentMode || next !== this.current) {
      const loops = modeLoops(mode);
      if (next) {
        next.reset();
        next.setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        next.clampWhenFinished = !loops;
        next.enabled = true;
        const dur = next.getClip().duration;
        next.time = loops ? t % dur : Math.min(mode === 'dead' ? dur : t, dur);
        if (this.current && this.current !== next) {
          next.fadeIn(t > 0.05 ? 0 : FADE);
          this.current.fadeOut(FADE);
        }
        next.play();
      } else if (this.current) {
        this.current.fadeOut(FADE);
      }
      this.current = next;
      this.currentMode = mode;
    }
    if (this.current) this.current.timeScale = mode === 'frozen' ? 0 : sp;
  }

  update(dt: number): void {
    if (!this.procedural) this.mixer.update(dt);
    for (const [bone, sc] of this.scaledBones) bone.scale.copy(sc);
  }

  private readonly scaledBones: [THREE.Object3D, THREE.Vector3][] = [];

  socket(slot: AttachSlot): THREE.Object3D {
    return this.sockets[slot];
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
