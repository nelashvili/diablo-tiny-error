/**
 * Procedural wall kits: wall tiles of some tilesets are built from shaped pieces instead of one
 * stretched block, so a wall reads as masonry (temple) or a plated outpost wall (town) with a clear
 * top edge. `wallPieces` decides per tile which pieces it gets from its neighbours (pure, tested);
 * `buildWallKit` makes each piece's geometry (vertex colored, base at y = 0, one tile footprint).
 * Three piece kinds keep it to three draw calls per map chunk.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TileKind } from '../../core/world/types';

/** 'segment' = body, plinth, cap and top together; 'top' = top only (buried walls). */
export type WallPiece = 'segment' | 'top' | 'pilaster';
export const WALL_PIECES: readonly WallPiece[] = ['segment', 'top', 'pilaster'];

export interface WallInst {
  piece: WallPiece;
  tx: number;
  ty: number;
  /** Rotation about Y (pilasters: +Z of the piece faces the open side). */
  rot: number;
}

/** Open sides, as [dx, dy, rotation that turns the piece's +Z toward that side]. */
const SIDES: readonly [number, number, number][] = [
  [0, 1, 0],
  [0, -1, Math.PI],
  [1, 0, Math.PI / 2],
  [-1, 0, -Math.PI / 2],
];

/** How often a pilaster stands along a face (in tiles). */
const PILASTER_EVERY = 3;

/**
 * Pieces for every `wall` tile: walls next to anything but wall get a full segment (its dark top
 * reads D2-style: wall masses dark, the light cornice only along their edges, so rooms stand out),
 * plus pilasters every few tiles along open faces and at outer corners; walls buried inside a solid
 * mass get only the top. Void counts as closed for faces (nothing to see there).
 */
export function wallPieces(kinds: readonly TileKind[], width: number, height: number): WallInst[] {
  const at = (x: number, y: number): TileKind =>
    x < 0 || y < 0 || x >= width || y >= height ? 'void' : (kinds[y * width + x] ?? 'void');
  const closed = (k: TileKind) => k === 'wall' || k === 'void';
  const out: WallInst[] = [];
  for (let ty = 0; ty < height; ty++)
    for (let tx = 0; tx < width; tx++) {
      if (at(tx, ty) !== 'wall') continue;
      let buried = true;
      for (let dy = -1; dy <= 1 && buried; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && at(tx + dx, ty + dy) !== 'wall') {
            buried = false;
            break;
          }
      out.push({ piece: buried ? 'top' : 'segment', tx, ty, rot: 0 });
      if (buried) continue;
      const open = SIDES.filter(([dx, dy]) => !closed(at(tx + dx, ty + dy)));
      const corner = open.some(([ax]) => ax !== 0) && open.some(([, ay]) => ay !== 0);
      for (const [dx, , rot] of open) {
        const along = dx === 0 ? tx : ty;
        if (corner || along % PILASTER_EVERY === 0) out.push({ piece: 'pilaster', tx, ty, rot });
      }
    }
  return out;
}

export interface WallKitStyle {
  height: number;
  /** Main face color, and the alternate course / panel band color. */
  face: number;
  band: number;
  cap: number;
  plinth: number;
  pilaster: number;
  /** Pilaster capital / post stripe. */
  accent: number;
  /** Top of every wall tile (inset from the cap, which shows as a rim along the edges). */
  top: number;
  /** 'masonry' = stone courses; 'plated' = duracrete panels with seams and a mid band. */
  look: 'masonry' | 'plated';
}

const KITS: Record<string, WallKitStyle> = {
  temple: {
    height: 2.4,
    face: 0xa69b86,
    band: 0x958a76,
    cap: 0xc2b7a0,
    plinth: 0x6f6656,
    pilaster: 0xb3a892,
    accent: 0xcabfa8,
    top: 0x5e564a,
    look: 'masonry',
  },
  town: {
    height: 1.7,
    face: 0xb5aa92,
    band: 0x7c766a,
    cap: 0x4e5258,
    plinth: 0x6c6454,
    pilaster: 0x52565c,
    accent: 0xc8782a,
    top: 0x46494e,
    look: 'plated',
  },
};

/** The wall kit for a tileset (`endoor.temple` -> temple), or undefined to keep plain blocks. */
export function wallKitFor(tileset: string): WallKitStyle | undefined {
  return KITS[tileset.split('.').pop() ?? tileset];
}

const _c = new THREE.Color();

/** A colored box (base-relative position of its center); `ao` darkens toward its bottom. */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  ao: [number, number] | null = null,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  _c.setHex(color);
  for (let i = 0; i < p.count; i++) {
    const k = ao ? ao[0] + (1 - ao[0]) * THREE.MathUtils.clamp(p.getY(i) / ao[1], 0, 1) : 1;
    col[i * 3] = _c.r * k;
    col[i * 3 + 1] = _c.g * k;
    col[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const CAP_H = 0.14;
/** Height of the wall top (just above the caps, so it covers their inner part). */
export const kitTopY = (s: WallKitStyle): number => s.height + CAP_H + 0.03;

/** Geometry per piece for a kit style. */
export function buildWallKit(s: WallKitStyle): Record<WallPiece, THREE.BufferGeometry> {
  const H = s.height;
  const ao: [number, number] = [0.72, H];
  const body: THREE.BufferGeometry[] = [];
  if (s.look === 'masonry') {
    // Three stone courses with a recessed joint between them.
    const courses = 3;
    const joint = 0.045;
    const ch = H / courses;
    for (let i = 0; i < courses; i++) {
      const h = ch - (i < courses - 1 ? joint : 0);
      body.push(box(1, h, 1, 0, i * ch + h / 2, 0, i % 2 ? s.band : s.face, ao));
      if (i < courses - 1) body.push(box(0.955, joint, 0.955, 0, i * ch + h + joint / 2, 0, s.plinth, ao));
    }
  } else {
    // Duracrete panels: a dark band low on the wall and vertical seams on every face.
    body.push(box(1, H, 1, 0, H / 2, 0, s.face, ao));
    body.push(box(1.012, 0.16, 1.012, 0, H * 0.3, 0, s.band, ao));
    for (const o of [-0.25, 0.25]) {
      body.push(box(0.025, H * 0.86, 1.012, o, H * 0.5, 0, s.band, ao));
      body.push(box(1.012, H * 0.86, 0.025, 0, H * 0.5, o, s.band, ao));
    }
  }
  const cap =
    s.look === 'masonry'
      ? [
          box(1.08, CAP_H * 0.55, 1.08, 0, H + CAP_H * 0.725, 0, s.cap),
          box(1.03, CAP_H * 0.45, 1.03, 0, H + CAP_H * 0.225, 0, s.band),
        ]
      : [box(1.04, CAP_H, 1.04, 0, H + CAP_H / 2, 0, s.cap)];
  const plinth = box(1.1, 0.24, 1.1, 0, 0.12, 0, s.plinth);
  // Pilaster / post standing proud of the face, its outer side toward +Z.
  const pil: THREE.BufferGeometry[] =
    s.look === 'masonry'
      ? [
          box(0.36, H, 0.2, 0, H / 2, 0.55, s.pilaster, ao),
          box(0.46, 0.3, 0.28, 0, 0.15, 0.56, s.plinth),
          box(0.46, 0.16, 0.28, 0, H - 0.08, 0.56, s.accent),
        ]
      : [
          box(0.24, H + 0.3, 0.24, 0, (H + 0.3) / 2, 0.56, s.pilaster, ao),
          box(0.26, 0.1, 0.26, 0, H * 0.72, 0.56, s.accent),
          box(0.3, 0.08, 0.3, 0, H + 0.34, 0.56, s.cap),
        ];
  const top = () => box(1, 0.04, 1, 0, kitTopY(s) - 0.02, 0, s.top);
  return {
    segment: merge([...body, ...cap, plinth, top()]),
    top: merge([top()]),
    pilaster: merge(pil),
  };
}
