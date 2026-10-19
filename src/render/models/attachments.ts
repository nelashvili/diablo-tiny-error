/** Equipment attachments: procedural litesabers and item shapes (or loaded glTF clones). */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { classifyItem, classifyModelId, isDoubleSaberId, isLitesaberId, type ItemKind } from './helpers';
import { buildItemShape } from './placeholders';
import { mk, unit, type AttachSlot } from './rig';
import { glowMaterial, toonMaterial } from './toon';
import type { ModelEntry } from '../types';
import type { LoadedAsset } from './loader';
import { parseWeaponStyle, type WeaponStyle } from './weaponStyle';

export interface Attachment {
  readonly object: THREE.Object3D;
  /** Rotation about X the socket should apply (0 for short items/shields). */
  readonly tilt: number | null;
  /** How a held weapon sits in the hand: raised like a sword, or aimed forward like a gun. */
  readonly grip?: 'raised' | 'aimed';
  /** Shields: braced facing out from the body instead of hanging off the wrist. */
  readonly shield?: boolean;
  update(time: number): void;
}

const AIMED_KINDS = new Set<ItemKind>(['blaster', 'rifle']);

const BLADE_LEN = 0.95;
const HILT_LEN = 0.26;
const geos = new Map<string, THREE.BufferGeometry>();
function capsule(key: string, r: number, len: number): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, 4, 10);
    geos.set(key, g);
  }
  return g;
}

let phaseCounter = 1;
const DEFAULT_SABER = 0x4fc3ff;
const white = new THREE.Color();
function coreColor(accent: number): number {
  white.setHex(accent).lerp(new THREE.Color(1, 1, 1), 0.75);
  return white.getHex();
}

/** Blade color per saber line (training blue, cadet green, guard blue, falchion purple). */
const LINE_BLADES = [0x4fc3ff, 0x3dff6a, 0x5ad8ff, 0xb36bff];
/** Exceptional sabers burn temple-guard yellow, elite ones white-hot; uniques/sets amber. */
const TIER_BLADES = [0, 0xffd24a, 0xf4f4ff];
const UNIQUE_BLADE = 0xff8a2a;
/** Hilt trim per tier: steel, gold, black-and-gold. */
const TIER_HILT: [number, number][] = [
  [0x9aa0aa, 0x2a2d36],
  [0xc8a040, 0x2a2d36],
  [0x1c1c22, 0xe0b040],
];

export function saberColor(style: WeaponStyle | null): number {
  if (!style) return DEFAULT_SABER;
  if (style.unique) return UNIQUE_BLADE;
  return TIER_BLADES[style.tier] || LINE_BLADES[style.line % LINE_BLADES.length]!;
}

/**
 * Procedural litesaber: hilt + emissive core + additive glow. Double sabers get a second blade.
 * `style` varies the hilt by line (plain, ribbed grip, crossguard, curved) and the trim/blade by tier.
 */
export function buildLitesaber(
  accent: number | undefined,
  double: boolean,
  style: WeaponStyle | null = null,
): Attachment {
  const ac = accent ?? saberColor(style);
  const tier = style?.tier ?? 0;
  const line = style?.line ?? 0;
  const g = new THREE.Group();
  const [hiltCol, darkCol] = TIER_HILT[tier] ?? TIER_HILT[0]!;
  const hiltMat = toonMaterial(hiltCol);
  const darkMat = toonMaterial(darkCol);
  const hiltLen = (double ? HILT_LEN * 1.4 : HILT_LEN) * (line === 3 ? 1.15 : 1);
  g.add(mk(unit.cylinder(), hiltMat, 0.05, hiltLen, 0.05, 0, 0, 0));
  g.add(mk(unit.cylinder(), darkMat, 0.058, hiltLen * 0.3, 0.058, 0, -hiltLen * 0.2, 0));
  g.add(mk(unit.cylinder(), darkMat, 0.07, 0.03, 0.07, 0, hiltLen / 2, 0));
  if (line === 1)
    for (let i = 0; i < 4; i++)
      g.add(mk(unit.cylinder(), darkMat, 0.062, 0.018, 0.062, 0, -hiltLen * 0.35 + i * 0.05, 0));
  if (line === 3) {
    // Curved duelist hilt: an angled pommel and a hand guard.
    const pommel = mk(unit.cylinder(), darkMat, 0.055, 0.1, 0.055, 0.02, -hiltLen / 2 - 0.03, 0);
    pommel.rotation.z = 0.5;
    g.add(pommel, mk(unit.box(), hiltMat, 0.1, 0.025, 0.03, 0.03, hiltLen * 0.25, 0));
  }
  if (tier > 0) g.add(mk(unit.cylinder(), toonMaterial(0xe0b040), 0.064, 0.02, 0.064, 0, hiltLen * 0.18, 0));
  const glowW = tier === 2 ? 1.35 : tier === 1 ? 1.15 : 1;
  const glows: THREE.Mesh[] = [];
  const coreMat = glowMaterial(coreColor(ac));
  const glowMat = glowMaterial(ac, 0.5, true);
  const addBlade = (dir: 1 | -1) => {
    const base = (hiltLen / 2) * dir;
    const core = new THREE.Mesh(capsule('core', 0.026, BLADE_LEN - 0.05), coreMat);
    core.position.y = base + (dir * BLADE_LEN) / 2;
    const glow = new THREE.Mesh(capsule('glow', 0.068, BLADE_LEN - 0.12), glowMat);
    glow.position.copy(core.position);
    glow.scale.set(glowW, 1, glowW);
    core.userData.noTint = true;
    glow.userData.noTint = true;
    g.add(core, glow);
    glows.push(glow);
  };
  addBlade(1);
  if (double) addBlade(-1);
  // Guard-line sabers get two short crossguard vents.
  if (line === 2 && !double)
    for (const side of [-1, 1]) {
      const q = new THREE.Mesh(capsule('quillon', 0.02, 0.1), glowMaterial(coreColor(ac)));
      q.rotation.z = Math.PI / 2;
      q.position.set(side * 0.1, hiltLen / 2 - 0.03, 0);
      q.userData.noTint = true;
      g.add(q);
    }
  const phase = (phaseCounter++ * 2.399) % 10;
  return {
    object: g,
    tilt: 1.1,
    update(time) {
      const f = 1 + Math.sin(time * 38 + phase) * 0.06 + Math.sin(time * 11.3 + phase) * 0.05;
      for (const m of glows) m.scale.set(f * glowW, 1, f * glowW);
    },
  };
}

/** Item kinds held in a hand like a weapon (long axis +Y, grip at the origin). */
const WEAPON_KINDS = new Set<ItemKind>([
  'litesaber',
  'blade',
  'blaster',
  'rifle',
  'spear',
  'javelin',
  'staff',
  'axe',
  'baton',
  'disc',
  'focus',
]);

/** Procedural weapon colors (body, glow) — catalog fallbacks would paint them all crate-gold. */
const WEAPON_COLORS: Partial<Record<ItemKind, [number, number]>> = {
  blade: [0x9aa0aa, 0x4fc3ff],
  blaster: [0x5a5f66, 0xff5a3a],
  rifle: [0x4a4f56, 0xff5a3a],
  spear: [0x7a6a50, 0x66ccff],
  javelin: [0x9a7a50, 0xffd24a],
  staff: [0x7a5434, 0xb36bff],
  axe: [0x3a3d44, 0xff8a3d],
  baton: [0x2a2d36, 0x66ccff],
  disc: [0x9aa0aa, 0x4fc3ff],
  focus: [0x9aa0aa, 0xb36bff],
};

/** Held length (before HELD_WEAPON_SCALE) that loaded gun models are normalized to. */
const ASSET_WEAPON_LENGTH: Partial<Record<ItemKind, number>> = { blaster: 0.7, rifle: 1.25 };
/** Fraction of the gun's length, from the back, where the hand grips it. */
const GRIP_AT = 0.3;
const FLIP_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
/** How far down the gun (barrel top = 0, handle bottom = 1) the palm sits. */
const HANDLE_DEPTH = 0.62;
const box = new THREE.Box3();

/** Clone a loaded item model for attachment (shares geometries/materials). */
function fromAsset(asset: LoadedAsset, entry: ModelEntry, kind: ItemKind): Attachment {
  const weapon = WEAPON_KINDS.has(kind);
  const obj = SkeletonUtils.clone(asset.scene);
  obj.scale.multiplyScalar(entry.scale);
  const wrap = new THREE.Group();
  wrap.add(obj);
  if (weapon) {
    // Blaster-kit guns point their barrel along -Z (the loop on the rifles is a skeletal stock).
    // Turn the barrel to +Y like the procedural weapons, keeping the handle down along +Z: tip the
    // gun back (+Z -> +Y), then spin it end over end about Z. Then size it consistently (the kit
    // mixes scales) and put the grip, not the stock, in the hand.
    obj.rotation.x = -Math.PI / 2;
    obj.quaternion.premultiply(FLIP_Z);
    wrap.updateMatrixWorld(true);
    box.setFromObject(obj);
    const len = box.max.y - box.min.y;
    const target = ASSET_WEAPON_LENGTH[kind] ?? len;
    if (len > 1e-3) {
      const k = target / len;
      obj.scale.multiplyScalar(k);
      obj.position.y = -(box.min.y + len * GRIP_AT) * k;
      obj.position.x = -((box.min.x + box.max.x) / 2) * k;
      // After the turn the gun's underside faces +Z: put the handle, not the barrel, in the palm.
      obj.position.z = -(box.min.z + (box.max.z - box.min.z) * HANDLE_DEPTH) * k;
    }
  }
  return {
    object: wrap,
    tilt: weapon ? 1.1 : null,
    grip: AIMED_KINDS.has(kind) ? 'aimed' : 'raised',
    shield: kind === 'shield',
    update() {},
  };
}

/**
 * Build an attachment for `modelId` at `slot`. `entry`/`asset` are optional catalog data;
 * with neither, an item shape is derived from the id.
 */
export function createAttachment(
  slot: AttachSlot,
  modelId: string,
  accent: number | undefined,
  entry: ModelEntry | undefined,
  asset: LoadedAsset | null,
): Attachment {
  const style = parseWeaponStyle(modelId);
  if (isLitesaberId(modelId)) return buildLitesaber(accent, isDoubleSaberId(modelId), style);
  const info = classifyModelId(modelId);
  const kind = classifyItem(info.kind === 'item' ? info.name : modelId);
  if (asset && entry) return fromAsset(asset, entry, kind);
  const wc = WEAPON_COLORS[kind];
  const tier = style?.tier ?? 0;
  // Exceptional weapons get a navy finish and gold glow, elite ones black with a white-gold glow.
  const color =
    tier === 2 ? 0x1c1c22 : tier === 1 ? 0x2a3a5e : (wc?.[0] ?? entry?.placeholder.color ?? 0x8a929c);
  const glowCol = style?.unique ? UNIQUE_BLADE : tier === 2 ? 0xfff0b0 : tier === 1 ? 0xffd24a : undefined;
  const shape = buildItemShape(kind, color, accent ?? glowCol ?? wc?.[1] ?? entry?.accent);
  // Later lines of a weapon class are a little bigger.
  if (style) shape.scale.multiplyScalar(1 + Math.min(3, style.line) * 0.07);
  let tilt: number | null = 1.1;
  if (kind === 'shield') {
    tilt = null;
    shape.position.set(0, 0, 0.1);
  } else if (kind === 'helm') {
    shape.position.y = 0.0;
    tilt = null;
    shape.scale.setScalar(0.9);
  } else if (kind === 'armor') {
    tilt = null;
    shape.scale.setScalar(1.15);
  } else if (
    kind === 'boots' ||
    kind === 'gloves' ||
    kind === 'belt' ||
    kind === 'ring' ||
    kind === 'amulet'
  ) {
    tilt = null;
    shape.scale.setScalar(0.7);
  }
  if (slot === 'head' || slot === 'chest') tilt = null;
  const wrap = new THREE.Group();
  wrap.add(shape);
  return {
    object: wrap,
    tilt,
    grip: AIMED_KINDS.has(kind) ? 'aimed' : 'raised',
    shield: kind === 'shield',
    update() {},
  };
}
