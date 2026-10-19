/** EntityVisual implementation: holds a swappable Rig plus attachments, tint and highlight state. */
import * as THREE from 'three';
import type { ActorMode } from '../../core/sim/entities';
import type { EntityVisual } from '../types';
import { createAttachment, type Attachment } from './attachments';
import type { AttachSlot, Rig } from './rig';
import { recolorMaterial, variantMaterial } from './toon';
import { isLitesaberId } from './helpers';
import { armorLook, headgearStyle, outfitPartOf, outfitRules, type OutfitPart } from './outfit';
import type { ArmorLookRef } from '../types';
import type { ModelEntry } from '../types';
import type { LoadedAsset } from './loader';

export interface VisualEnv {
  entryFor(id: string): ModelEntry | undefined;
  assetFor(id: string): LoadedAsset | null;
  /** Start loading a model's glTF; resolves null when it has none or it failed. */
  loadAsset?(id: string): Promise<LoadedAsset | null>;
}

/** Held weapons read better a size up on the chunky heroes. */
export const HELD_WEAPON_SCALE = 1.35;
/**
 * Ready stance on glTF rigs (Euler XYZ in the hand-slot frame): the idle clips let the hand hang,
 * which pointed blades at the floor; this raises them forward and up.
 */
export const HELD_WEAPON_POSE = new THREE.Euler(-0.4, 0, 1.0);
/**
 * Guns: the hand slot's +Y already points where the hero faces, but its +Z points sideways; a
 * quarter turn about the barrel drops the handle (attachment +Z) into the palm, pointing down.
 */
export const AIMED_WEAPON_POSE = new THREE.Euler(0, Math.PI / 2, 0);

/**
 * Gun orientation in the body frame (model faces +Z): the attachment's barrel (+Y in the hand pose)
 * points forward and its handle (+Z) points down.
 */
const AIM_LOCAL = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const AIM_Q = new THREE.Quaternion();
/**
 * Sabers while moving (body frame, model faces +Z, right hand at -X): blade trailing low behind and
 * out to the side, so the run clip's arm swing can't push it through the hood or torso.
 */
const TRAIL_MAIN = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(-0.75, -0.2, -0.65).normalize(),
);
const TRAIL_OFF = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0.75, -0.2, -0.65).normalize(),
);
/**
 * Shields (body frame): upright, facing out to the side while the hand is at the side and turning to
 * face forward as it comes across the body, held a little off the wrist, so the field neither cuts
 * through the hip and thigh nor through the chest.
 */
const BRACE_OUT = -0.05;
const BRACE_V = new THREE.Vector3();
const BRACE_S = new THREE.Vector3();
const BRACE_X = new THREE.Vector3();
const BRACE_Y = new THREE.Vector3(0, 1, 0);
const BRACE_Z = new THREE.Vector3();
const BRACE_M = new THREE.Matrix4();
const BRACE_INV = new THREE.Matrix4();
/**
 * Blades while not swinging (idle, casting, flinching, throwing): held forward and up, a little out
 * to the side. The hand-frame ready pose follows each clip's wrist, and the non-sword clips hold the
 * hand so that pose laid the blade across the hips and back.
 */
const GUARD_MAIN = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(-0.3, 0.6, 0.75).normalize(),
);
const GUARD_OFF = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0.3, 0.6, 0.75).normalize(),
);
/** Modes whose blade is posed in the body frame (the rest swing it with the hand). */
const GUARD_MODES: ReadonlySet<ActorMode> = new Set<ActorMode>([
  'idle',
  'cast',
  'throw',
  'hit',
  'stunned',
  'frozen',
]);
const BLEND_Q = new THREE.Quaternion();
const HELD_Q = new THREE.Quaternion().setFromEuler(HELD_WEAPON_POSE);
/** Seconds to blend between the ready stance and the running trail. */
const TRAIL_BLEND_SEC = 0.15;
const AIM_PARENT = new THREE.Quaternion();

interface AttachState {
  modelId: string;
  accent: number | undefined;
  att: Attachment;
}

const SLOTS: AttachSlot[] = ['mainHand', 'offHand', 'head', 'chest'];

export class Visual implements EntityVisual {
  readonly object = new THREE.Group();
  private rig: Rig;
  private mode: ActorMode = 'idle';
  private modeT = 0;
  private speedMul = 1;
  private tint: number | null = null;
  private hl: number | null = null;
  private time = 0;
  private disposed = false;
  private readonly attached = new Map<AttachSlot, AttachState>();
  private readonly outfit = new Map<OutfitPart, ArmorLookRef>();
  /** 0 = ready stance, 1 = saber trailing (walk/run). */
  private trail = 0;
  /** 0 = ready stance, 1 = blade held in the body-frame guard (idle, cast, ...). */
  private guard = 0;
  private readonly baseMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  constructor(
    private readonly env: VisualEnv,
    rig: Rig,
  ) {
    this.rig = rig;
    this.object.add(rig.root);
    this.collect();
    this.rig.setMode(this.mode, 0, 1);
    this.object.rotation.y = Math.PI / 2; // models face +Z; sim facing 0 = +X
  }

  /** Replace the body (placeholder -> loaded model) keeping state and attachments. */
  swapRig(rig: Rig): void {
    if (this.disposed) return;
    for (const [slot, a] of this.attached) this.rig.socket(slot).remove(a.att.object);
    this.object.remove(this.rig.root);
    this.rig.dispose();
    this.rig = rig;
    this.object.add(rig.root);
    this.collect();
    rig.setMode(this.mode, this.modeT, this.speedMul);
    for (const [slot, a] of this.attached) this.mount(slot, a.att, a.modelId);
    this.applyLook();
  }

  private collect(): void {
    this.baseMats.clear();
    for (const m of this.rig.bodyMeshes) if (!m.userData.noTint) this.baseMats.set(m, m.material);
  }

  /** Rigs that dress for armor wear the helm and skip the chest item (the outfit shows it). */
  private dressed(slot: AttachSlot): boolean {
    return (slot === 'head' || slot === 'chest') && this.rig.wearHeadgear !== undefined;
  }

  private wear(modelId: string | null): void {
    if (!this.rig.wearHeadgear) return;
    const base = modelId?.replace(/^item\./, '') ?? '';
    this.rig.wearHeadgear(base ? headgearStyle(base) : null, armorLook(base)?.primary ?? 0xd8d8d8);
    this.collect();
    this.applyLook();
  }

  private mount(slot: AttachSlot, att: Attachment, modelId?: string): void {
    if (this.dressed(slot)) {
      if (slot === 'head') this.wear(modelId ?? null);
      return;
    }
    const sock = this.rig.socket(slot);
    const held = att.tilt !== null && (slot === 'mainHand' || slot === 'offHand');
    if (!held) att.object.rotation.set(0, 0, 0);
    else if (this.rig.handTilt !== 0) att.object.rotation.set(att.tilt ?? 0, 0, 0);
    else att.object.rotation.copy(att.grip === 'aimed' ? AIMED_WEAPON_POSE : HELD_WEAPON_POSE);
    att.object.scale.setScalar(held ? HELD_WEAPON_SCALE : 1);
    sock.add(att.object);
  }

  setMode(mode: ActorMode, t: number, speedMul = 1): void {
    this.mode = mode;
    this.modeT = t;
    this.speedMul = speedMul;
    this.rig.setMode(mode, t, speedMul);
  }

  setFacing(rad: number): void {
    this.object.rotation.y = Math.PI / 2 - rad;
  }

  setAttachment(slot: AttachSlot, modelId: string | null, accent?: number): void {
    const prev = this.attached.get(slot);
    if (prev) {
      if (modelId !== null && prev.modelId === modelId && prev.accent === accent) return;
      this.rig.socket(slot).remove(prev.att.object);
      this.attached.delete(slot);
      if (slot === 'head' && this.dressed(slot)) this.wear(null);
    }
    if (modelId === null) return;
    const entry = this.env.entryFor(modelId);
    const asset = this.env.assetFor(modelId);
    const att = createAttachment(slot, modelId, accent, entry, asset);
    const state = { modelId, accent, att };
    this.attached.set(slot, state);
    this.mount(slot, att, modelId);
    // Show the procedural shape now; hot-swap to the glTF item model once it loads.
    if (!asset && entry?.url && this.env.loadAsset) {
      void this.env.loadAsset(modelId).then((loaded) => {
        if (!loaded || this.disposed || this.attached.get(slot) !== state) return;
        this.rig.socket(slot).remove(att.object);
        const next = createAttachment(slot, modelId, accent, entry, loaded);
        this.attached.set(slot, { modelId, accent, att: next });
        if (!this.dressed(slot)) this.mount(slot, next, modelId);
      });
    }
  }

  setHighlight(on: boolean, color = 0xffffff): void {
    const next = on ? color : null;
    if (next === this.hl) return;
    this.hl = next;
    this.applyLook();
  }

  setTint(color: number | null): void {
    if (color === this.tint) return;
    this.tint = color;
    this.applyLook();
  }

  setOutfit(part: OutfitPart, look: ArmorLookRef | null): void {
    if ((this.outfit.get(part)?.key ?? null) === (look?.key ?? null)) return;
    if (look) this.outfit.set(part, look);
    else this.outfit.delete(part);
    this.applyLook();
  }

  /** The mesh's material with its part's armor palette (from the raw, pre-hero-palette material). */
  private outfitBase(mesh: THREE.Mesh, base: THREE.Material | THREE.Material[]) {
    const part = outfitPartOf(mesh.name);
    const look = part ? this.outfit.get(part) : undefined;
    const raw = mesh.userData.rawMaterial as THREE.Material | undefined;
    if (!look || !raw || Array.isArray(base)) return base;
    const m = recolorMaterial(raw, outfitRules(look, part!), `outfit:${look.key}:${part}`);
    if (look.glow && (part === 'arms' || part === 'legs')) {
      const toon = m as THREE.MeshToonMaterial;
      if (toon.emissive && toon.emissive.getHex() === 0) toon.emissive.setHex(look.glow).multiplyScalar(0.22);
    }
    return m;
  }

  private applyLook(): void {
    for (const [mesh, rawBase] of this.baseMats) {
      const base = this.outfitBase(mesh, rawBase);
      mesh.material = Array.isArray(base)
        ? base.map((b) => variantMaterial(b, this.tint, this.hl))
        : variantMaterial(base, this.tint, this.hl);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.rig.update(dt);
    const moving = this.mode === 'walk' || this.mode === 'run';
    const step = dt / TRAIL_BLEND_SEC;
    this.trail = Math.min(1, Math.max(0, this.trail + (moving ? step : -step)));
    const guarding = GUARD_MODES.has(this.mode);
    this.guard = Math.min(1, Math.max(0, this.guard + (guarding ? step : -step)));
    for (const slot of SLOTS) {
      const a = this.attached.get(slot);
      if (!a) continue;
      const hand = (slot === 'mainHand' || slot === 'offHand') && this.rig.handTilt === 0;
      if (hand && a.att.shield) this.brace(slot, a.att);
      else if (hand && a.att.grip === 'aimed') this.aim(slot, a.att);
      else if (hand && (isLitesaberId(a.modelId) || a.att.tilt !== null)) this.trailSaber(slot, a.att);
      a.att.update(this.time);
    }
  }

  /** Hold a shield out from the body (see BRACE_*). */
  private brace(slot: AttachSlot, att: Attachment): void {
    const sock = this.rig.socket(slot);
    sock.updateWorldMatrix(true, false);
    this.object.updateWorldMatrix(true, false);
    const side = slot === 'offHand' ? 1 : -1;
    // Hand position in the body frame: how far out to its own side it is.
    BRACE_V.setFromMatrixPosition(sock.matrixWorld).applyMatrix4(
      BRACE_INV.copy(this.object.matrixWorld).invert(),
    );
    const out = THREE.MathUtils.smoothstep(BRACE_V.x * side, 0.05, 0.22);
    BRACE_Z.set(0.85 * side * out, 0, 0.5 + 0.5 * (1 - out)).normalize();
    BRACE_X.crossVectors(BRACE_Y, BRACE_Z);
    BRACE_M.makeBasis(BRACE_X, BRACE_Y, BRACE_Z);
    this.object.getWorldQuaternion(AIM_Q);
    sock.getWorldQuaternion(AIM_PARENT).invert();
    // Offset along the facing, expressed in the socket's (scaled) frame.
    BRACE_V.copy(BRACE_Z).multiplyScalar(BRACE_OUT).applyQuaternion(AIM_Q).applyQuaternion(AIM_PARENT);
    sock.getWorldScale(BRACE_S);
    att.object.position.copy(BRACE_V.divide(BRACE_S));
    att.object.quaternion.copy(AIM_PARENT).multiply(AIM_Q.multiply(BLEND_Q.setFromRotationMatrix(BRACE_M)));
  }

  /**
   * Blend a held blade between its ready pose (hand frame), the running trail and the standing guard
   * (both body frame), so rigid blades don't cut through the body in clips made for empty hands.
   */
  private trailSaber(slot: AttachSlot, att: Attachment): void {
    if (this.trail <= 0 && this.guard <= 0) {
      att.object.quaternion.copy(HELD_Q);
      return;
    }
    const sock = this.rig.socket(slot);
    sock.updateWorldMatrix(true, false);
    sock.getWorldQuaternion(AIM_PARENT).invert();
    const off = slot === 'offHand';
    const smooth = (w: number) => w * w * (3 - 2 * w);
    const q = att.object.quaternion.copy(HELD_Q);
    if (this.trail > 0) {
      this.object.getWorldQuaternion(AIM_Q).multiply(off ? TRAIL_OFF : TRAIL_MAIN);
      q.slerp(BLEND_Q.copy(AIM_PARENT).multiply(AIM_Q), smooth(this.trail));
    }
    if (this.guard > 0) {
      this.object.getWorldQuaternion(AIM_Q).multiply(off ? GUARD_OFF : GUARD_MAIN);
      q.slerp(BLEND_Q.copy(AIM_PARENT).multiply(AIM_Q), smooth(this.guard));
    }
  }

  /**
   * Keep guns level and pointed where the hero faces: the clips (built for crossbows) swing the
   * hand up and down, so the hand only moves the gun and never turns it.
   */
  private aim(slot: AttachSlot, att: Attachment): void {
    const sock = this.rig.socket(slot);
    sock.updateWorldMatrix(true, false);
    this.object.getWorldQuaternion(AIM_Q);
    AIM_Q.multiply(AIM_LOCAL);
    sock.getWorldQuaternion(AIM_PARENT).invert();
    att.object.quaternion.copy(AIM_PARENT.multiply(AIM_Q));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [slot, a] of this.attached) this.rig.socket(slot).remove(a.att.object);
    this.attached.clear();
    this.object.remove(this.rig.root);
    this.object.removeFromParent();
    this.rig.dispose();
  }
}
