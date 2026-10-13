/**
 * Outdoor generator: organic cellular-automata border/forest, hazard blobs, obstacle clusters,
 * clearings and winding roads connecting start / exits / waypoint / clearings.
 *
 * genParams: width, height (48..160, default 96), rockDensity (0..0.6, default 0.3),
 *   ground ('grass'|'sand'), hazard ('water'|'pit'|'none'), hazardBlobs, clearings, clutter,
 *   sides (string of W/E/N/S assigned to edge links in order, default 'WENS'),
 *   questObject (def id placed in a standing-stone ring clearing), stones (ring prop count).
 */
import type { Rng } from '../../rng';
import type { Vec2 } from '../../types';
import { carveDisc, createMap, kindAt, setKind } from '../grid';
import type { TileKind, TileMap } from '../types';
import {
  boolParam,
  clamp,
  emptyLayout,
  numParam,
  strParam,
  type Layout,
  type LevelSpec,
  type LinkDef,
} from './common';

function paintRoad(map: TileMap, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 1 || y < 1 || x > map.width - 2 || y > map.height - 2) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const k = kindAt(map, x, y);
      setKind(map, x, y, k === 'water' || k === 'pit' ? 'bridge' : 'road');
    }
}

/** Sinusoidally winding road of the given width between two points. */
export function windRoad(map: TileMap, rng: Rng, a: Vec2, b: Vec2, width: number, amp: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    paintRoad(map, a.x, a.y, width / 2);
    return;
  }
  const px = -dy / len;
  const py = dx / len;
  const phase = rng.float(0, Math.PI * 2);
  const freq = rng.int(1, 3);
  const steps = Math.ceil(len * 2);
  const a2 = Math.min(amp, len * 0.25);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const env = Math.sin(Math.PI * t);
    const off = a2 * env * Math.sin(phase + t * freq * Math.PI * 2);
    paintRoad(map, a.x + dx * t + px * off, a.y + dy * t + py * off, width / 2);
  }
}

function sidePoint(side: string, w: number, h: number, rng: Rng): Vec2 {
  switch (side) {
    case 'W':
      return { x: 2.5, y: Math.floor(rng.float(h * 0.25, h * 0.75)) + 0.5 };
    case 'E':
      return { x: w - 2.5, y: Math.floor(rng.float(h * 0.25, h * 0.75)) + 0.5 };
    case 'N':
      return { x: Math.floor(rng.float(w * 0.25, w * 0.75)) + 0.5, y: 2.5 };
    default:
      return { x: Math.floor(rng.float(w * 0.25, w * 0.75)) + 0.5, y: h - 2.5 };
  }
}

export function generateOutdoor(spec: LevelSpec, rng: Rng): Layout {
  const p = spec.genParams;
  const W = Math.round(clamp(numParam(p, 'width', 96), 48, 160));
  const H = Math.round(clamp(numParam(p, 'height', 96), 48, 160));
  const ground: TileKind = strParam(p, 'ground', 'grass') === 'sand' ? 'sand' : 'grass';
  const rockP = clamp(numParam(p, 'rockDensity', 0.3), 0, 0.6);
  const map = createMap(W, H, ground);

  // --- organic border + interior forest via cellular automata
  let rock = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      const prob = e < 2 ? 1 : e < 9 ? 0.75 - 0.07 * (e - 2) : rockP;
      rock[y * W + x] = rng.next() < prob ? 1 : 0;
    }
  for (let iter = 0; iter < 4; iter++) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          next[i] = 1;
          continue;
        }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += rock[i + dy * W + dx] as number;
        next[i] = n > 4 ? 1 : n < 4 ? 0 : (rock[i] as number);
      }
    rock = next;
  }
  for (let i = 0; i < rock.length; i++) if (rock[i]) setKind(map, i % W, Math.floor(i / W), 'rock');

  // --- hazards (water / pits) with a sand shore
  const hazard = strParam(p, 'hazard', 'water');
  if (hazard !== 'none') {
    const kind: TileKind = hazard === 'pit' ? 'pit' : 'water';
    const blobs = numParam(p, 'hazardBlobs', 3);
    for (let b = 0; b < blobs; b++) {
      const cx = rng.float(14, W - 14);
      const cy = rng.float(14, H - 14);
      const rx = rng.float(3, 8);
      const ry = rng.float(3, 7);
      for (let y = Math.floor(cy - ry * 1.4); y <= Math.ceil(cy + ry * 1.4); y++)
        for (let x = Math.floor(cx - rx * 1.4); x <= Math.ceil(cx + rx * 1.4); x++) {
          const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
          if (d <= 1) setKind(map, x, y, kind);
          else if (d <= 1.9 && kind === 'water' && kindAt(map, x, y) === 'grass') setKind(map, x, y, 'sand');
        }
    }
  }

  // --- obstacle clusters
  const clutter = numParam(p, 'clutter', 10);
  for (let c = 0; c < clutter; c++) {
    const cx = rng.float(8, W - 8);
    const cy = rng.float(8, H - 8);
    const n = rng.int(3, 9);
    for (let k = 0; k < n; k++)
      setKind(map, Math.floor(cx + rng.float(-2.2, 2.2)), Math.floor(cy + rng.float(-2.2, 2.2)), 'rock');
  }

  const layout = emptyLayout(map, { x: W / 2, y: H / 2 }, ground, 'rock');

  // --- exits
  const sides = strParam(p, 'sides', 'WENS');
  let sideIdx = 0;
  const roadPoints: Vec2[] = [];
  let startHint: Vec2 | null = null;
  for (const link of spec.links ?? ([] as LinkDef[])) {
    if (link.kind === 'edge') {
      const side = sides[sideIdx++ % sides.length] ?? 'W';
      const pos = sidePoint(side, W, H, rng);
      // open the border: road strip from the edge inward
      const dx = side === 'W' ? 1 : side === 'E' ? -1 : 0;
      const dy = side === 'N' ? 1 : side === 'S' ? -1 : 0;
      const ex = side === 'W' ? 1 : side === 'E' ? W - 2 : pos.x;
      const ey = side === 'N' ? 1 : side === 'S' ? H - 2 : pos.y;
      for (let k = 0; k < 8; k++) paintRoad(map, ex + dx * k, ey + dy * k, 1.6);
      layout.exits.push({ pos, link, side });
      roadPoints.push(pos);
      if (!startHint) startHint = { x: pos.x + dx * 7, y: pos.y + dy * 7 };
    } else {
      // stairs / door / portal: a clearing somewhere in the interior
      const pos = { x: Math.floor(rng.float(14, W - 14)) + 0.5, y: Math.floor(rng.float(14, H - 14)) + 0.5 };
      carveDisc(map, pos.x, pos.y, 3.5, ground);
      layout.exits.push({ pos, link });
      roadPoints.push(pos);
    }
  }
  const start: Vec2 = startHint ?? {
    x: Math.floor(rng.float(8, W * 0.3)) + 0.5,
    y: Math.floor(rng.float(H * 0.3, H * 0.7)) + 0.5,
  };
  layout.start = start;
  carveDisc(map, start.x, start.y, 3, ground);

  // --- waypoint plaza
  const keyPoints: Vec2[] = [start, ...roadPoints];
  if (spec.waypoint) {
    const wp = {
      x: Math.floor(rng.float(W * 0.3, W * 0.7)) + 0.5,
      y: Math.floor(rng.float(H * 0.3, H * 0.7)) + 0.5,
    };
    carveDisc(map, wp.x, wp.y, 4.5, 'road');
    layout.waypoint = wp;
    keyPoints.push(wp);
    layout.regions.push({ x: Math.floor(wp.x - 4), y: Math.floor(wp.y - 4), w: 9, h: 9, tag: 'waypoint' });
  }

  // --- clearings
  const clearings: { p: Vec2; r: number }[] = [];
  const nClear = numParam(p, 'clearings', 3);
  for (let c = 0; c < nClear; c++) {
    const cp = { x: Math.floor(rng.float(12, W - 12)) + 0.5, y: Math.floor(rng.float(12, H - 12)) + 0.5 };
    const r = rng.float(4, 7);
    carveDisc(map, cp.x, cp.y, r, ground);
    clearings.push({ p: cp, r });
  }
  // quest-object ring clearing
  const questObject = strParam(p, 'questObject', '');
  if (questObject) {
    const qp = {
      x: Math.floor(rng.float(W * 0.25, W * 0.75)) + 0.5,
      y: Math.floor(rng.float(H * 0.25, H * 0.75)) + 0.5,
    };
    carveDisc(map, qp.x, qp.y, 6, ground);
    clearings.push({ p: qp, r: 6 });
    layout.fixed.push({ kind: 'questObject', pos: qp, ref: questObject });
    const stones = numParam(p, 'stones', 7);
    for (let s = 0; s < stones; s++) {
      const a = (s / stones) * Math.PI * 2;
      layout.fixed.push({
        kind: 'prop',
        pos: { x: qp.x + Math.cos(a) * 4, y: qp.y + Math.sin(a) * 4 },
        ref: 'prop.standingStone',
        facing: a,
      });
    }
  }
  // boss clearing: farthest clearing from the start
  if ((spec.bosses?.length ?? 0) > 0 && clearings.length > 0) {
    let far = clearings[0] as { p: Vec2; r: number };
    for (const c of clearings)
      if (Math.hypot(c.p.x - start.x, c.p.y - start.y) > Math.hypot(far.p.x - start.x, far.p.y - start.y))
        far = c;
    layout.bossSpots.push(far.p);
  }
  for (const c of clearings) {
    keyPoints.push(c.p);
    layout.regions.push({
      x: Math.floor(c.p.x - c.r),
      y: Math.floor(c.p.y - c.r),
      w: Math.ceil(c.r * 2),
      h: Math.ceil(c.r * 2),
      tag: 'clearing',
    });
  }

  // --- roads (Prim over key points)
  const connected: Vec2[] = [keyPoints[0] as Vec2];
  const rest = keyPoints.slice(1);
  const roadW = numParam(p, 'roadWidth', 3);
  while (rest.length > 0) {
    let bi = 0;
    let bj = 0;
    let bd = Infinity;
    for (let i = 0; i < rest.length; i++)
      for (let j = 0; j < connected.length; j++) {
        const d = Math.hypot(
          (rest[i] as Vec2).x - (connected[j] as Vec2).x,
          (rest[i] as Vec2).y - (connected[j] as Vec2).y,
        );
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    const a = connected[bj] as Vec2;
    const b = rest.splice(bi, 1)[0] as Vec2;
    windRoad(map, rng, a, b, roadW, boolParam(p, 'straight', false) ? 0 : 7);
    connected.push(b);
  }
  // an extra loop road for variety
  if (keyPoints.length > 3) {
    const a = rng.pick(keyPoints);
    const b = rng.pick(keyPoints);
    if (a !== b) windRoad(map, rng, a, b, 2, 6);
  }

  layout.lightSpots.push(...clearings.map((c) => c.p));
  layout.regions.push({ x: 0, y: 0, w: W, h: H, tag: 'outdoor' });
  return layout;
}
