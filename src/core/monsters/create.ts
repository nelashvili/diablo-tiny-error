/**
 * Monster construction: scales a MonsterDef by monster level + difficulty + rank, applies D2
 * modifiers and produces a fully-formed MonsterEntity (DerivedStats built locally).
 */
import type { DefId, Difficulty, EntityId, Team, Vec2 } from '../types';
import type { Rng } from '../rng';
import type { DerivedStats } from '../stats/types';
import type { MonsterEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import { DB, req } from '../../data/db';
import type { MonsterDef, MonsterModifier } from '../../data/schema';
import { RANK_MULT, scaledMultipliers } from './scaling';
import { applyModifiers, rollModifierCount, rollModifiers } from './modifiers';
import { generateUniqueName } from './uniqueNames';

export type MonsterRank = MonsterEntity['rank'];

export interface CreateMonsterOpts {
  /** RNG for life rolls / modifier selection. Defaults to world.rng. */
  rng?: Rng;
  /** Explicit modifiers (bosses, minions copying a leader). If omitted, uniques roll random ones. */
  mods?: MonsterModifier[];
  /** Override display name key. */
  nameKey?: string;
  leaderId?: EntityId;
  ownerId?: EntityId;
  team?: Team;
  difficulty?: Difficulty;
  /** BossDef id, stored in `ai.bossId` for scripts & intro. */
  bossId?: DefId;
  facing?: number;
  /** Add to the world (default true). */
  add?: boolean;
}

const zeroRange = () => ({ min: 0, max: 0 });

export interface BuiltStats {
  stats: DerivedStats;
  life: number;
  extras: ReturnType<typeof applyModifiers>;
}

/** Local stat builder: monster base values -> DerivedStats. Pure given the rng. */
export function buildMonsterStats(
  def: MonsterDef,
  level: number,
  difficulty: Difficulty,
  rank: MonsterRank,
  mods: readonly MonsterModifier[],
  rng: Rng,
): BuiltStats {
  const m = scaledMultipliers(level, difficulty);
  const r = RANK_MULT[rank];
  const life = Math.max(1, Math.round(rng.int(def.life.min, def.life.max) * m.life * r.life));
  const baseRes = { ...def.res, ...(def.resByDifficulty?.[difficulty] ?? {}) };
  const clampRes = (v: number | undefined) => Math.max(-100, Math.min(100, v ?? 0));
  const stats: DerivedStats = {
    strength: 0,
    dexterity: 0,
    vitality: 0,
    energy: 0,
    lifeMax: life,
    manaMax: 0,
    staminaMax: 0,
    lifeRegen: 0,
    manaRegenPerSec: 0,
    attackRating: Math.round(def.attackRating * m.attackRating * r.attackRating),
    defense: Math.round(def.defense * m.defense),
    blockChance: 0,
    res: {
      plasma: clampRes(baseRes.plasma),
      cryo: clampRes(baseRes.cryo),
      storm: clampRes(baseRes.storm),
      toxin: clampRes(baseRes.toxin),
    },
    physMin: Math.max(1, def.damage.min * m.damage * r.damage),
    physMax: Math.max(1, def.damage.max * m.damage * r.damage),
    elemental: {
      plasma: zeroRange(),
      cryo: zeroRange(),
      storm: zeroRange(),
      toxin: zeroRange(),
      magic: zeroRange(),
    },
    attackSpeedMul: 1,
    castSpeedMul: 1,
    hitRecoveryMul: 1,
    blockSpeedMul: 1,
    moveSpeedMul: 1,
    raw: {},
    skillBonus: { all: 0, byClass: {}, byTree: {}, bySkill: {} },
  };
  if (baseRes.physical) stats.raw.damageReducedPct = baseRes.physical;
  // Skill-borne magic damage scales with the damage curve too (wraith touch etc.).
  const extras = applyModifiers(stats, mods, { difficulty, rng });
  stats.lifeMax = life;
  return { stats, life, extras };
}

/** XP awarded for killing (before player level-difference penalties, which the kill system owns). */
export function monsterXp(def: MonsterDef, level: number, difficulty: Difficulty, rank: MonsterRank): number {
  const m = scaledMultipliers(level, difficulty);
  return Math.max(1, Math.round(def.xp * m.xp * RANK_MULT[rank].xp));
}

export function createMonster(
  world: SimWorld,
  defId: DefId,
  pos: Vec2,
  level: number,
  rank: MonsterRank = 'normal',
  opts: CreateMonsterOpts = {},
): MonsterEntity {
  const def = req(DB.monsters, defId, 'monster');
  const rng = opts.rng ?? world.rng;
  const difficulty = opts.difficulty ?? world.difficulty;

  let mods = opts.mods;
  let nameKey = opts.nameKey ?? def.name;
  if (!mods) {
    if (rank === 'unique') mods = rollModifiers(rng, rollModifierCount(rng, difficulty));
    else if (rank === 'champion') mods = rollModifiers(rng, 1);
    else mods = [];
  }
  if (rank === 'unique' && !opts.nameKey) nameKey = generateUniqueName(rng).key;

  const { stats, life, extras } = buildMonsterStats(def, level, difficulty, rank, mods, rng);
  const scale = def.scale ?? 1;
  const ai: Record<string, unknown> = {
    state: 'idle',
    hitFlags: extras.hitFlags,
    xp: monsterXp(def, level, difficulty, rank),
  };
  if (extras.spectralElement) ai.spectralElement = extras.spectralElement;
  if (opts.bossId) ai.bossId = opts.bossId;

  const m: MonsterEntity = {
    id: world.allocId(),
    kind: 'monster',
    pos: { x: pos.x, y: pos.y },
    facing: opts.facing ?? 0,
    radius: 0.35 * scale,
    alive: true,
    defId,
    team: opts.team ?? 'monsters',
    level,
    life,
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
    modelId: def.modelId,
    rank,
    mods,
    nameKey,
    leaderId: opts.leaderId,
    ownerId: opts.ownerId,
    ai,
    home: { x: pos.x, y: pos.y },
    revivable: !!def.flags.droyd,
  };
  return opts.add === false ? m : world.add(m);
}
