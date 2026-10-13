/**
 * Pure minimap math: isometric projection (matches the D2-style iso camera, where sim +x points
 * screen down-right and sim +y points screen down-left), tile classification and fog reveal.
 */
import type { Vec2 } from '../../core/types';
import type { TileMap } from '../../core/world/types';

/** 2D affine matrix in canvas setTransform order: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Projects sim tile coords to iso pixels (unanchored). `scale` = pixels per tile along screen x. */
export function isoProject(x: number, y: number, scale: number): Vec2 {
  return { x: (x - y) * scale * 0.5, y: (x + y) * scale * 0.25 };
}

/** Transform mapping sim coords to canvas pixels with `center` at canvas (cx, cy). */
export function minimapTransform(center: Vec2, scale: number, cx: number, cy: number): Affine {
  const a = scale * 0.5;
  const b = scale * 0.25;
  const c = -scale * 0.5;
  const d = scale * 0.25;
  return {
    a,
    b,
    c,
    d,
    e: cx - (a * center.x + c * center.y),
    f: cy - (b * center.x + d * center.y),
  };
}

export function applyAffine(m: Affine, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Screen-space angle (radians, canvas convention) of a sim facing angle after iso projection. */
export function isoAngle(facing: number): number {
  const p = isoProject(Math.cos(facing), Math.sin(facing), 1);
  return Math.atan2(p.y, p.x);
}

/** Tile classes for drawing. */
export const TILE_NONE = 0;
export const TILE_FLOOR = 1;
export const TILE_WALL = 2;
export const TILE_WATER = 3;
export const TILE_PORTAL = 4; // stairs / doors

/**
 * Classify every tile: walkable -> floor (doors/stairs flagged), water -> water,
 * blocked tiles touching walkable ones (8-neighbourhood) -> wall outline, the rest -> none.
 */
export function classifyTiles(map: TileMap): Uint8Array {
  const { width: w, height: h } = map;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const kind = map.kinds[i];
      if (map.walkable[i] === 1) {
        out[i] = kind === 'door' || kind === 'stairsDown' || kind === 'stairsUp' ? TILE_PORTAL : TILE_FLOOR;
        continue;
      }
      if (kind === 'water') {
        out[i] = TILE_WATER;
        continue;
      }
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (map.walkable[ny * w + nx] === 1) {
            edge = true;
            break;
          }
        }
      out[i] = edge ? TILE_WALL : TILE_NONE;
    }
  }
  return out;
}

/**
 * Marks tiles within `radius` of (cx, cy) as explored. Returns the number of newly revealed
 * tiles (0 means nothing to repaint).
 */
export function revealCircle(
  explored: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  let n = 0;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * w + x;
      if (!explored[i]) {
        explored[i] = 1;
        n++;
      }
    }
  return n;
}

/** Scale (pixels per tile) that fits a whole w x h map into a box, iso-projected. */
export function fitScale(mapW: number, mapH: number, boxW: number, boxH: number): number {
  // Projected extents: width = (w + h) * s/2, height = (w + h) * s/4.
  const span = mapW + mapH;
  if (span <= 0) return 1;
  return Math.min((boxW * 2) / span, (boxH * 4) / span);
}
