/**
 * D2-style dungeon: random rooms joined by (Prim + a few loop) corridors, doors on chokepoints,
 * dead-end stubs with chests, stairs / boss placed by BFS distance. Walls are 1 tile thick.
 *
 * genParams: width, height (32..128, default 64), rooms (target, default 12), minRoom, maxRoom,
 *   loops (0..1 fraction of extra corridors), deadEnds, corridorWidth (1|2), doorChance.
 */
import type { Rng } from '../../rng';
import type { Vec2 } from '../../types';
import { createMap, distanceField, setKind, setKindAt, walkableAt } from '../grid';
import { clamp, emptyLayout, numParam, type Layout, type LevelSpec, type LinkDef } from './common';

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export function generateMaze(spec: LevelSpec, rng: Rng): Layout {
  const p = spec.genParams;
  const W = Math.round(clamp(numParam(p, 'width', 64), 32, 128));
  const H = Math.round(clamp(numParam(p, 'height', 64), 32, 128));
  const target = Math.round(clamp(numParam(p, 'rooms', 12), 3, 60));
  const minR = Math.round(clamp(numParam(p, 'minRoom', 4), 3, 12));
  const maxR = Math.round(clamp(numParam(p, 'maxRoom', 10), minR, 20));
  const cw = Math.round(clamp(numParam(p, 'corridorWidth', 1), 1, 2));
  const map = createMap(W, H, 'void');

  // --- rooms
  const rooms: Room[] = [];
  const mk = (x: number, y: number, w: number, h: number): Room => ({
    x,
    y,
    w,
    h,
    cx: x + Math.floor(w / 2),
    cy: y + Math.floor(h / 2),
  });
  for (let a = 0; a < target * 40 && rooms.length < target; a++) {
    const w = rng.int(minR, maxR);
    const h = rng.int(minR, maxR);
    if (w > W - 6 || h > H - 6) continue;
    const x = rng.int(2, W - w - 3);
    const y = rng.int(2, H - h - 3);
    const gap = 3;
    if (
      rooms.some((o) => x - gap < o.x + o.w && x + w + gap > o.x && y - gap < o.y + o.h && y + h + gap > o.y)
    )
      continue;
    rooms.push(mk(x, y, w, h));
  }
  if (rooms.length < 2) {
    rooms.length = 0;
    rooms.push(mk(4, 4, 6, 6), mk(W - 12, H - 12, 6, 6));
  }
  const inRoom = new Uint8Array(W * H);
  for (const r of rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        setKind(map, x, y, 'floor');
        inRoom[y * W + x] = 1;
      }

  // --- corridors
  const corr = new Uint8Array(W * H);
  const carveCorr = (x: number, y: number): void => {
    for (let dy = 0; dy < cw; dy++)
      for (let dx = 0; dx < cw; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) continue;
        const i = ty * W + tx;
        if (inRoom[i]) continue;
        if (map.walkable[i] === 0) {
          setKindAt(map, i, 'floor');
          corr[i] = 1;
        }
      }
  };
  const connect = (a: Room, b: Room): void => {
    const horizFirst = rng.chance(0.5);
    let x = a.cx;
    let y = a.cy;
    const stepX = (): void => {
      while (x !== b.cx) {
        x += Math.sign(b.cx - x);
        carveCorr(x, y);
      }
    };
    const stepY = (): void => {
      while (y !== b.cy) {
        y += Math.sign(b.cy - y);
        carveCorr(x, y);
      }
    };
    if (horizFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
  };
  const done = new Set<number>([0]);
  const edges = new Set<string>();
  while (done.size < rooms.length) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (const j of done)
      for (let i = 0; i < rooms.length; i++) {
        if (done.has(i)) continue;
        const d =
          Math.abs((rooms[i] as Room).cx - (rooms[j] as Room).cx) +
          Math.abs((rooms[i] as Room).cy - (rooms[j] as Room).cy);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    connect(rooms[bj] as Room, rooms[bi] as Room);
    edges.add(`${Math.min(bi, bj)}-${Math.max(bi, bj)}`);
    done.add(bi);
  }
  const loops = Math.round(rooms.length * clamp(numParam(p, 'loops', 0.2), 0, 1));
  for (let l = 0; l < loops; l++) {
    const i = rng.int(0, rooms.length - 1);
    const j = rng.int(0, rooms.length - 1);
    const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
    if (i === j || edges.has(key)) continue;
    edges.add(key);
    connect(rooms[i] as Room, rooms[j] as Room);
  }

  const layout = emptyLayout(map, { x: 0, y: 0 }, 'floor', 'void');
  layout.wallify = true;

  // --- dead-end stubs (optionally with a chest at the end)
  const nDead = numParam(p, 'deadEnds', 3);
  const isVoid = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && map.walkable[y * W + x] === 0;
  for (let d = 0; d < nDead; d++) {
    const r = rng.pick(rooms);
    const dir = rng.int(0, 3);
    const dx = dir === 0 ? -1 : dir === 1 ? 1 : 0;
    const dy = dir === 2 ? -1 : dir === 3 ? 1 : 0;
    const startX = dir === 0 ? r.x - 1 : dir === 1 ? r.x + r.w : rng.int(r.x, r.x + r.w - 1);
    const startY = dir === 2 ? r.y - 1 : dir === 3 ? r.y + r.h : rng.int(r.y, r.y + r.h - 1);
    const len = rng.int(4, 9);
    let ok = true;
    for (let k = 0; k < len + 1 && ok; k++) {
      const x = startX + dx * k;
      const y = startY + dy * k;
      if (!isVoid(x, y)) ok = false;
      // keep a void margin on both sides so we don't merge with other passages
      if (dx === 0 ? !(isVoid(x - 1, y) && isVoid(x + 1, y)) : !(isVoid(x, y - 1) && isVoid(x, y + 1)))
        ok = false;
    }
    const ex = startX + dx * (len + 1);
    const ey = startY + dy * (len + 1);
    if (!ok || !isVoid(ex, ey)) continue;
    for (let k = 0; k <= len; k++) {
      const x = startX + dx * k;
      const y = startY + dy * k;
      setKind(map, x, y, 'floor');
      corr[y * W + x] = 1;
    }
    const end: Vec2 = { x: startX + dx * len + 0.5, y: startY + dy * len + 0.5 };
    layout.lightSpots.push(end);
    if (rng.chance(0.6))
      layout.fixed.push({ kind: 'chest', pos: end, ref: 'obj.chest', data: { deadEnd: true } });
  }

  // --- doors on 1-wide chokepoints leaving rooms
  const doorChance = clamp(numParam(p, 'doorChance', 0.5), 0, 1);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!corr[i] || map.kinds[i] !== 'floor') continue;
      const l = walkableAt(map, x - 1, y);
      const r = walkableAt(map, x + 1, y);
      const u = walkableAt(map, x, y - 1);
      const dn = walkableAt(map, x, y + 1);
      const horizontal = l && r && !u && !dn && (inRoom[i - 1] === 1 || inRoom[i + 1] === 1);
      const vertical = u && dn && !l && !r && (inRoom[i - W] === 1 || inRoom[i + W] === 1);
      if ((horizontal || vertical) && rng.chance(doorChance)) setKindAt(map, i, 'door');
    }

  // --- roles by BFS distance from the start room
  const startRoom = rng.pick(rooms);
  layout.start = { x: startRoom.cx + 0.5, y: startRoom.cy + 0.5 };
  const dist = distanceField(map, startRoom.cx, startRoom.cy);
  const byDist = rooms
    .filter((r) => r !== startRoom)
    .map((r) => ({ r, d: dist[r.cy * W + r.cx] as number }))
    .sort((a, b) => b.d - a.d)
    .map((o) => o.r);
  const used: Vec2[] = [layout.start];
  const spotIn = (r: Room): Vec2 => {
    let best: Vec2 = { x: r.cx + 0.5, y: r.cy + 0.5 };
    let bestScore = -1;
    for (let k = 0; k < 24; k++) {
      const c = { x: rng.int(r.x, r.x + r.w - 1) + 0.5, y: rng.int(r.y, r.y + r.h - 1) + 0.5 };
      const score = Math.min(99, ...used.map((u) => Math.hypot(u.x - c.x, u.y - c.y)));
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    used.push(best);
    return best;
  };

  const bosses = spec.bosses ?? [];
  const freeRooms = [...byDist];
  bosses.forEach((_, i) => {
    const r = freeRooms.shift();
    if (r) layout.bossSpots.push({ x: r.cx + 0.5 + (i ? 1 : 0), y: r.cy + 0.5 });
    if (r) used.push(layout.bossSpots[layout.bossSpots.length - 1] as Vec2);
  });

  const links: LinkDef[] = spec.links ?? [];
  const take = (kind: LinkDef['kind']): Room | undefined => {
    if (kind === 'stairsUp') return startRoom;
    if (kind === 'stairsDown') return freeRooms.shift() ?? byDist[0];
    const idx = freeRooms.length > 0 ? rng.int(0, freeRooms.length - 1) : -1;
    return idx >= 0 ? freeRooms.splice(idx, 1)[0] : byDist[0];
  };
  // stairsDown first so it claims the farthest remaining room
  const ordered = [...links].sort(
    (a, b) => (a.kind === 'stairsDown' ? -1 : 0) - (b.kind === 'stairsDown' ? -1 : 0),
  );
  for (const link of ordered) {
    const r = take(link.kind) ?? startRoom;
    layout.exits.push({ pos: spotIn(r), link });
  }

  if (spec.waypoint) {
    const mid = byDist.length > 0 ? (byDist[Math.floor(byDist.length / 2)] as Room) : startRoom;
    layout.waypoint = spotIn(mid);
  }

  // --- pack hints: every non-start room is a pack candidate handled by density; add regions
  rooms.forEach((r, idx) => {
    layout.lightSpots.push({ x: r.cx + 0.5, y: r.cy + 0.5 });
    const tag =
      r === startRoom
        ? 'start'
        : layout.bossSpots.some(
              (b) =>
                Math.floor(b.x) >= r.x &&
                Math.floor(b.x) < r.x + r.w &&
                Math.floor(b.y) >= r.y &&
                Math.floor(b.y) < r.y + r.h,
            )
          ? 'boss'
          : 'room';
    layout.regions.push({ x: r.x, y: r.y, w: r.w, h: r.h, tag: `${tag}` });
    void idx;
  });
  return layout;
}
