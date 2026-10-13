/** Equipment attachments: procedural litesabers and item shapes (or loaded glTF clones). */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { classifyItem, classifyModelId, isDoubleSaberId, isLitesaberId } from './helpers';
import { buildItemShape } from './placeholders';
import { mk, unit, type AttachSlot } from './rig';
import { glowMaterial, toonMaterial } from './toon';
import type { ModelEntry } from '../types';
import type { LoadedAsset } from './loader';

export interface Attachment {
  readonly object: THREE.Object3D;
  /** Rotation about X the socket should apply (0 for short items/shields). */
  readonly tilt: number | null;
  update(time: number): void;
}

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

/** Procedural litesaber: hilt + emissive core + additive glow. Double sabers get a second blade. */
export function buildLitesaber(accent: number | undefined, double: boolean): Attachment {
  const ac = accent ?? DEFAULT_SABER;
  const g = new THREE.Group();
  const hiltMat = toonMaterial(0x9aa0aa);
  const darkMat = toonMaterial(0x2a2d36);
  const hiltLen = double ? HILT_LEN * 1.4 : HILT_LEN;
  g.add(mk(unit.cylinder(), hiltMat, 0.05, hiltLen, 0.05, 0, 0, 0));
  g.add(mk(unit.cylinder(), darkMat, 0.058, hiltLen * 0.3, 0.058, 0, -hiltLen * 0.2, 0));
  g.add(mk(unit.cylinder(), darkMat, 0.07, 0.03, 0.07, 0, hiltLen / 2, 0));
  const glows: THREE.Mesh[] = [];
  const coreMat = glowMaterial(coreColor(ac));
  const glowMat = glowMaterial(ac, 0.5, true);
  const addBlade = (dir: 1 | -1) => {
    const base = (hiltLen / 2) * dir;
    const core = new THREE.Mesh(capsule('core', 0.018, BLADE_LEN - 0.036), coreMat);
    core.position.y = base + (dir * BLADE_LEN) / 2;
    const glow = new THREE.Mesh(capsule('glow', 0.05, BLADE_LEN - 0.1), glowMat);
    glow.position.copy(core.position);
    core.userData.noTint = true;
    glow.userData.noTint = true;
    g.add(core, glow);
    glows.push(glow);
  };
  addBlade(1);
  if (double) addBlade(-1);
  const phase = (phaseCounter++ * 2.399) % 10;
  return {
    object: g,
    tilt: 1.1,
    update(time) {
      const f = 1 + Math.sin(time * 38 + phase) * 0.06 + Math.sin(time * 11.3 + phase) * 0.05;
      for (const m of glows) m.scale.set(f, 1, f);
    },
  };
}

/** Clone a loaded item model for attachment (shares geometries/materials). */
function fromAsset(asset: LoadedAsset, entry: ModelEntry): Attachment {
  const obj = SkeletonUtils.clone(asset.scene);
  obj.scale.multiplyScalar(entry.scale);
  const wrap = new THREE.Group();
  wrap.add(obj);
  return { object: wrap, tilt: null, update() {} };
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
  if (isLitesaberId(modelId)) return buildLitesaber(accent ?? entry?.accent, isDoubleSaberId(modelId));
  if (asset && entry) return fromAsset(asset, entry);
  const info = classifyModelId(modelId);
  const kind = classifyItem(info.kind === 'item' ? info.name : modelId);
  const color = entry?.placeholder.color ?? 0x8a929c;
  const shape = buildItemShape(kind, color, accent ?? entry?.accent);
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
  return { object: wrap, tilt, update() {} };
}
