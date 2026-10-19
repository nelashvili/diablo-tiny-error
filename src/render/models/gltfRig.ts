/** Rig for a loaded glTF model: AnimationMixer with crossfaded clips mapped from ActorMode. */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorMode } from '../../core/sim/entities';
import type { ModelEntry } from '../types';
import { ALL_MODES, computePose, makePose, modeLoops, resolveClip } from './helpers';
import type { LoadedAsset } from './loader';
import type { AttachSlot, Rig } from './rig';
import { enableRim, recolorMaterial } from './toon';
import { replaceHelmet } from './headgear';
import { buildArmor } from './armor';

const FADE = 0.15;

const KAY_HAND_PER_HEIGHT = 0.46;

/** Bone whose translation track the shared animation library keeps (hips bob, falls, crouches). */
const PELVIS = 'pelvis';
const libClips = new WeakMap<LoadedAsset, WeakMap<LoadedAsset, THREE.AnimationClip[]>>();

/**
 * The animation library's clips fitted to one model: pelvis positions were keyed on the library's
 * mannequin, so they are shifted by the difference in rest pose (keeps feet on the ground for taller
 * or shorter bodies). Cached per (library, model) pair.
 */
export function clipsForModel(lib: LoadedAsset, model: LoadedAsset): THREE.AnimationClip[] {
  let per = libClips.get(lib);
  if (!per) {
    per = new WeakMap();
    libClips.set(lib, per);
  }
  let clips = per.get(model);
  if (clips) return clips;
  const libPelvis = lib.scene.getObjectByName(PELVIS);
  const modelPelvis = model.scene.getObjectByName(PELVIS);
  const track = `${PELVIS}.position`;
  if (!libPelvis || !modelPelvis) clips = lib.animations;
  else {
    const d = modelPelvis.position.clone().sub(libPelvis.position);
    clips = lib.animations.map((clip) => {
      const i = clip.tracks.findIndex((t) => t.name === track);
      if (i < 0 || d.lengthSq() < 1e-10) return clip;
      const c = clip.clone();
      const t = c.tracks[i]!;
      const v = t.values.slice();
      for (let k = 0; k < v.length; k += 3) {
        v[k] = v[k]! + d.x;
        v[k + 1] = v[k + 1]! + d.y;
        v[k + 2] = v[k + 2]! + d.z;
      }
      c.tracks[i] = new THREE.VectorKeyframeTrack(t.name, t.times, v);
      return c;
    });
  }
  per.set(model, clips);
  return clips;
}

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

  /** `anims`: the shared animation library when the entry names one (its clips replace the model's). */
  constructor(asset: LoadedAsset, entry: ModelEntry, anims: LoadedAsset | null = null) {
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
    if (entry.armor) {
      const parts = buildArmor(this.model, entry.armor, entry.armor.hideBody ?? false);
      this.bodyMeshes.push(...parts.filter((m) => m.name !== 'Armor_Glow'));
    }
    // Actors get the rim light (outfit recolors start from rawMaterial, so mark that too).
    for (const mesh of this.bodyMeshes) {
      for (const m of [mesh.material, mesh.userData.rawMaterial as THREE.Material | undefined].flat())
        if (m) enableRim(m);
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    const byClip = new Map<string, THREE.AnimationAction>();
    const clips = anims ? clipsForModel(anims, asset) : asset.animations;
    const clipNames = anims ? anims.clipNames : asset.clipNames;
    for (const mode of ALL_MODES) {
      const name = resolveClip(mode, clipNames, entry.clips);
      if (name === null) {
        this.actions.set(mode, null);
        continue;
      }
      let a = byClip.get(name);
      if (!a) {
        const clip = clips.find((c) => c.name === name);
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
    // Held items are sized for KayKit hands (bone scale ~= entry.scale). Rigs exported at another
    // unit scale (the robot's bones are in centimetres) get a child socket that cancels the difference.
    this.root.updateMatrixWorld(true);
    const rootScale = new THREE.Vector3();
    this.root.getWorldScale(rootScale);
    const grip = (bone: THREE.Object3D, g: NonNullable<ModelEntry['handGrip']>['right'], scale = 1) => {
      const s = new THREE.Object3D();
      s.position.set(...g.pos);
      s.quaternion.set(...g.quat);
      s.scale.setScalar(scale);
      bone.add(s);
      return s;
    };
    const hand = (n: string | undefined, side: 'right' | 'left'): THREE.Object3D | null => {
      const bone = find(n);
      if (!bone) return null;
      if (entry.handGrip) return grip(bone, entry.handGrip[side], entry.handGrip.scale);
      const ws = new THREE.Vector3();
      bone.getWorldScale(ws);
      const rel = ws.x / (rootScale.x || 1);
      // KayKit hands sit at ~0.46x the body height (0.74 scale on a 1.6-tile body).
      const fix = rel > 0 ? (KAY_HAND_PER_HEIGHT * h) / rel : 1;
      if (fix > 0.5 && fix < 2) return bone;
      const s = new THREE.Object3D();
      s.scale.setScalar(fix);
      bone.add(s);
      return s;
    };
    this.sockets = {
      mainHand: hand(entry.bones?.rightHand, 'right') ?? mkSock(this.root, h * 0.5),
      offHand: hand(entry.bones?.leftHand, 'left') ?? mkSock(this.root, h * 0.5),
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
