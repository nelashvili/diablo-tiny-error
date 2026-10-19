/** Player creation from a ClassDef. */
import { DB } from '../../data/db';
import { createItem } from '../items/create';
import { INVENTORY_SIZE, emptyGrid, placeItem } from '../items/grid';
import type { Equipment, ItemInstance } from '../items/types';
import { Rng, hashString } from '../rng';
import type { PlayerEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import { isBeltItemBase } from '../sim/systems/util';
import type { ClassId, DefId, EquipSlot, Vec2 } from '../types';
import { experienceForLevel } from '../stats/xp';
import { STAT_POINTS_PER_LEVEL, SKILL_POINTS_PER_LEVEL } from './progression';
import { recomputeStats } from './stats';

export interface CreatePlayerOpts {
  pos?: Vec2;
  /** Start at a higher level (tests / debug). Grants the matching points and XP. */
  level?: number;
  /** Override the class starting items. */
  startingItems?: DefId[];
  /** Make this the world's local player (default: true if none yet). */
  local?: boolean;
}

export function createPlayer(
  world: SimWorld,
  classId: ClassId,
  name: string,
  opts: CreatePlayerOpts = {},
): PlayerEntity {
  const cls = DB.classes.get(classId);
  if (!cls) throw new Error(`createPlayer: unknown class ${classId}`);
  const level = Math.max(1, opts.level ?? 1);
  const start = world.level?.placements.find((p) => p.kind === 'playerStart')?.pos;
  const pos = opts.pos ?? start ?? { x: 0, y: 0 };

  const equipment: Equipment = {};
  const inventory = emptyGrid(INVENTORY_SIZE.w, INVENTORY_SIZE.h);
  const belt = {
    rows: 1,
    cols: 4 as const,
    slots: [null, null, null, null] as (ItemInstance | null)[],
  };
  const rng = new Rng(hashString(`start:${classId}:${name}`));
  const p: PlayerEntity = {
    id: world.allocId(),
    kind: 'player',
    pos: { x: pos.x, y: pos.y },
    facing: 0,
    radius: 0.35,
    alive: true,
    defId: classId,
    team: 'players',
    level,
    life: 1,
    mana: 0,
    stamina: 0,
    stats: undefined as never,
    mode: 'idle',
    modeTime: 0,
    path: [],
    running: true,
    effects: [],
    buffs: [],
    cooldowns: {},
    statsDirty: true,
    modelId: cls.modelId,
    classId,
    name,
    xp: experienceForLevel(level),
    creditz: 0,
    statPointsUnspent: (level - 1) * STAT_POINTS_PER_LEVEL,
    skillPointsUnspent: (level - 1) * SKILL_POINTS_PER_LEVEL,
    allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    skills: {},
    leftSkill: 'attack',
    rightSkill: 'attack',
    hotkeys: [null, null, null, null, null, null, null, null],
    equipment,
    inventory,
    belt,
    respecs: { normal: 1, veteran: 1, legend: 1 },
  };

  for (const baseId of opts.startingItems ?? cls.startingItems) {
    const item = createItem(baseId, { quality: 'normal', ilvl: 1 }, rng);
    const base = DB.items.get(baseId);
    if (base && (base.category === 'weapon' || base.category === 'armor')) {
      const slot = base.slots.find(
        (s: EquipSlot) =>
          !equipment[s] &&
          !(s === 'offHand' && equipment.mainHand && DB.items.get(equipment.mainHand.base)?.twoHanded) &&
          !(base.twoHanded && s === 'mainHand' && equipment.offHand),
      );
      if (slot) {
        equipment[slot] = item;
        continue;
      }
    }
    if (isBeltItemBase(baseId)) {
      const i = belt.slots.indexOf(null);
      if (i >= 0) {
        belt.slots[i] = item;
        continue;
      }
    }
    placeItem(inventory, item);
  }

  recomputeStats(p, world.difficulty);
  p.life = p.stats.lifeMax;
  p.mana = p.stats.manaMax;
  p.stamina = p.stats.staminaMax;
  world.add(p);
  if (opts.local ?? world.localPlayerId === null) world.localPlayerId = p.id;
  return p;
}
