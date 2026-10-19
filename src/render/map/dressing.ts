/**
 * Map dressing: which models stand in for generic prop refs from mapgen (`prop.tree` -> one of several
 * trees) and which tile kinds are drawn as scattered props instead of stretched blocks (forest walls
 * become a tree line, rock tiles become boulders). Pure: callers pass a hash in [0, 1).
 */
import type { TileKind } from '../../core/world/types';

/** Generic mapgen prop ref -> catalog models picked per placement. */
const PROP_VARIANTS: Record<string, readonly string[]> = {
  'prop.tree': ['prop.tree.pine', 'prop.tree.pineRound', 'prop.tree.oak', 'prop.tree.fat'],
  'prop.bush': ['prop.bush', 'prop.bush.large'],
  'prop.fern': ['prop.grass', 'prop.bush', 'prop.flowers'],
  'prop.mushroom': ['prop.mushrooms'],
  'prop.stalagmite': ['prop.rock.tall', 'prop.stone.tall', 'prop.crystal'],
  'prop.statue': ['prop.statue.head', 'prop.obelisk', 'prop.ruin.column'],
  'prop.lamp': ['prop.torch'],
  'prop.standingStone': ['prop.stone.tall', 'prop.obelisk'],
  'prop.dune': ['prop.rock.large', 'prop.rock.small'],
  'prop.skull': ['prop.bones'],
  'prop.cactus': ['prop.tree.dead'],
  'prop.pipe': ['prop.barrelsTech', 'prop.generator'],
  'prop.console': ['prop.generator', 'prop.containers'],
};

/** All models a prop ref may resolve to (for preloading). */
export function propVariants(id: string): readonly string[] {
  return PROP_VARIANTS[id] ?? [id];
}

/** The model for one placement of a prop ref; `h` in [0, 1). */
export function propVariant(id: string, h: number): string {
  const v = propVariants(id);
  return v[Math.min(v.length - 1, Math.floor(h * v.length))]!;
}

export interface KindDressing {
  /** Models picked per tile. */
  props: readonly string[];
  /** Uniform scale range (on top of the catalog scale). */
  scale: [number, number];
  /** Max offset from the tile center, in tiles. */
  jitter: number;
  /** Tiles deeper than this many steps from open ground get every other tile only (0 = all). */
  thinBeyond?: number;
  castShadow?: boolean;
}

const TREES = ['prop.tree.pine', 'prop.tree.pineRound', 'prop.tree.oak', 'prop.tree.fat', 'prop.tree.pine'];
/** Wooded rough: mostly trees, some boulders and bushes. */
const WOODS = [...TREES, ...TREES, 'prop.rock.tall', 'prop.rock.large', 'prop.bush.large'];

const DRESSING: Record<string, Partial<Record<TileKind, KindDressing>>> = {
  forest: {
    wall: { props: TREES, scale: [0.85, 1.25], jitter: 0.28, thinBeyond: 2, castShadow: true },
    rock: { props: WOODS, scale: [0.8, 1.2], jitter: 0.25, thinBeyond: 2, castShadow: true },
  },
  town: { rock: { props: WOODS, scale: [0.8, 1.2], jitter: 0.25, thinBeyond: 2, castShadow: true } },
  cave: { rock: { props: ['prop.rock.tall', 'prop.stone.tall'], scale: [0.55, 0.85], jitter: 0.12 } },
};

/** Color multiplier (sRGB) for plain tile kinds whose stock texture clashes with the ground. */
const TILE_TINT: Record<string, Partial<Record<TileKind, number>>> = {
  cave: { wall: 0x9c9088, rock: 0x9c9088 },
};

export function tileTint(tileset: string, kind: TileKind): number {
  return TILE_TINT[tileset.split('.').pop() ?? tileset]?.[kind] ?? 0xffffff;
}

/** Dressing for a tile kind in a tileset (`endoor.forest` -> forest), or undefined for plain tiles. */
export function dressingFor(tileset: string, kind: TileKind): KindDressing | undefined {
  const family = tileset.split('.').pop() ?? tileset;
  return DRESSING[family]?.[kind];
}

/** Steps (4-neighbour) from each tile to the nearest tile whose kind is not in `solid`, capped at `cap`. */
export function depthInto(
  kinds: readonly TileKind[],
  width: number,
  height: number,
  solid: (k: TileKind) => boolean,
  cap = 8,
): Uint8Array {
  const n = width * height;
  const d = new Uint8Array(n).fill(cap);
  const queue: number[] = [];
  for (let i = 0; i < n; i++)
    if (!solid(kinds[i] ?? 'void')) {
      d[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    if (d[i]! + 1 >= cap) continue;
    const x = i % width;
    const y = (i - x) / width;
    const step = (j: number) => {
      if (d[j]! > d[i]! + 1) {
        d[j] = d[i]! + 1;
        queue.push(j);
      }
    };
    if (x > 0) step(i - 1);
    if (x < width - 1) step(i + 1);
    if (y > 0) step(i - width);
    if (y < height - 1) step(i + width);
  }
  return d;
}
