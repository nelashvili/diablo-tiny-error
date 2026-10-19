/**
 * Ground look per tileset: four splat layers (painted CC0 textures from public/assets/textures/ground,
 * see scripts/assets/build-textures.mjs) and which layer each tile kind shows. Layer 0 also blends in a
 * second texture by large-scale noise, so wide grass fields aren't one repeating pattern.
 */
import type { TileKind } from '../../core/world/types';

export interface GroundLayer {
  /** Texture name under /assets/textures/ground (without .jpg). */
  tex: string;
  /** World tiles covered by one texture repeat. */
  scale: number;
  /** Color multiplier (sRGB hex); 0xffffff = as painted. */
  tint: number;
}

export interface GroundSet {
  layers: [GroundLayer, GroundLayer, GroundLayer, GroundLayer];
  /** Blended into layer 0 by macro noise. */
  variation: GroundLayer;
  /** Splat layer per tile kind; kinds left out (walls, void) borrow the ground around them. */
  kindLayer: Partial<Record<TileKind, number>>;
  /** Water surface color (shallow, deep). */
  water: [number, number];
}

const L = (tex: string, scale: number, tint = 0xffffff): GroundLayer => ({ tex, scale, tint });

const OUTDOOR_KINDS: GroundSet['kindLayer'] = {
  grass: 0,
  floor: 0,
  road: 1,
  bridge: 1,
  door: 1,
  stairsUp: 1,
  stairsDown: 1,
  sand: 2,
  water: 2,
  pit: 3,
  rock: 3,
};

const SETS: { match: RegExp; set: GroundSet }[] = [
  {
    // Endoor camp: packed earth around the tents, cobbled lanes, grass at the edges.
    match: /town/i,
    set: {
      layers: [
        L('grass', 3, 0xd8e0c0),
        L('cobble', 2.5, 0xd8d0c4),
        L('dirt', 4, 0xe8dcc8),
        L('dirtCracked', 3),
      ],
      variation: L('grassDark', 5, 0xc8d8b0),
      kindLayer: { ...OUTDOOR_KINDS, floor: 2, road: 1 },
      water: [0x4aa0b8, 0x1a4a66],
    },
  },
  {
    match: /cave|den|crypt|mine/i,
    set: {
      layers: [
        L('moss', 3, 0x9aa890),
        L('dirtCracked', 3, 0x9a8a7a),
        L('dirtDark', 4, 0x8a8078),
        L('dirtCracked', 2.5, 0x6a625a),
      ],
      variation: L('dirtDark', 5, 0x8a9480),
      kindLayer: { ...OUTDOOR_KINDS, floor: 2, grass: 0, road: 1 },
      water: [0x2f5f6a, 0x0e2430],
    },
  },
  {
    match: /temple|ruin|tower|undercroft|vault/i,
    set: {
      layers: [
        L('grassDark', 3, 0xb8c4a0),
        L('cobble', 2.5, 0xc8c4c0),
        L('dirtDark', 4, 0xb0a494),
        L('cobble', 2, 0x9a968e),
      ],
      variation: L('moss', 5),
      kindLayer: { ...OUTDOOR_KINDS, floor: 3, road: 1, grass: 0 },
      water: [0x3a7a8a, 0x123040],
    },
  },
  {
    match: /desert|sand|tatoo|dune/i,
    set: {
      layers: [L('sandWaves', 4), L('dirtCracked', 3, 0xf0d8b0), L('sand', 4), L('dirt', 4, 0xd8b890)],
      variation: L('sand', 6, 0xf0e0c0),
      kindLayer: { ...OUTDOOR_KINDS, floor: 0, sand: 2 },
      water: [0x4ab0c0, 0x1a5a70],
    },
  },
];

/** Default: Endoor forest (grass fields, dirt paths). */
const FOREST: GroundSet = {
  layers: [L('grass', 3, 0xd0dcb8), L('dirt', 4, 0xe0d0b8), L('sand', 4, 0xe8dcc0), L('dirtCracked', 3)],
  variation: L('grassDark', 5, 0xc0d4a8),
  kindLayer: OUTDOOR_KINDS,
  water: [0x3f8fb0, 0x14405a],
};

export function groundSetFor(tileset: string): GroundSet {
  for (const s of SETS) if (s.match.test(tileset)) return s.set;
  return FOREST;
}

/** Splat layer of a tile kind in a ground set (-1: no ground of its own). */
export function layerOfKind(set: GroundSet, kind: TileKind): number {
  return set.kindLayer[kind] ?? -1;
}
