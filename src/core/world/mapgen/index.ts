// STUB (Wave 0) — replaced by agent "world". Keep the exported signature.
import type { LevelDef } from '../../../data/schema';
import type { GeneratedLevel, TileKind } from '../types';

export function generateLevel(def: Pick<LevelDef, 'id' | 'gen' | 'genParams'>, seed: number): GeneratedLevel {
  const width = 32;
  const height = 32;
  const n = width * height;
  const kinds: TileKind[] = new Array<TileKind>(n).fill('floor');
  const walkable = new Uint8Array(n).fill(1);
  const blocksMissiles = new Uint8Array(n);
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++)
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        const i = y * width + x;
        kinds[i] = 'wall';
        walkable[i] = 0;
        blocksMissiles[i] = 1;
      }
  return {
    levelId: def.id,
    seed,
    map: { width, height, kinds, variants: new Uint8Array(n), walkable, blocksMissiles },
    placements: [{ kind: 'playerStart', pos: { x: 16, y: 16 } }],
    regions: [{ x: 0, y: 0, w: width, h: height }],
  };
}
