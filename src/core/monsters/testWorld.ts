/** Headless test helpers (not used at runtime). */
import { SimWorld } from '../sim/world';
import type { PlayerEntity } from '../sim/entities';
import type { GeneratedLevel, TileKind } from '../world/types';
import type { Vec2 } from '../types';

export function openLevel(width = 80, height = 80, walls: Vec2[] = []): GeneratedLevel {
  const n = width * height;
  const kinds: TileKind[] = new Array<TileKind>(n).fill('floor');
  const walkable = new Uint8Array(n).fill(1);
  const blocks = new Uint8Array(n);
  const wall = (x: number, y: number) => {
    const i = y * width + x;
    kinds[i] = 'wall';
    walkable[i] = 0;
    blocks[i] = 1;
  };
  for (let x = 0; x < width; x++) {
    wall(x, 0);
    wall(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    wall(0, y);
    wall(width - 1, y);
  }
  for (const w of walls) wall(w.x, w.y);
  return {
    levelId: 'test',
    seed: 1,
    map: { width, height, kinds, variants: new Uint8Array(n), walkable, blocksMissiles: blocks },
    placements: [],
    regions: [],
  };
}

export function testWorld(seed = 1, level: GeneratedLevel = openLevel()): SimWorld {
  const w = new SimWorld(seed);
  w.level = level;
  return w;
}

/** Minimal stand-in player (only fields the AI reads). */
export function addHero(world: SimWorld, pos: Vec2): PlayerEntity {
  const hero = {
    id: world.allocId(),
    kind: 'player',
    pos: { ...pos },
    facing: 0,
    radius: 0.35,
    alive: true,
    defId: 'hero',
    team: 'players',
    level: 1,
    life: 100,
    mode: 'idle',
    path: [],
    effects: [],
    buffs: [],
    cooldowns: {},
  } as unknown as PlayerEntity;
  return world.add(hero);
}
