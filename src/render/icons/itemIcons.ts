/**
 * Inventory item art: renders each item base's 3D model (the same one heroes hold or wear) once
 * into a transparent PNG, D2-style. Uses its own small WebGL context; results are cached per base.
 * The UI shows its SVG glyph until an icon is ready (glTF models load asynchronously).
 */
import * as THREE from 'three';
import { DB } from '../../data/db';
import type { ItemBaseDef } from '../../data/schema';
import { getModelEntry } from '../assets/catalog';
import { buildLitesaber, createAttachment } from '../models/attachments';
import { classifyItem, isDoubleSaberId, isLitesaberId, type ItemKind } from '../models/helpers';
import { parseWeaponStyle, weaponModelId } from '../models/weaponStyle';
import { AssetLoader } from '../models/loader';
import { buildItemShape } from '../models/placeholders';
import { armorLook } from '../models/outfit';

export interface ItemIconSource {
  /** PNG data URL for the base, or null while it is being prepared (`onReady` fires when it is). */
  get(baseId: string, onReady?: () => void): string | null;
}

/** Pixels per inventory cell; icons are rendered at the item's cell aspect. */
const CELL_PX = 72;
const PAD = 0.1;

/** Model ids for non-weapon bases, by armor class. */
const ARMOR_MODEL: Record<string, string> = {
  helm: 'item.helm',
  chest: 'item.armor',
  shield: 'item.shield',
  gloves: 'item.gloves',
  belt: 'item.belt',
  boots: 'item.boots',
  ring: 'item.ring',
  amulet: 'item.amulet',
};

/** Icon body / glow colors per kind (placeholder catalog colors are tuned for the world, not UI). */
const KIND_COLORS: Partial<Record<ItemKind, [number, number]>> = {
  helm: [0x8d96a3, 0x4fc3ff],
  armor: [0x6b7a8f, 0x4fc3ff],
  shield: [0x7c8794, 0x66ccff],
  gloves: [0x8a6a4a, 0xffb347],
  belt: [0x7a5a3a, 0xffd24a],
  boots: [0x6a5040, 0xffb347],
  ring: [0xd8b04a, 0xff5a8a],
  amulet: [0xd8b04a, 0x4fc3ff],
  gem: [0x9a7aff, 0xb36bff],
  potion: [0xdfe8f0, 0xff4040],
  scroll: [0x8a5a3a, 0xeadfb4],
  generic: [0x8a929c, 0xffd24a],
};

const USE_GLOW: Record<string, number> = {
  heal: 0xff3a3a,
  rejuv: 0xc040ff,
  mana: 0x3a7aff,
  stamina: 0xffd24a,
  antidote: 0x66dd44,
  thaw: 0xff8a30,
};

function iconModel(
  base: ItemBaseDef | undefined,
  baseId: string,
): { id: string; kind: ItemKind; glow?: number; body?: number } {
  if (base?.weaponClass) {
    const id = weaponModelId(baseId);
    return { id, kind: classifyItem(id) };
  }
  if (base?.armorClass && ARMOR_MODEL[base.armorClass]) {
    // Helms and chests by line (hood, mask, helmet / flight suit, armor), in the line's colors.
    const byName = classifyItem(`item.${baseId}`);
    const kind =
      base.armorClass === 'helm' && (byName === 'hood' || byName === 'mask')
        ? byName
        : base.armorClass === 'chest' && byName === 'suit'
          ? 'suit'
          : classifyItem(ARMOR_MODEL[base.armorClass] as string);
    const look = armorLook(baseId);
    return {
      id: `item.${baseId}`,
      kind,
      ...(look ? { body: look.primary, glow: look.glow || undefined } : {}),
    };
  }
  if (base?.use) {
    const k = base.use.kind;
    if (k === 'recall' || k === 'identify') return { id: 'item.scroll', kind: 'scroll' };
    return { id: 'item.potion', kind: 'potion', glow: USE_GLOW[k] };
  }
  if (base?.category === 'gem') return { id: 'item.gem', kind: 'gem' };
  const id = `item.${baseId}`;
  return { id, kind: classifyItem(id) };
}

/** Litesabers are always procedural; potions too, so their liquid shows what they restore. */
function procedural(modelId: string): boolean {
  return isLitesaberId(modelId) || modelId === 'item.potion';
}

const AIMED = new Set<ItemKind>(['blaster', 'rifle']);
const HELD = new Set<ItemKind>([
  'litesaber',
  'blade',
  'spear',
  'javelin',
  'staff',
  'axe',
  'baton',
  'disc',
  'focus',
]);

/** Pose the model for a 3/4 inventory view; weapons lie along their cell's diagonal. */
function pose(obj: THREE.Object3D, kind: ItemKind, cells: { w: number; h: number }): void {
  const diag = Math.atan2(cells.h, cells.w);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  if (AIMED.has(kind)) {
    // Gun frame: barrel +Y, handle +Z. Side profile: barrel angled up-right, handle hanging below
    // it, then turned slightly toward the viewer for depth.
    const a = diag;
    const barrel = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const handle = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0);
    const side = new THREE.Vector3().crossVectors(barrel, handle);
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, barrel, handle));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.45));
    obj.quaternion.copy(q);
    return;
  } else if (HELD.has(kind)) {
    e.set(0.25, 0.6, diag - Math.PI / 2, 'ZYX');
  } else if (kind === 'ring' || kind === 'amulet') {
    e.set(0.15, 0.35, 0, 'YXZ');
  } else {
    // Worn gear is built facing +Z: show it from slightly above and to the side.
    e.set(0.35, 0.55, 0, 'YXZ');
  }
  q.setFromEuler(e);
  obj.quaternion.copy(q);
}

export function createItemIcons(): ItemIconSource {
  const urls = new Map<string, string>();
  const pending = new Map<string, Set<() => void>>();
  let gl: THREE.WebGLRenderer | null = null;
  let loader: AssetLoader | null = null;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.position.set(0, 0, 20);
  cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2018, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight(0x9ad0ff, 1.6);
  rim.position.set(4, 2, -5);
  scene.add(key, rim);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  const context = (): THREE.WebGLRenderer | null => {
    if (gl) return gl;
    try {
      gl = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch {
      return null;
    }
    gl.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.setClearColor(0x000000, 0);
    loader = new AssetLoader(gl);
    return gl;
  };

  const render = (
    baseId: string,
    base: ItemBaseDef | undefined,
    asset: Parameters<typeof createAttachment>[4],
  ) => {
    const r = context();
    if (!r) return null;
    const { id, kind, glow, body: lineBody } = iconModel(base, baseId);
    const entry = getModelEntry(id);
    let obj: THREE.Object3D;
    if (procedural(id)) asset = null;
    if (isLitesaberId(id)) obj = buildLitesaber(undefined, isDoubleSaberId(id), parseWeaponStyle(id)).object;
    else if (asset) obj = createAttachment('mainHand', id, undefined, entry, asset).object;
    else if (HELD.has(kind) || AIMED.has(kind)) {
      obj = createAttachment('mainHand', id, undefined, undefined, null).object;
    } else {
      const [body, accent] = KIND_COLORS[kind] ?? [entry.placeholder.color, entry.accent ?? 0x4fc3ff];
      obj = buildItemShape(kind, lineBody ?? body, glow ?? accent);
    }
    const holder = new THREE.Group();
    holder.add(obj);
    const cells = base?.size ?? { w: 1, h: 1 };
    pose(holder, kind, cells);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    box.getSize(size);
    box.getCenter(center);
    const aspect = cells.w / cells.h;
    let halfH = (size.y / 2) * (1 + PAD * 2);
    let halfW = (size.x / 2) * (1 + PAD * 2);
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    cam.left = center.x - halfW;
    cam.right = center.x + halfW;
    cam.top = center.y + halfH;
    cam.bottom = center.y - halfH;
    cam.updateProjectionMatrix();
    r.setSize(cells.w * CELL_PX, cells.h * CELL_PX, false);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(holder);
    return url;
  };

  const finish = (baseId: string, url: string | null) => {
    if (url) urls.set(baseId, url);
    const cbs = pending.get(baseId);
    pending.delete(baseId);
    if (url) for (const cb of cbs ?? []) cb();
  };

  return {
    get(baseId, onReady) {
      const hit = urls.get(baseId);
      if (hit) return hit;
      const waiting = pending.get(baseId);
      if (waiting) {
        if (onReady) waiting.add(onReady);
        return null;
      }
      const base = DB.items.get(baseId);
      const { id } = iconModel(base, baseId);
      const url = procedural(id) ? null : getModelEntry(id).url;
      if (!context()) return null;
      const ready = url ? loader!.peek(url) : null;
      if (!url || ready || loader!.hasFailed(url)) {
        const out = render(baseId, base, ready);
        if (out) urls.set(baseId, out);
        return out;
      }
      pending.set(baseId, new Set(onReady ? [onReady] : []));
      void loader!.load(url).then(
        (asset) => finish(baseId, render(baseId, base, asset)),
        () => finish(baseId, render(baseId, base, null)),
      );
      return null;
    },
  };
}
