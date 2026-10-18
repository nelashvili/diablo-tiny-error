/**
 * Shared generator plumbing: every generator produces a `Layout` (tile map + key positions), and
 * `finalize` turns it into a `GeneratedLevel`: guarantees connectivity, seals unreachable pockets,
 * and fills monsters / bosses / chests / shrines / props / lights.
 */
import type { Rng } from '../../rng';
import type { Vec2 } from '../../types';
import type { LevelDef } from '../../../data/schema';
import { center, distanceField, digL, setKind, setKindAt, walkableAt } from '../grid';
import type { GeneratedLevel, Placement, TileKind, TileMap } from '../types';

export type LinkDef = LevelDef['links'][number];

/** The subset of LevelDef the generators read. Extra fields are optional so old callers still work. */
export type LevelSpec = Pick<LevelDef, 'id' | 'gen' | 'genParams'> &
  Partial<
    Pick<
      LevelDef,
      | 'links'
      | 'monsters'
      | 'density'
      | 'champions'
      | 'uniques'
      | 'waypoint'
      | 'bosses'
      | 'isTown'
      | 'tileset'
    >
  >;

export interface ExitSlot {
  pos: Vec2;
  link: LinkDef;
  side?: string;
}

export interface Layout {
  map: TileMap;
  start: Vec2;
  waypoint?: Vec2;
  exits: ExitSlot[];
  /** Links the generator did not place; finalize puts them on far-away floor. */
  pendingLinks: LinkDef[];
  bossSpots: Vec2[];
  /** Fully formed placements supplied by the generator (templates, dead-end chests, npcs...). */
  fixed: Placement[];
  packSpots: Vec2[];
  lightSpots: Vec2[];
  regions: GeneratedLevel['regions'];
  /** Tile kind used when digging connectivity corridors. */
  carve: TileKind;
  /** Tile kind used to fill unreachable walkable pockets. */
  seal: TileKind;
  /** Convert void/wall tiles to 1-thick walls hugging the walkable area. */
  wallify: boolean;
}

export function emptyLayout(map: TileMap, start: Vec2, carve: TileKind, seal: TileKind): Layout {
  return {
    map,
    start,
    exits: [],
    pendingLinks: [],
    bossSpots: [],
    fixed: [],
    packSpots: [],
    lightSpots: [],
    regions: [],
    carve,
    seal,
    wallify: false,
  };
}

// ------------------------------------------------------------------ params

export type Params = LevelDef['genParams'];
export const numParam = (p: Params, key: string, def: number): number => {
  const v = p[key];
  return typeof v === 'number' ? v : def;
};
export const strParam = (p: Params, key: string, def: string): string => {
  const v = p[key];
  return typeof v === 'string' ? v : def;
};
export const boolParam = (p: Params, key: string, def: boolean): boolean => {
  const v = p[key];
  return typeof v === 'boolean' ? v : def;
};
export const listParam = (p: Params, key: string): string[] => {
  const v = p[key];
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
};
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const tileCenter = (i: number, w: number): Vec2 => {
  const x = i % w;
  return { x: x + 0.5, y: (i - x) / w + 0.5 };
};

// ------------------------------------------------------------------ connectivity

/** Make sure every required point is reachable from `start`, digging L-corridors if not. */
export function ensureConnected(layout: Layout, points: Vec2[]): void {
  const { map } = layout;
  const sx = Math.floor(layout.start.x);
  const sy = Math.floor(layout.start.y);
  if (!walkableAt(map, sx, sy)) setKind(map, sx, sy, layout.carve);
  for (const p of points) {
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    if (!walkableAt(map, px, py)) setKind(map, px, py, layout.carve);
    const dist = distanceField(map, sx, sy);
    if ((dist[py * map.width + px] as number) >= 0) continue;
    // nearest reached tile to p
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < dist.length; i++) {
      if ((dist[i] as number) < 0) continue;
      const x = i % map.width;
      const y = (i - x) / map.width;
      const d = Math.abs(x - px) + Math.abs(y - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) continue;
    const bx = best % map.width;
    const by = (best - bx) / map.width;
    digL(map, px, py, bx, by, layout.carve, true);
    // the L may still not touch if clamped; retry other orientation
    const again = distanceField(map, sx, sy);
    if ((again[py * map.width + px] as number) < 0) digL(map, px, py, bx, by, layout.carve, false);
  }
}

/** Turn walkable tiles unreachable from start into `seal` tiles. Returns the reach distance field. */
export function sealPockets(layout: Layout): Int32Array {
  const { map } = layout;
  const sx = Math.floor(layout.start.x);
  const sy = Math.floor(layout.start.y);
  const dist = distanceField(map, sx, sy);
  for (let i = 0; i < dist.length; i++)
    if (map.walkable[i] === 1 && (dist[i] as number) < 0) setKindAt(map, i, layout.seal);
  return dist;
}

/** Void/wall tiles touching walkable ground become 'wall'; the rest 'void' (1-thick walls). */
export function wallify(map: TileMap): void {
  const { width: w, height: h } = map;
  const touches = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (map.walkable[ny * w + nx] === 1) return true;
      }
    return false;
  };
  const toWall: number[] = [];
  const toVoid: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = map.kinds[i];
      if (k !== 'void' && k !== 'wall') continue;
      (touches(x, y) ? toWall : toVoid).push(i);
    }
  for (const i of toWall) setKindAt(map, i, 'wall');
  for (const i of toVoid) setKindAt(map, i, 'void');
}

// ------------------------------------------------------------------ population

const PROPS: Record<string, string[]> = {
  forest: ['prop.tree', 'prop.bush', 'prop.stump', 'prop.fern', 'prop.mushroom'],
  cave: ['prop.stalagmite', 'prop.bones', 'prop.crate', 'prop.rubble'],
  temple: ['prop.pillar', 'prop.brazier', 'prop.statue', 'prop.rubble'],
  town: ['prop.crate', 'prop.barrel', 'prop.tent', 'prop.lamp'],
  desert: ['prop.dune', 'prop.skull', 'prop.cactus'],
  tech: ['prop.pipe', 'prop.console', 'prop.crate'],
};

const OPEN_KINDS = new Set<TileKind>(['floor', 'grass', 'sand', 'road']);

interface ScatterOpts {
  count: number;
  /** Min Euclidean distance from layout.start. */
  minStart?: number;
  spacing?: number;
  avoid?: { p: Vec2; r: number }[];
  nearWall?: boolean;
  minReach?: number;
}

function scatter(
  rng: Rng,
  map: TileMap,
  cands: number[],
  dist: Int32Array,
  start: Vec2,
  o: ScatterOpts,
  existing: Vec2[],
): Vec2[] {
  const out: Vec2[] = [];
  if (cands.length === 0 || o.count <= 0) return out;
  const spacing2 = (o.spacing ?? 0) ** 2;
  const minStart2 = (o.minStart ?? 0) ** 2;
  let tries = o.count * 40;
  while (out.length < o.count && tries-- > 0) {
    const i = cands[rng.int(0, cands.length - 1)] as number;
    if (o.minReach !== undefined && (dist[i] as number) < o.minReach) continue;
    const p = tileCenter(i, map.width);
    if ((p.x - start.x) ** 2 + (p.y - start.y) ** 2 < minStart2) continue;
    if (o.nearWall) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (
        walkableAt(map, x - 1, y) &&
        walkableAt(map, x + 1, y) &&
        walkableAt(map, x, y - 1) &&
        walkableAt(map, x, y + 1)
      )
        continue;
    }
    let bad = false;
    if (o.avoid)
      for (const a of o.avoid)
        if ((p.x - a.p.x) ** 2 + (p.y - a.p.y) ** 2 < a.r * a.r) {
          bad = true;
          break;
        }
    if (bad) continue;
    if (spacing2 > 0) {
      for (const q of out) if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < spacing2) bad = true;
      for (const q of existing) if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < spacing2) bad = true;
      if (bad) continue;
    }
    out.push(p);
  }
  return out;
}

export function finalize(spec: LevelSpec, layout: Layout, rng: Rng, seed: number): GeneratedLevel {
  const { map } = layout;
  const isTown = spec.isTown === true || spec.gen === 'town';

  // 1. connectivity -----------------------------------------------------------------
  const required: Vec2[] = [layout.start, ...layout.exits.map((e) => e.pos), ...layout.bossSpots];
  if (layout.waypoint) required.push(layout.waypoint);
  for (const f of layout.fixed) required.push(f.pos);
  for (const p of layout.packSpots) required.push(p);
  ensureConnected(layout, required);
  let dist = sealPockets(layout);

  // 2. pending exits on far-away floor ------------------------------------------------
  const openCands = (): number[] => {
    const c: number[] = [];
    for (let i = 0; i < map.walkable.length; i++)
      if (map.walkable[i] === 1 && (dist[i] as number) >= 0 && OPEN_KINDS.has(map.kinds[i] as TileKind))
        c.push(i);
    return c;
  };
  for (const link of layout.pendingLinks) {
    const cands = openCands();
    let best: Vec2 | undefined;
    let bestScore = -1;
    for (let k = 0; k < 80 && cands.length > 0; k++) {
      const p = tileCenter(cands[rng.int(0, cands.length - 1)] as number, map.width);
      let score = Math.hypot(p.x - layout.start.x, p.y - layout.start.y);
      for (const e of layout.exits) score = Math.min(score, Math.hypot(p.x - e.pos.x, p.y - e.pos.y));
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) layout.exits.push({ pos: best, link });
  }
  layout.pendingLinks = [];

  // 3. exit tile kinds ---------------------------------------------------------------
  for (const e of layout.exits) {
    const x = Math.floor(e.pos.x);
    const y = Math.floor(e.pos.y);
    if (e.link.kind === 'stairsDown') setKind(map, x, y, 'stairsDown');
    else if (e.link.kind === 'stairsUp') setKind(map, x, y, 'stairsUp');
    else if (e.link.kind === 'door') setKind(map, x, y, 'door');
  }

  if (layout.wallify) wallify(map);

  // variants
  for (let i = 0; i < map.variants.length; i++) map.variants[i] = rng.int(0, 255);

  // 4. placements --------------------------------------------------------------------
  const placements: Placement[] = [];
  placements.push({ kind: 'playerStart', pos: { ...layout.start } });
  if (layout.waypoint && spec.waypoint !== false)
    placements.push({ kind: 'waypoint', pos: { ...layout.waypoint }, ref: 'obj.waypoint' });
  for (const e of layout.exits) {
    const data: Record<string, number | string | boolean> = { linkKind: e.link.kind };
    if (e.side) data['side'] = e.side;
    placements.push({ kind: 'exit', pos: { ...e.pos }, ref: e.link.to, data });
  }
  for (const f of layout.fixed) placements.push(f);

  const pop = rng.fork('populate');
  dist = distanceField(map, Math.floor(layout.start.x), Math.floor(layout.start.y));
  const cands = openCands();
  const walkCount = cands.length;

  // Packs keep clear of where the player arrives (start + every entrance) so a level opens calmly.
  const keyPoints: { p: Vec2; r: number }[] = [{ p: layout.start, r: 20 }];
  for (const e of layout.exits) keyPoints.push({ p: e.pos, r: 16 });
  if (layout.waypoint) keyPoints.push({ p: layout.waypoint, r: 10 });

  const taken: Vec2[] = layout.fixed.map((f) => f.pos);

  // bosses
  const bosses = spec.bosses ?? [];
  if (!isTown && bosses.length > 0) {
    const spots = [...layout.bossSpots];
    const farCands = cands
      .filter((i) => (dist[i] as number) > 0)
      .sort((a, b) => (dist[b] as number) - (dist[a] as number));
    let fi = 0;
    while (spots.length < bosses.length && fi < farCands.length) {
      const p = tileCenter(farCands[fi] as number, map.width);
      fi += Math.max(1, Math.floor(farCands.length / 10));
      if (spots.every((s) => Math.hypot(s.x - p.x, s.y - p.y) > 10)) spots.push(p);
    }
    bosses.forEach((b, i) => {
      const pos = spots[i] ?? spots[0];
      if (pos) {
        placements.push({ kind: 'boss', pos: { ...pos }, ref: b });
        taken.push(pos);
        keyPoints.push({ p: pos, r: 6 });
      }
    });
  }

  // monster packs
  const monsters = spec.monsters ?? [];
  if (!isTown && monsters.length > 0) {
    for (const p of layout.packSpots)
      placements.push({
        kind: 'monsterPack',
        pos: { ...p },
        ref: pop.pick(monsters),
        data: { tier: 'normal' },
      });
    const want = Math.max(0, Math.round(((spec.density ?? 0.6) * walkCount) / 100) - layout.packSpots.length);
    const spots = scatter(
      pop,
      map,
      cands,
      dist,
      layout.start,
      {
        count: want,
        minStart: 22,
        spacing: 9,
        avoid: keyPoints,
      },
      [...taken, ...layout.packSpots],
    );
    for (const p of spots) {
      placements.push({ kind: 'monsterPack', pos: p, ref: pop.pick(monsters), data: { tier: 'normal' } });
      taken.push(p);
    }
    const champ = spec.champions ?? { min: 0, max: 0 };
    const uniq = spec.uniques ?? { min: 0, max: 0 };
    const nChamp = pop.int(champ.min, champ.max);
    const nUniq = pop.int(uniq.min, uniq.max);
    const extra = scatter(
      pop,
      map,
      cands,
      dist,
      layout.start,
      {
        count: nChamp + nUniq,
        minStart: 30,
        spacing: 9,
        avoid: keyPoints,
      },
      taken,
    );
    extra.forEach((p, i) => {
      placements.push({
        kind: 'monsterPack',
        pos: p,
        ref: pop.pick(monsters),
        data: { tier: i < nChamp ? 'champion' : 'unique' },
      });
      taken.push(p);
    });
  }

  // chests, shrines
  if (!isTown) {
    const nChest = Math.max(1, Math.round(walkCount / 900));
    for (const p of scatter(
      pop,
      map,
      cands,
      dist,
      layout.start,
      {
        count: nChest,
        minStart: 8,
        spacing: 10,
        nearWall: true,
        avoid: keyPoints.map((k) => ({ p: k.p, r: 4 })),
      },
      taken,
    )) {
      placements.push({ kind: 'chest', pos: p, ref: 'obj.chest' });
      taken.push(p);
    }
    const nShrine = walkCount > 600 ? pop.int(1, 2) : pop.int(0, 1);
    for (const p of scatter(
      pop,
      map,
      cands,
      dist,
      layout.start,
      {
        count: nShrine,
        minStart: 12,
        spacing: 12,
        avoid: keyPoints.map((k) => ({ p: k.p, r: 4 })),
      },
      taken,
    )) {
      placements.push({ kind: 'shrine', pos: p, ref: 'obj.shrine' });
      taken.push(p);
    }
  }

  // decoration props
  const family = (spec.tileset ?? 'endoor.forest').split('.')[1] ?? 'forest';
  const propSet = PROPS[family] ?? PROPS['forest'] ?? [];
  const nProps = Math.min(400, Math.round(walkCount / 45));
  for (const p of scatter(
    pop,
    map,
    cands,
    dist,
    layout.start,
    {
      count: nProps,
      spacing: 2.5,
      nearWall: true,
      avoid: keyPoints.map((k) => ({ p: k.p, r: 3 })),
    },
    taken,
  ))
    placements.push({ kind: 'prop', pos: p, ref: pop.pick(propSet), facing: pop.float(0, Math.PI * 2) });

  // lights
  const lights: Vec2[] = [layout.start, ...layout.exits.map((e) => e.pos), ...layout.lightSpots];
  if (layout.waypoint) lights.push(layout.waypoint);
  for (const p of lights)
    placements.push({
      kind: 'light',
      pos: { ...p },
      data: { color: '#ffcf8a', intensity: 1, radius: 8 },
    });

  const regions =
    layout.regions.length > 0 ? layout.regions : [{ x: 0, y: 0, w: map.width, h: map.height, tag: 'level' }];
  return { levelId: spec.id, seed, map, placements, regions };
}

export { center };
