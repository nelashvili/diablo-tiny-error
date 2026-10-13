/**
 * Preset + town generators: stitch handmade ASCII templates (see templates.ts) onto a canvas,
 * connect them with corridors, and read markers into placements.
 *
 * genParams: template (id) or templates (string[]), layout ('row'|'column', default 'row'),
 *   gap (default 8), margin (default 3), flip (default true), npcs (string[] def ids for digit
 *   markers), questObject (def id for 'Q' markers).
 */
import type { Rng } from '../../rng';
import type { Vec2 } from '../../types';
import { createMap, setKind, digL, walkableAt } from '../grid';
import type { TileKind } from '../types';
import {
  boolParam,
  clamp,
  emptyLayout,
  listParam,
  numParam,
  strParam,
  type Layout,
  type LevelSpec,
  type LinkDef,
} from './common';
import { getTemplate, type PresetTemplate } from './templates';

const TERRAIN: Record<string, TileKind | undefined> = {
  '#': 'wall',
  '.': undefined, // template floor
  ',': 'grass',
  '=': 'road',
  s: 'sand',
  '~': 'water',
  ':': 'pit',
  R: 'rock',
  D: 'door',
  '<': 'stairsUp',
  '>': 'stairsDown',
  '+': 'bridge',
};
const MARKERS = new Set('SWEBCMHTLPQ0123456789'.split(''));

interface Placed {
  t: PresetTemplate;
  ox: number;
  oy: number;
  w: number;
  h: number;
  rows: string[];
}

function normalize(
  t: PresetTemplate,
  flipX: boolean,
  flipY: boolean,
): { rows: string[]; w: number; h: number } {
  const w = Math.max(...t.rows.map((r) => r.length));
  let rows = t.rows.map((r) => r.padEnd(w, ' '));
  if (flipX) rows = rows.map((r) => [...r].reverse().join(''));
  if (flipY) rows = [...rows].reverse();
  return { rows, w, h: rows.length };
}

export function generatePreset(spec: LevelSpec, rng: Rng): Layout {
  const p = spec.genParams;
  const ids = listParam(p, 'templates').concat(listParam(p, 'template'));
  const templates: PresetTemplate[] = [];
  for (const id of ids) {
    const t = getTemplate(id);
    if (!t) throw new Error(`[mapgen] unknown template "${id}" for ${spec.id}`);
    templates.push(t);
  }
  if (templates.length === 0) {
    const t = getTemplate(spec.gen === 'town' ? 'town.a1' : 'crashSite');
    if (t) templates.push(t);
  }
  const vertical = strParam(p, 'layout', 'row') === 'column';
  const gap = Math.round(clamp(numParam(p, 'gap', 8), 3, 24));
  const margin = Math.round(clamp(numParam(p, 'margin', 3), 0, 12));
  const allowFlip = boolParam(p, 'flip', true);

  // --- place templates
  const placed: Placed[] = [];
  let cursor = margin;
  let maxCross = 0;
  for (const t of templates) {
    const fx = allowFlip && !t.fixed && rng.chance(0.5);
    const fy = allowFlip && !t.fixed && rng.chance(0.5);
    const n = normalize(t, fx, fy);
    placed.push({
      t,
      ox: vertical ? margin : cursor,
      oy: vertical ? cursor : margin,
      w: n.w,
      h: n.h,
      rows: n.rows,
    });
    cursor += (vertical ? n.h : n.w) + gap;
    maxCross = Math.max(maxCross, vertical ? n.w : n.h);
  }
  const W = vertical ? maxCross + margin * 2 : cursor - gap + margin;
  const H = vertical ? cursor - gap + margin : maxCross + margin * 2;
  const outsideKind: TileKind = (templates[0] as PresetTemplate).outside;
  const map = createMap(W, H, outsideKind);
  const layout = emptyLayout(
    map,
    { x: 1.5, y: 1.5 },
    (templates[0] as PresetTemplate).floor,
    outsideKind === 'void' ? 'void' : 'rock',
  );
  layout.wallify = outsideKind === 'void';

  const npcs = listParam(p, 'npcs');
  const questRef = strParam(p, 'questObject', '');
  const startSpots: Vec2[] = [];
  const exitSpots: Vec2[] = [];
  const waypointSpots: Vec2[] = [];
  const bossSpots: Vec2[] = [];

  for (const pl of placed) {
    const floor = pl.t.floor;
    layout.regions.push({ x: pl.ox, y: pl.oy, w: pl.w, h: pl.h, tag: pl.t.id });
    for (let y = 0; y < pl.h; y++)
      for (let x = 0; x < pl.w; x++) {
        const ch = (pl.rows[y] as string)[x] as string;
        if (ch === ' ') continue;
        const gx = pl.ox + x;
        const gy = pl.oy + y;
        const c: Vec2 = { x: gx + 0.5, y: gy + 0.5 };
        if (ch in TERRAIN) {
          setKind(map, gx, gy, TERRAIN[ch] ?? floor);
          continue;
        }
        if (!MARKERS.has(ch)) {
          setKind(map, gx, gy, floor);
          continue;
        }
        setKind(map, gx, gy, floor);
        switch (ch) {
          case 'S':
            startSpots.push(c);
            break;
          case 'W':
            waypointSpots.push(c);
            break;
          case 'E':
            exitSpots.push(c);
            break;
          case 'B':
            bossSpots.push(c);
            break;
          case 'C':
            layout.fixed.push({ kind: 'chest', pos: c, ref: 'obj.chest' });
            break;
          case 'M':
            layout.packSpots.push(c);
            break;
          case 'H':
            layout.fixed.push({ kind: 'shrine', pos: c, ref: 'obj.shrine' });
            break;
          case 'T':
            layout.fixed.push({ kind: 'stash', pos: c, ref: 'obj.stash' });
            break;
          case 'L':
            layout.lightSpots.push(c);
            break;
          case 'P':
            layout.fixed.push({ kind: 'prop', pos: c, ref: 'prop.crate', facing: rng.float(0, Math.PI * 2) });
            break;
          case 'Q':
            layout.fixed.push({ kind: 'questObject', pos: c, ref: questRef || 'obj.questObject' });
            break;
          default: {
            const slot = Number(ch);
            const ref = npcs[slot];
            if (ref)
              layout.fixed.push({
                kind: 'npc',
                pos: c,
                ref,
                facing: rng.float(0, Math.PI * 2),
                data: { slot },
              });
          }
        }
      }
  }

  // --- stitch consecutive templates with corridors
  for (let i = 0; i + 1 < placed.length; i++) {
    const a = placed[i] as Placed;
    const b = placed[i + 1] as Placed;
    const bc = { x: b.ox + b.w / 2, y: b.oy + b.h / 2 };
    const ac = { x: a.ox + a.w / 2, y: a.oy + a.h / 2 };
    const nearest = (pl: Placed, tx: number, ty: number): Vec2 => {
      let best: Vec2 = { x: pl.ox + 1, y: pl.oy + 1 };
      let bd = Infinity;
      for (let y = pl.oy; y < pl.oy + pl.h; y++)
        for (let x = pl.ox; x < pl.ox + pl.w; x++) {
          if (!walkableAt(map, x, y)) continue;
          const d = (x - tx) ** 2 + (y - ty) ** 2;
          if (d < bd) {
            bd = d;
            best = { x, y };
          }
        }
      return best;
    };
    const pa = nearest(a, bc.x, bc.y);
    const pb = nearest(b, ac.x, ac.y);
    digL(map, pa.x, pa.y, pb.x, pb.y, layout.carve, !vertical);
  }

  // --- resolve roles
  const firstWalkable = (): Vec2 => {
    for (let i = 0; i < map.walkable.length; i++)
      if (map.walkable[i] === 1) return { x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 };
    return { x: 1.5, y: 1.5 };
  };
  layout.start = startSpots[0] ?? exitSpots[0] ?? firstWalkable();
  if (spec.waypoint && waypointSpots[0]) layout.waypoint = waypointSpots[0];
  else if (spec.waypoint) layout.waypoint = layout.start;
  layout.bossSpots = bossSpots;

  const links: LinkDef[] = spec.links ?? [];
  links.forEach((link, i) => {
    const pos = exitSpots[i];
    if (pos) layout.exits.push({ pos, link });
    else layout.pendingLinks.push(link);
  });
  return layout;
}
