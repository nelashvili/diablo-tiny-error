import * as THREE from 'three';
import type { EntityId } from '../../core/types';
import type { WorldView } from '../../core/sim/world';
import type { Entity, EntityKind } from '../../core/sim/entities';
import type { EntityVisual, VfxSystem, VisualFactory } from '../types';
import { DB } from '../../data/db';
import { MotionBuffer, type MotionSample } from './interp';
import { distSqToSegment } from '../camera/isoMath';
import type { IsoCamera } from '../camera/isoCamera';
import { rectContains, type GroundRect } from '../culling/viewRect';

const TINT_NONE = -1;
const TINT_FROZEN = 0x66ccff;
const TINT_TOXIN = 0x66dd44;
const TINT_BURN = 0xff7a30;
const TINT_CHAMPION = 0x7a8cff;
const TINT_UNIQUE = 0xffd24a;

export const QUALITY_COLORS: Record<string, number> = {
  magic: 0x6a8cff,
  rare: 0xffe14a,
  set: 0x3dff6a,
  unique: 0xffa826,
  crafted: 0xff9040,
};

const PICK_PRIORITY: Partial<Record<EntityKind, number>> = {
  monster: 4,
  groundItem: 3,
  npc: 2,
  object: 1,
};

interface Rec {
  id: EntityId;
  kind: EntityKind;
  root: THREE.Group;
  visual: EntityVisual | null;
  motion: MotionBuffer;
  seen: number;
  mode: string;
  modeTime: number;
  tint: number;
  highlighted: boolean;
  handle: { stop(): void } | null;
  equip0: string;
  equip1: string;
  equip2: string;
  equip3: string;
  x: number;
  z: number;
  pickR: number;
  pickH: number;
  pickable: boolean;
  alwaysVisible: boolean;
}

/** Shared tiny resources for beams / glows (created lazily, disposed with the sync). */
class Shared {
  beamGeo = new THREE.CylinderGeometry(0.06, 0.16, 6, 8, 1, true);
  glowGeo = new THREE.SphereGeometry(0.22, 10, 8);
  private mats = new Map<number, THREE.MeshBasicMaterial>();
  mat(color: number, opacity: number): THREE.MeshBasicMaterial {
    const key = color * 16 + Math.round(opacity * 10);
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.mats.set(key, m);
    }
    return m;
  }
  dispose(): void {
    this.beamGeo.dispose();
    this.glowGeo.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

const sample: MotionSample = { x: 0, y: 0, facing: 0 };

export class EntitySync {
  private readonly records = new Map<EntityId, Rec>();
  private readonly shared = new Shared();
  private frame = 0;
  private readonly missileVfx = new Map<string, string>();
  hovered: EntityId | null = null;
  /** Entities with a live visual this frame (stats). */
  count = 0;
  drawn = 0;

  constructor(
    readonly root: THREE.Group,
    private readonly visuals: VisualFactory,
    private readonly vfx: VfxSystem,
  ) {}

  /** Interpolated world position of an entity, if known. */
  positionOf(id: EntityId, out: { x: number; z: number }): boolean {
    const r = this.records.get(id);
    if (!r) return false;
    out.x = r.x;
    out.z = r.z;
    return true;
  }

  clear(): void {
    for (const r of this.records.values()) this.destroy(r);
    this.records.clear();
  }

  dispose(): void {
    this.clear();
    this.shared.dispose();
  }

  private destroy(r: Rec): void {
    r.handle?.stop();
    r.visual?.dispose();
    r.root.removeFromParent();
  }

  private modelFor(e: Entity): string | null {
    switch (e.kind) {
      case 'player':
      case 'monster':
      case 'merc':
      case 'npc':
        return e.modelId;
      case 'object':
        return `obj.${e.defId}`;
      case 'groundItem':
        return e.creditz ? 'item.creditz' : `item.${e.item.base}`;
      default:
        return null;
    }
  }

  private create(e: Readonly<Entity>, localId: EntityId | null): Rec {
    const root = new THREE.Group();
    root.name = `${e.kind}#${e.id}`;
    const model = this.modelFor(e as Entity);
    let visual: EntityVisual | null = null;
    let handle: { stop(): void } | null = null;
    let pickH = 1.5;
    let pickable = false;
    const actor = e.kind === 'player' || e.kind === 'monster' || e.kind === 'merc' || e.kind === 'npc';
    if (model) {
      visual = this.visuals.create(model);
      root.add(visual.object);
      if (actor || e.kind === 'object') {
        visual.object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
      }
    }
    switch (e.kind) {
      case 'monster':
        pickH = Math.max(1.4, e.radius * 3.5);
        pickable = true;
        break;
      case 'npc':
        pickH = 1.7;
        pickable = true;
        break;
      case 'object':
        pickH = 1.2;
        pickable = true;
        break;
      case 'groundItem': {
        pickH = 0.5;
        pickable = true;
        const qc = QUALITY_COLORS[e.item.quality];
        if (qc !== undefined) {
          const glow = new THREE.Mesh(this.shared.glowGeo, this.shared.mat(qc, 0.45));
          glow.position.y = 0.12;
          glow.scale.set(1.2, 0.5, 1.2);
          root.add(glow);
          if (e.item.quality === 'unique' || e.item.quality === 'set') {
            const beam = new THREE.Mesh(this.shared.beamGeo, this.shared.mat(qc, 0.28));
            beam.position.y = 3;
            root.add(beam);
          }
        }
        break;
      }
      case 'remnant': {
        const c = e.droyd ? 0xff9a3c : 0xa070ff;
        const glow = new THREE.Mesh(this.shared.glowGeo, this.shared.mat(c, 0.35));
        glow.position.y = 0.15;
        glow.scale.set(1.5, 0.7, 1.5);
        root.add(glow);
        break;
      }
      case 'missile': {
        let id = this.missileVfx.get(e.defId);
        if (id === undefined) {
          id = DB.missiles.get(e.defId)?.vfx ?? `vfx.${e.defId}`;
          this.missileVfx.set(e.defId, id);
        }
        root.position.y = 0.9;
        handle = this.vfx.attach(id, root, { radius: e.radius });
        break;
      }
      case 'area':
        handle = this.vfx.attach(e.vfx, root, { radius: e.radius });
        break;
      default:
        break;
    }
    this.root.add(root);
    return {
      id: e.id,
      kind: e.kind,
      root,
      visual,
      motion: new MotionBuffer(),
      seen: this.frame,
      mode: '',
      modeTime: 0,
      tint: TINT_NONE,
      highlighted: false,
      handle,
      equip0: '',
      equip1: '',
      equip2: '',
      equip3: '',
      x: 0,
      z: 0,
      pickR: Math.max(0.5, e.radius + 0.2),
      pickH,
      pickable,
      alwaysVisible: e.id === localId || e.kind === 'missile' || e.kind === 'area',
    };
  }

  sync(view: WorldView, alpha: number, dt: number, rect: GroundRect): void {
    this.frame++;
    const frame = this.frame;
    const localId = view.localPlayerId;
    const tick = view.tick;
    let drawn = 0;
    for (const e of view.all()) {
      let r = this.records.get(e.id);
      if (!r) {
        r = this.create(e, localId);
        this.records.set(e.id, r);
      }
      r.seen = frame;
      r.motion.push(tick, e.pos.x, e.pos.y, e.facing);
      r.motion.sample(alpha, sample);
      r.x = sample.x;
      r.z = sample.y;
      const near = r.alwaysVisible || rectContains(rect, r.x, r.z);
      r.root.visible = near;
      if (!near) continue;
      r.root.position.x = sample.x;
      r.root.position.z = sample.y;
      if (e.kind !== 'missile') r.root.position.y = e.kind === 'groundItem' ? 0.05 : 0;
      drawn++;
      const v = r.visual;
      switch (e.kind) {
        case 'player':
        case 'monster':
        case 'merc':
        case 'npc': {
          if (!v) break;
          if (e.mode === 'dead') {
            r.root.visible = false;
            break;
          }
          v.setFacing(sample.facing);
          if (e.mode !== r.mode || e.modeTime < r.modeTime) {
            const mul =
              e.mode === 'attack'
                ? e.stats.attackSpeedMul
                : e.mode === 'cast' || e.mode === 'throw'
                  ? e.stats.castSpeedMul
                  : 1;
            v.setMode(e.mode, e.modeTime, mul);
            r.mode = e.mode;
          }
          r.modeTime = e.modeTime;
          this.applyTint(r, v, e);
          if (e.kind === 'player' || e.kind === 'merc') this.applyEquipment(r, v, e.equipment);
          break;
        }
        case 'object':
        case 'groundItem':
          v?.setFacing(sample.facing);
          break;
        default:
          break;
      }
      if (v) {
        const hl = this.hovered === e.id;
        if (hl !== r.highlighted) {
          r.highlighted = hl;
          v.setHighlight(hl, e.kind === 'monster' ? 0xff4a3a : e.kind === 'groundItem' ? 0xffffff : 0xffe070);
        }
        v.update(dt);
      }
    }
    // Sweep records of vanished entities.
    let count = 0;
    for (const [id, r] of this.records) {
      if (r.seen !== frame) {
        this.destroy(r);
        this.records.delete(id);
      } else count++;
    }
    this.count = count;
    this.drawn = drawn;
  }

  private applyTint(r: Rec, v: EntityVisual, e: Readonly<Entity>): void {
    if (e.kind !== 'player' && e.kind !== 'monster' && e.kind !== 'merc' && e.kind !== 'npc') return;
    let tint = TINT_NONE;
    if (e.mode === 'frozen') tint = TINT_FROZEN;
    const fx = e.effects;
    for (let i = 0; i < fx.length; i++) {
      const k = fx[i]?.spec.kind;
      if (k === 'freeze' || k === 'chill') {
        tint = TINT_FROZEN;
        break;
      }
      if (k === 'toxin' && tint === TINT_NONE) tint = TINT_TOXIN;
      else if (k === 'burn' && tint === TINT_NONE) tint = TINT_BURN;
    }
    if (tint === TINT_NONE && e.kind === 'monster') {
      if (e.rank === 'champion') tint = TINT_CHAMPION;
      else if (e.rank === 'unique' || e.rank === 'boss') tint = TINT_UNIQUE;
    }
    if (tint !== r.tint) {
      r.tint = tint;
      v.setTint(tint === TINT_NONE ? null : tint);
    }
  }

  private applyEquipment(r: Rec, v: EntityVisual, eq: Readonly<Record<string, { base: string }>>): void {
    const m = eq['mainHand']?.base ?? '';
    const o = eq['offHand']?.base ?? '';
    const h = eq['head']?.base ?? '';
    const c = eq['chest']?.base ?? '';
    if (m !== r.equip0) {
      r.equip0 = m;
      v.setAttachment('mainHand', m ? `item.${m}` : null);
    }
    if (o !== r.equip1) {
      r.equip1 = o;
      v.setAttachment('offHand', o ? `item.${o}` : null);
    }
    if (h !== r.equip2) {
      r.equip2 = h;
      v.setAttachment('head', h ? `item.${h}` : null);
    }
    if (c !== r.equip3) {
      r.equip3 = c;
      v.setAttachment('chest', c ? `item.${c}` : null);
    }
  }

  /** Topmost pickable entity near the pointer. Priority monsters > items > npcs > objects. */
  pick(px: number, py: number, cam: IsoCamera, touch: boolean): EntityId | null {
    const ppu = cam.pxPerUnit;
    const minPx = touch ? 30 : 16;
    let bestId: EntityId | null = null;
    let bestPrio = -1;
    let bestD = Infinity;
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    for (const r of this.records.values()) {
      if (!r.pickable || !r.root.visible) continue;
      const prio = PICK_PRIORITY[r.kind] ?? 0;
      if (prio < bestPrio) continue;
      if (r.kind === 'monster' && r.mode === 'dying') continue;
      cam.worldToScreen(r.x, 0, r.z, a);
      cam.worldToScreen(r.x, r.pickH, r.z, b);
      const rad = Math.max(minPx, r.pickR * ppu * (touch ? 1.4 : 1));
      const d = distSqToSegment(px, py, a.x, a.y, b.x, b.y);
      if (d > rad * rad) continue;
      if (prio > bestPrio || d < bestD) {
        bestPrio = prio;
        bestD = d;
        bestId = r.id;
      }
    }
    return bestId;
  }
}
