/**
 * Canvas drawing for the minimap and the big Tab map. The static level layer is rasterized once
 * per level into a 1px-per-tile offscreen canvas (with fog-of-war: tiles appear as explored),
 * then drawn through the iso affine transform. Markers are drawn on top each refresh.
 */
import type { WorldView } from '../../core/sim/world';
import type { Vec2 } from '../../core/types';
import type { MonsterEntity } from '../../core/sim/entities';
import {
  applyAffine,
  classifyTiles,
  isoAngle,
  minimapTransform,
  revealCircle,
  TILE_FLOOR,
  TILE_PORTAL,
  TILE_WALL,
  TILE_WATER,
} from './minimapMath';
import { isTownLevel } from './lookup';

export const REVEAL_RADIUS = 14;

type RGBA = [number, number, number, number];

/** Parses "#rgb", "#rrggbb" or "rgb(a)(...)" into RGBA 0..255. */
export function parseColor(s: string, alpha = 1): RGBA {
  const v = s.trim();
  if (v.startsWith('#')) {
    const h = v.slice(1);
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(alpha * 255)];
  }
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (m) {
    const p = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, Math.round((p[3] ?? 1) * alpha * 255)];
  }
  return [255, 255, 255, Math.round(alpha * 255)];
}

export interface MapPalette {
  floor: RGBA;
  wall: RGBA;
  water: RGBA;
  portal: RGBA;
  /** CSS colors for markers. */
  player: string;
  enemy: string;
  champion: string;
  unique: string;
  npc: string;
  exit: string;
  waypoint: string;
  outline: string;
}

export function readPalette(el: Element): MapPalette {
  const cs = getComputedStyle(el);
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  return {
    floor: parseColor(v('--ui-text-dim', '#a89f88'), 0.22),
    wall: parseColor(v('--ui-border-hi', '#c9a85c'), 0.95),
    water: parseColor(v('--ui-mana', '#2f6fd6'), 0.45),
    portal: parseColor(v('--dmg-cryo', '#7fd0ff'), 0.8),
    player: v('--ui-text', '#f2ead3'),
    enemy: v('--ui-life', '#c8323c'),
    champion: v('--q-magic', '#6c8cff'),
    unique: v('--q-unique', '#c8a464'),
    npc: v('--q-set', '#3fd16b'),
    exit: v('--ui-xp', '#e3c86a'),
    waypoint: v('--dmg-cryo', '#7fd0ff'),
    outline: v('--ui-bg', '#0c0e18'),
  };
}

interface LevelLayer {
  key: string;
  w: number;
  h: number;
  classes: Uint8Array;
  explored: Uint8Array;
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
  img: ImageData | null;
  dirty: boolean;
}

/** Fog-of-war persists per level for the session. */
const layers = new Map<string, LevelLayer>();

export function getLayer(view: WorldView, palette: MapPalette): LevelLayer | null {
  const lvl = view.level;
  if (!lvl) return null;
  const key = `${lvl.levelId}#${lvl.seed}`;
  let L = layers.get(key);
  if (!L) {
    const { width: w, height: h } = lvl.map;
    const explored = new Uint8Array(w * h);
    if (isTownLevel(lvl.levelId)) explored.fill(1);
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = w * LAYER_RES;
      canvas.height = h * LAYER_RES;
    }
    L = { key, w, h, classes: classifyTiles(lvl.map), explored, canvas, img: null, dirty: true };
    layers.set(key, L);
  }
  const p = view.localPlayerId != null ? view.get(view.localPlayerId) : undefined;
  if (p && revealCircle(L.explored, L.w, L.h, p.pos.x, p.pos.y, REVEAL_RADIUS) > 0) L.dirty = true;
  if (L.dirty) paintLayer(L, palette);
  return L;
}

/** Raster resolution: pixels per tile in the offscreen layer (walls are drawn as thin edges). */
export const LAYER_RES = 4;

function paintLayer(L: LevelLayer, pal: MapPalette): void {
  L.dirty = false;
  const ctx = L.canvas?.getContext('2d') as CanvasRenderingContext2D | null | undefined;
  if (!ctx) return;
  const R = LAYER_RES;
  const W = L.w * R;
  if (!L.img) L.img = ctx.createImageData(W, L.h * R);
  const d = L.img.data;
  d.fill(0);
  const put = (px: number, py: number, c: RGBA) => {
    const o = (py * W + px) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = c[3];
  };
  const walk = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < L.w &&
    y < L.h &&
    (L.classes[y * L.w + x] === TILE_FLOOR || L.classes[y * L.w + x] === TILE_PORTAL);
  for (let ty = 0; ty < L.h; ty++)
    for (let tx = 0; tx < L.w; tx++) {
      const i = ty * L.w + tx;
      if (!L.explored[i]) continue;
      const c = L.classes[i];
      const x0 = tx * R;
      const y0 = ty * R;
      if (c === TILE_FLOOR || c === TILE_WATER || c === TILE_PORTAL) {
        const col = c === TILE_FLOOR ? pal.floor : c === TILE_WATER ? pal.water : pal.portal;
        for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) put(x0 + x, y0 + y, col);
      } else if (c === TILE_WALL) {
        // Thin edge on each side that faces a walkable tile (D2 automap look).
        if (walk(tx, ty - 1)) for (let x = 0; x < R; x++) put(x0 + x, y0, pal.wall);
        if (walk(tx, ty + 1)) for (let x = 0; x < R; x++) put(x0 + x, y0 + R - 1, pal.wall);
        if (walk(tx - 1, ty)) for (let y = 0; y < R; y++) put(x0, y0 + y, pal.wall);
        if (walk(tx + 1, ty)) for (let y = 0; y < R; y++) put(x0 + R - 1, y0 + y, pal.wall);
        if (walk(tx - 1, ty - 1)) put(x0, y0, pal.wall);
        if (walk(tx + 1, ty - 1)) put(x0 + R - 1, y0, pal.wall);
        if (walk(tx - 1, ty + 1)) put(x0, y0 + R - 1, pal.wall);
        if (walk(tx + 1, ty + 1)) put(x0 + R - 1, y0 + R - 1, pal.wall);
      }
    }
  ctx.putImageData(L.img, 0, 0);
}

export interface DrawOpts {
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  dpr: number;
  center: Vec2;
  /** Pixels per tile (screen x). */
  scale: number;
  /** Max distance from the player for monster dots. */
  monsterRadius: number;
  markerScale: number;
  /** Exit toward the quest objective (by target level): always shown, gold, pinned to the edge. */
  guideTo?: string | null;
}

const GUIDE = '#ffd23f';

export function drawMap(ctx: CanvasRenderingContext2D, view: WorldView, pal: MapPalette, o: DrawOpts): void {
  const { width: W, height: H, dpr } = o;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W * dpr, H * dpr);
  const L = getLayer(view, pal);
  const m = minimapTransform(o.center, o.scale, W / 2, H / 2);
  if (L?.canvas) {
    ctx.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, m.e * dpr, m.f * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(L.canvas as CanvasImageSource, 0, 0, L.w, L.h);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ms = o.markerScale;
  const explored = (x: number, y: number) => !L || !!L.explored[Math.floor(y) * L.w + Math.floor(x)];

  // Static placements: exits and Holo-Beacons.
  for (const pl of view.level?.placements ?? []) {
    if (pl.kind !== 'exit' && pl.kind !== 'waypoint') continue;
    if (pl.kind === 'exit' && o.guideTo && pl.ref === o.guideTo) {
      drawGuide(ctx, applyAffine(m, { x: pl.pos.x + 0.5, y: pl.pos.y + 0.5 }), W, H, 7 * ms, pal.outline);
      continue;
    }
    if (!explored(pl.pos.x, pl.pos.y)) continue;
    const s = applyAffine(m, { x: pl.pos.x + 0.5, y: pl.pos.y + 0.5 });
    if (pl.kind === 'waypoint') drawDiamond(ctx, s.x, s.y, 6 * ms, pal.waypoint, pal.outline);
    else drawExit(ctx, s.x, s.y, 6 * ms, pal.exit, pal.outline);
  }

  const pid = view.localPlayerId;
  const player = pid != null ? view.get(pid) : undefined;
  const r2 = o.monsterRadius * o.monsterRadius;
  for (const e of view.all()) {
    if (e.kind !== 'monster' && e.kind !== 'npc' && e.kind !== 'merc') continue;
    if (e.kind === 'monster' && (e as MonsterEntity).life <= 0) continue;
    if (player) {
      const dx = e.pos.x - player.pos.x;
      const dy = e.pos.y - player.pos.y;
      if (e.kind === 'monster' && dx * dx + dy * dy > r2) continue;
    }
    const s = applyAffine(m, e.pos);
    if (s.x < -10 || s.y < -10 || s.x > W + 10 || s.y > H + 10) continue;
    let col = pal.enemy;
    let r = 2.6 * ms;
    if (e.kind === 'npc' || e.kind === 'merc') col = pal.npc;
    else {
      const rank = (e as MonsterEntity).rank;
      if (rank === 'champion') {
        col = pal.champion;
        r = 3.4 * ms;
      } else if (rank === 'unique' || rank === 'boss') {
        col = pal.unique;
        r = 4.2 * ms;
      }
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.outline;
    ctx.stroke();
  }

  if (player) {
    const s = applyAffine(m, player.pos);
    drawArrow(ctx, s.x, s.y, 8 * ms, isoAngle(player.facing), pal.player, pal.outline);
  }
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  line: string,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.75, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.75, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = line;
  ctx.stroke();
}

/** The objective exit: a gold marker, or a gold arrow on the map's edge pointing at it. */
function drawGuide(ctx: CanvasRenderingContext2D, p: Vec2, W: number, H: number, r: number, line: string) {
  const pad = r + 3;
  if (p.x >= pad && p.y >= pad && p.x <= W - pad && p.y <= H - pad) {
    drawExit(ctx, p.x, p.y, r, GUIDE, line);
    return;
  }
  const cx = W / 2;
  const cy = H / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
  const x = cx + dx * k;
  const y = cy + dy * k;
  const a = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
  ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
  ctx.closePath();
  ctx.fillStyle = GUIDE;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = line;
  ctx.stroke();
}

function drawExit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  line: string,
) {
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.6);
  ctx.lineTo(x - r, y - r * 0.2);
  ctx.quadraticCurveTo(x, y - r * 1.3, x + r, y - r * 0.2);
  ctx.lineTo(x + r, y + r * 0.6);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = line;
  ctx.stroke();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ang: number,
  fill: string,
  line: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, r * 0.65);
  ctx.lineTo(-r * 0.35, 0);
  ctx.lineTo(-r * 0.7, -r * 0.65);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.shadowColor = fill;
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.restore();
}
