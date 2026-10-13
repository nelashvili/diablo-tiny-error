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
}

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
    att.object.rotation.x =
      att.tilt !== null && (slot === 'mainHand' || slot === 'offHand') && this.rig.handTilt !== 0
        ? att.tilt
        : 0;
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
    const att = createAttachment(slot, modelId, accent, entry, this.env.assetFor(modelId));
    this.attached.set(slot, { modelId, accent, att });
    this.mount(slot, att);
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
    for (const slot of SLOTS) this.attached.get(slot)?.att.update(this.time);
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
