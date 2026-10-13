/**
 * Test fixtures for headless simulation tests (not used by the game). Builds flat levels,
 * registers throwaway item/monster/skill defs into DB, and constructs MonsterEntity objects
 * directly (no dependency on core/monsters).
 */
import { DB } from '../../../data/db';
import type { ItemBaseDef, MissileDef, MonsterDef, SkillDef } from '../../../data/schema';
import { computeStats } from '../../stats/compute';
import type { GeneratedLevel, TileKind } from '../../world/types';
import type { DefId, Team, Vec2 } from '../../types';
import type { MonsterEntity } from '../entities';
import { FixedLoop } from '../loop';
import { SimWorld } from '../world';
import { createCoreSystems } from './index';

export function makeFlatLevel(
  width = 40,
  height = 40,
  walls: { x: number; y: number }[] = [],
): GeneratedLevel {
  const n = width * height;
  const kinds: TileKind[] = new Array<TileKind>(n).fill('floor');
  const walkable = new Uint8Array(n).fill(1);
  const blocksMissiles = new Uint8Array(n);
  const wall = (x: number, y: number): void => {
    const i = y * width + x;
    kinds[i] = 'wall';
    walkable[i] = 0;
    blocksMissiles[i] = 1;
  };
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++)
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) wall(x, y);
  for (const w of walls) wall(w.x, w.y);
  return {
    levelId: 'test.flat',
    seed: 1,
    map: { width, height, kinds, variants: new Uint8Array(n), walkable, blocksMissiles },
    placements: [{ kind: 'playerStart', pos: { x: 5.5, y: 5.5 } }],
    regions: [{ x: 0, y: 0, w: width, h: height }],
  };
}

export interface TestSim {
  world: SimWorld;
  loop: FixedLoop;
  run(ticks: number): void;
}

export function makeTestSim(seed = 1, level: GeneratedLevel | null = makeFlatLevel()): TestSim {
  registerTestDefs();
  const world = new SimWorld(seed);
  world.level = level;
  const loop = new FixedLoop(world, createCoreSystems());
  return {
    world,
    loop,
    run(ticks) {
      for (let i = 0; i < ticks; i++) loop.step();
    },
  };
}

const put = <T extends { id: string }>(map: ReadonlyMap<string, T>, row: T): void => {
  (map as Map<string, T>).set(row.id, row);
};

export const TEST_DUMMY: MonsterDef = {
  id: 'test.dummy',
  name: 'monster.test.dummy',
  family: 'test',
  modelId: 'mon.test',
  ai: 'melee',
  life: { min: 40, max: 40 },
  defense: 0,
  attackRating: 10,
  damage: { min: 2, max: 4 },
  walkSpeed: 2,
  attackRange: 1.5,
  aggroRange: 8,
  res: {},
  xp: 20,
  treasure: { normal: 'test.tc' },
  flags: { droyd: false },
  pack: { min: 1, max: 1 },
};

let registered = false;
/** Idempotently add test-only defs to the content DB. */
export function registerTestDefs(): void {
  if (registered) return;
  registered = true;
  const item = (o: Partial<ItemBaseDef> & { id: string }): ItemBaseDef => ({
    name: o.id,
    category: 'weapon',
    slots: ['mainHand'],
    size: { w: 1, h: 3 },
    qlvl: 1,
    req: {},
    maxSockets: 0,
    cost: 1,
    modelId: 'item.test',
    icon: 'icon.test',
    ...o,
  });
  put(
    DB.items,
    item({ id: 'test.saber', weaponClass: 'litesaber', damage: { min: 6, max: 10 }, speed: 1.5, range: 1.6 }),
  );
  put(
    DB.items,
    item({
      id: 'test.blastur',
      weaponClass: 'blasturRifle',
      damage: { min: 5, max: 9 },
      speed: 1.4,
      twoHanded: true,
    }),
  );
  put(
    DB.items,
    item({ id: 'test.stim', category: 'consumable', slots: [], use: { kind: 'heal', amount: 30 } }),
  );
  put(DB.monsters, TEST_DUMMY);
  const mdef: MissileDef = { id: 'test.bolt', speed: 20, range: 20, radius: 0.3, vfx: 'vfx.test' };
  put(DB.missiles, mdef);
}

export interface TestMonsterOpts {
  pos: Vec2;
  defId?: DefId;
  life?: number;
  level?: number;
  team?: Team;
  rank?: MonsterEntity['rank'];
  damage?: [number, number];
  defense?: number;
  radius?: number;
  ownerId?: number;
}

/** Build and add a MonsterEntity directly. */
export function spawnTestMonster(world: SimWorld, o: TestMonsterOpts): MonsterEntity {
  const level = o.level ?? 1;
  const dmg = o.damage ?? [2, 4];
  const stats = computeStats({
    level,
    base: {
      lifeMax: o.life ?? 40,
      defense: o.defense ?? 0,
      attackRating: 50,
      minDamage: dmg[0],
      maxDamage: dmg[1],
    },
    allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    modifiers: [],
    difficulty: world.difficulty,
  });
  const m: MonsterEntity = {
    id: world.allocId(),
    kind: 'monster',
    pos: { x: o.pos.x, y: o.pos.y },
    facing: 0,
    radius: o.radius ?? 0.4,
    alive: true,
    defId: o.defId ?? TEST_DUMMY.id,
    team: o.team ?? 'monsters',
    level,
    life: stats.lifeMax,
    mana: 0,
    stamina: 0,
    stats,
    mode: 'idle',
    modeTime: 0,
    path: [],
    running: false,
    effects: [],
    buffs: [],
    cooldowns: {},
    statsDirty: false,
    modelId: 'mon.test',
    rank: o.rank ?? 'normal',
    mods: [],
    ai: {},
    home: { x: o.pos.x, y: o.pos.y },
    ...(o.ownerId !== undefined ? { ownerId: o.ownerId } : {}),
  };
  return world.add(m);
}

/** Register a one-off skill for a test. */
export function registerTestSkill(def: Partial<SkillDef> & { id: string; kind: SkillDef['kind'] }): SkillDef {
  const full: SkillDef = {
    classId: '' as unknown as SkillDef['classId'],
    tree: 'common',
    name: `skill.${def.id}`,
    d2Analog: 'test',
    description: `skill.${def.id}.desc`,
    reqLevel: 1,
    prereqs: [],
    ui: { col: 0, row: 0, icon: 'icon.test' },
    maxHardPoints: 20,
    manaCost: 0,
    leftClickable: true,
    vfx: 'vfx.test',
    anim: 'cast',
    ...def,
  };
  put(DB.skills, full);
  return full;
}
