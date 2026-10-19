import * as THREE from 'three';
import type { EntityId } from '../../core/types';
import type { WorldView } from '../../core/sim/world';
import type { Entity, EntityKind } from '../../core/sim/entities';
import type { EntityVisual, VfxSystem, VisualFactory } from '../types';
import { armorLook } from '../models/outfit';
import { getModelEntry } from '../assets/catalog';
import { DB } from '../../data/db';
import { MotionBuffer, type MotionSample } from './interp';
import { distSqToSegment } from '../camera/isoMath';
import type { IsoCamera } from '../camera/isoCamera';
import { rectContains, type GroundRect } from '../culling/viewRect';
import { RANGED_WEAPON_CLASSES } from '../models/helpers';
import { weaponModelId } from '../models/weaponStyle';

/** Model id for an item base: weapons by class, line and tier (see weaponStyle), the rest by base id. */
function itemModelId(baseId: string, quality?: string): string {
  return weaponModelId(baseId, quality);
}

/** Items on the ground: weapons by their class model; everything else from its data (itemLook). */
function groundModelId(baseId: string, quality?: string): string {
  return DB.items.get(baseId)?.weaponClass ? weaponModelId(baseId, quality) : `item.drop.${baseId}`;
}

const TINT_NONE = -1;
const TINT_FROZEN = 0x66ccff;
const TINT_TOXIN = 0x66dd44;
const TINT_BURN = 0xff7a30;
const TINT_CHAMPION = 0x7a8cff;
const TINT_UNIQUE = 0xffd24a;

/** Hit reaction: flash + recoil away from the attacker + squash, decaying over HIT_FX_SEC. */
const HIT_FX_SEC = 0.18;
/** Hit flash (added as emissive at half strength): warm and below the bloom threshold, so a struck
 * pack flickers instead of turning into white blobs. */
const HIT_FLASH = 0x9a8270;
const HIT_RECOIL = 0.14;
const HIT_SQUASH = 0.14;
const CRIT_MUL = 1.8;

export const QUALITY_COLORS: Record<string, number> = {
  magic: 0x6a8cff,
  rare: 0xffe14a,
  set: 0x3dff6a,
  unique: 0xffa826,
  crafted: 0xff9040,
};

const HOVER_COLOR: Partial<Record<EntityKind, number>> = { monster: 0xff4a3a, groundItem: 0xffffff };

/** Aim-assist radius (tiles) for clicks that land near, but not on, a monster. */
const MAGNET_TILES = 1.5;
// Loot under the cursor beats a monster behind it (D2: item labels sit on top), so hovering a drop
// mid-fight shows its tooltip; items have a small pick radius, so this needs a deliberate point.
const PICK_PRIORITY: Partial<Record<EntityKind, number>> = {
  groundItem: 5,
  monster: 4,
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
  outfitKey: string;
  /** Main-hand weapon is ranged (attack mode plays the shoot clip). */
  ranged: boolean;
  x: number;
  z: number;
  pickR: number;
  pickH: number;
  pickable: boolean;
  alwaysVisible: boolean;
  /** Seconds left of the hit reaction (0 = none). */
  hitT: number;
  hitPower: number;
  hitDx: number;
  hitDz: number;
  /** Smoothed Forse-lift height (tiles). */
  liftY: number;
}

/** How high a gripped actor floats, and how fast it rises / drops. */
export const LIFT_HEIGHT = 0.9;
const LIFT_RISE_RATE = 6;
const LIFT_DROP_RATE = 14;

/** Target lift height for an actor: LIFT_HEIGHT (with a slow bob) while it has a 'lifted' effect. */
export function liftTarget(effects: readonly { spec: { kind: string } }[], t: number): number {
  for (let i = 0; i < effects.length; i++)
    if (effects[i]?.spec.kind === 'lifted') return LIFT_HEIGHT + Math.sin(t * 5) * 0.06;
  return 0;
}

/** Missile vfx ids drawn as solid laser bolts: [body color, halo color]. */
const BLASTUR_BOLTS: Record<string, [number, number]> = {
  'vfx.bolt.blastur': [0xff2414, 0xff5030],
  'vfx.bolt.blasturBlue': [0x2a7cff, 0x4a9cff],
};

/** Shared tiny resources for beams / glows (created lazily, disposed with the sync). */
class Shared {
  beamGeo = new THREE.CylinderGeometry(0.06, 0.16, 6, 8, 1, true);
  glowGeo = new THREE.SphereGeometry(0.22, 10, 8);
  /** Blastur bolt body: a capsule lying along +X (rotated to the flight direction per missile). */
  boltGeo = new THREE.CapsuleGeometry(0.075, 1.0, 4, 8).rotateZ(Math.PI / 2);
  private solid = new Map<number, THREE.MeshBasicMaterial>();
  /** Opaque, untonemapped color so laser bolts stay saturated over bright ground. */
  solidMat(color: number): THREE.MeshBasicMaterial {
    let m = this.solid.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
      this.solid.set(color, m);
    }
    return m;
  }
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
        fog: false,
      });
      this.mats.set(key, m);
    }
    return m;
  }
  dispose(): void {
    this.beamGeo.dispose();
    this.glowGeo.dispose();
    this.boltGeo.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const m of this.solid.values()) m.dispose();
    this.solid.clear();
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

  /** Start a hit reaction on `targetId`, pushed away from `sourceId` when known. */
  onHit(targetId: EntityId, sourceId: EntityId | undefined, crit: boolean): void {
    const r = this.records.get(targetId);
    if (!r || !r.visual) return;
    const s = sourceId !== undefined ? this.records.get(sourceId) : undefined;
    let dx = 0;
    let dz = 0;
    if (s && s !== r) {
      dx = r.x - s.x;
      dz = r.z - s.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        dx /= len;
        dz /= len;
      } else dx = dz = 0;
    }
    const power = crit ? CRIT_MUL : 1;
    // A crit landing on an ongoing reaction upgrades it; a plain hit restarts it.
    if (r.hitT > 0 && r.hitPower > power) return;
    r.hitT = HIT_FX_SEC;
    r.hitPower = power;
    r.hitDx = dx;
    r.hitDz = dz;
  }

  private applyHitReaction(r: Rec, v: EntityVisual, dt: number): void {
    const o = v.object;
    if (r.hitT <= 0) {
      if (r.hitPower !== 0) {
        r.hitPower = 0;
        o.position.set(0, 0, 0);
        o.scale.set(1, 1, 1);
        v.setHighlight(r.highlighted, HOVER_COLOR[r.kind] ?? 0xffe070);
      }
      return;
    }
    r.hitT = Math.max(0, r.hitT - dt);
    const k = r.hitT / HIT_FX_SEC; // 1 -> 0
    // Fast out, eased back: peak displacement right at impact.
    const ease = k * k;
    const p = r.hitPower;
    o.position.set(r.hitDx * HIT_RECOIL * p * ease, 0, r.hitDz * HIT_RECOIL * p * ease);
    const sq = HIT_SQUASH * p * ease;
    o.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    const flash = k > 0.45;
    v.setHighlight(flash || r.highlighted, flash ? HIT_FLASH : (HOVER_COLOR[r.kind] ?? 0xffe070));
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
        return e.creditz ? 'item.drop.creditz' : groundModelId(e.item.base, e.item.quality);
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
        const bolt = BLASTUR_BOLTS[id];
        if (bolt) {
          // Solid laser body with a soft halo, aimed along the flight direction.
          const body = new THREE.Group();
          body.add(new THREE.Mesh(this.shared.boltGeo, this.shared.solidMat(bolt[0])));
          const halo = new THREE.Mesh(this.shared.boltGeo, this.shared.mat(bolt[1], 0.2));
          halo.scale.set(1.1, 1.8, 1.8);
          body.add(halo);
          body.rotation.y = -Math.atan2(e.velocity.y, e.velocity.x);
          root.add(body);
        }
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
      outfitKey: '',
      ranged: false,
      x: 0,
      z: 0,
      // Monsters get a fatter pick capsule: clicking a moving target should not need precision.
      pickR: e.kind === 'monster' ? Math.max(0.75, e.radius + 0.4) : Math.max(0.5, e.radius + 0.2),
      pickH,
      pickable,
      alwaysVisible: e.id === localId || e.kind === 'missile' || e.kind === 'area',
      hitT: 0,
      liftY: 0,
      hitPower: 0,
      hitDx: 0,
      hitDz: 0,
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
      if (e.kind === 'player' || e.kind === 'monster' || e.kind === 'merc') {
        const want = liftTarget(e.effects, e.modeTime);
        if (want > 0 || r.liftY > 0) {
          const k = Math.min(1, dt * (want > r.liftY ? LIFT_RISE_RATE : LIFT_DROP_RATE));
          r.liftY += (want - r.liftY) * k;
          if (want === 0 && r.liftY < 0.01) r.liftY = 0;
          r.root.position.y += r.liftY;
        }
      }
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
            // Basic attacks with blasters/javelins/discs play the shooting clip, not a sword slash.
            const shoot = e.mode === 'attack' && r.ranged;
            v.setMode(shoot ? 'throw' : e.mode, e.modeTime, mul);
            r.mode = e.mode;
          }
          r.modeTime = e.modeTime;
          this.applyTint(r, v, e);
          if (e.kind === 'player' || e.kind === 'merc') this.applyEquipment(r, v, e.equipment);
          else if (!r.equip0 && e.modelId) this.applyGear(r, v, e.modelId);
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
          if (r.hitT <= 0) v.setHighlight(hl, HOVER_COLOR[e.kind] ?? 0xffe070);
        }
        if (r.hitT > 0 || r.hitPower !== 0) this.applyHitReaction(r, v, dt);
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
      // Bosses wear their own models and colors; a tint would wash them out (Grizzwald went flat orange).
      if (e.rank === 'champion') tint = TINT_CHAMPION;
      else if (e.rank === 'unique') tint = TINT_UNIQUE;
    }
    if (tint !== r.tint) {
      r.tint = tint;
      v.setTint(tint === TINT_NONE ? null : tint);
    }
  }

  /** Monsters and NPCs show the gear their catalog entry gives them (once). */
  private applyGear(r: Rec, v: EntityVisual, modelId: string): void {
    const gear = getModelEntry(modelId).gear;
    r.equip0 = gear?.mainHand ?? '-';
    if (!gear) return;
    if (gear.mainHand) {
      const wc = DB.items.get(gear.mainHand)?.weaponClass;
      r.ranged = !!wc && RANGED_WEAPON_CLASSES.has(wc);
      v.setAttachment('mainHand', itemModelId(gear.mainHand), gear.accent);
    }
    if (gear.offHand) v.setAttachment('offHand', itemModelId(gear.offHand), gear.accent);
  }

  private applyEquipment(
    r: Rec,
    v: EntityVisual,
    eq: Readonly<Record<string, { base: string; quality?: string }>>,
  ): void {
    const mi = eq['mainHand'];
    const oi = eq['offHand'];
    const m = mi ? itemModelId(mi.base, mi.quality) : '';
    const o = oi ? itemModelId(oi.base, oi.quality) : '';
    const h = eq['head']?.base ?? '';
    const c = eq['chest']?.base ?? '';
    if (m !== r.equip0) {
      r.equip0 = m;
      const wc = mi ? DB.items.get(mi.base)?.weaponClass : undefined;
      r.ranged = !!wc && RANGED_WEAPON_CLASSES.has(wc);
      v.setAttachment('mainHand', m || null);
    }
    if (o !== r.equip1) {
      r.equip1 = o;
      v.setAttachment('offHand', o || null);
    }
    if (h !== r.equip2) {
      r.equip2 = h;
      v.setAttachment('head', h ? `item.${h}` : null);
    }
    if (c !== r.equip3) {
      r.equip3 = c;
      v.setAttachment('chest', c ? `item.${c}` : null);
    }
    // Armor reshapes the hero's colors per body part (cooler looks at higher lines/tiers).
    const g = eq['gloves']?.base ?? '';
    const b = eq['boots']?.base ?? '';
    const outfitKey = `${h}|${c}|${g}|${b}`;
    if (v.setOutfit && outfitKey !== r.outfitKey) {
      r.outfitKey = outfitKey;
      v.setOutfit('head', armorLook(h));
      v.setOutfit('body', armorLook(c));
      v.setOutfit('arms', armorLook(g));
      v.setOutfit('legs', armorLook(b));
    }
  }

  /** Topmost pickable entity near the pointer. Priority items > monsters > npcs > objects. */
  pick(px: number, py: number, cam: IsoCamera, touch: boolean): EntityId | null {
    const ppu = cam.pxPerUnit;
    const minPx = touch ? 30 : 20;
    // Aim assist: a click that misses everything still snaps to a monster this close to the cursor.
    const magnet = Math.max(touch ? 64 : 48, MAGNET_TILES * ppu);
    let bestId: EntityId | null = null;
    let bestPrio = -1;
    let bestD = Infinity;
    let nearMonster: EntityId | null = null;
    let nearD = magnet * magnet;
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    for (const r of this.records.values()) {
      if (!r.pickable || !r.root.visible) continue;
      if (r.kind === 'monster' && r.mode === 'dying') continue;
      const prio = PICK_PRIORITY[r.kind] ?? 0;
      if (prio < bestPrio && r.kind !== 'monster') continue;
      cam.worldToScreen(r.x, 0, r.z, a);
      cam.worldToScreen(r.x, r.pickH, r.z, b);
      const rad = Math.max(minPx, r.pickR * ppu * (touch ? 1.4 : 1));
      const d = distSqToSegment(px, py, a.x, a.y, b.x, b.y);
      if (r.kind === 'monster' && d < nearD) {
        nearD = d;
        nearMonster = r.id;
      }
      if (prio < bestPrio || d > rad * rad) continue;
      if (prio > bestPrio || d < bestD) {
        bestPrio = prio;
        bestD = d;
        bestId = r.id;
      }
    }
    return bestId ?? nearMonster;
  }
}
