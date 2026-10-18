/** EntityVisual implementation: holds a swappable Rig plus attachments, tint and highlight state. */
import * as THREE from 'three';
import type { ActorMode } from '../../core/sim/entities';
import type { EntityVisual } from '../types';
import { createAttachment, type Attachment } from './attachments';
import type { AttachSlot, Rig } from './rig';
import { variantMaterial } from './toon';
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
    for (const [slot, a] of this.attached) this.mount(slot, a.att);
    this.applyLook();
  }

  private collect(): void {
    this.baseMats.clear();
    for (const m of this.rig.bodyMeshes) if (!m.userData.noTint) this.baseMats.set(m, m.material);
  }

  private mount(slot: AttachSlot, att: Attachment): void {
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
    }
    if (modelId === null) return;
    const entry = this.env.entryFor(modelId);
    const asset = this.env.assetFor(modelId);
    const att = createAttachment(slot, modelId, accent, entry, asset);
    const state = { modelId, accent, att };
    this.attached.set(slot, state);
    this.mount(slot, att);
    // Show the procedural shape now; hot-swap to the glTF item model once it loads.
    if (!asset && entry?.url && this.env.loadAsset) {
      void this.env.loadAsset(modelId).then((loaded) => {
        if (!loaded || this.disposed || this.attached.get(slot) !== state) return;
        this.rig.socket(slot).remove(att.object);
        const next = createAttachment(slot, modelId, accent, entry, loaded);
        this.attached.set(slot, { modelId, accent, att: next });
        this.mount(slot, next);
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

  private applyLook(): void {
    for (const [mesh, base] of this.baseMats) {
      mesh.material = Array.isArray(base)
        ? base.map((b) => variantMaterial(b, this.tint, this.hl))
        : variantMaterial(base, this.tint, this.hl);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.rig.update(dt);
    for (const slot of SLOTS) {
      const a = this.attached.get(slot);
      if (!a) continue;
      if (a.att.grip === 'aimed' && this.rig.handTilt === 0 && (slot === 'mainHand' || slot === 'offHand'))
        this.aim(slot, a.att);
      a.att.update(this.time);
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
