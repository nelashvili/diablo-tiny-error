/** Spawn helpers for projectiles, lingering areas and summons. */
import { DB } from '../../data/db';
import type { MonsterDef, SkillDef } from '../../data/schema';
import type { AttackSpec } from '../combat/types';
import { computeStats } from '../stats/compute';
import type { Actor, AreaEntity, MissileEntity, MonsterEntity } from '../sim/entities';
import { toCombatant } from '../sim/systems/util';
import type { SimWorld } from '../sim/world';
import type { DefId, Vec2 } from '../types';

export interface SpawnMissileOpts {
  defId: DefId;
  pos: Vec2;
  angle: number;
  payload: AttackSpec;
  skillId?: DefId;
  skillLevel?: number;
  homingTargetId?: number;
  /** Override MissileDef range / speed. */
  range?: number;
  speedMul?: number;
}

export function spawnMissile(world: SimWorld, caster: Actor, o: SpawnMissileOpts): MissileEntity | null {
  const def = DB.missiles.get(o.defId);
  if (!def) return null;
  const speed = def.speed * (o.speedMul ?? 1);
  const m: MissileEntity = {
    id: world.allocId(),
    kind: 'missile',
    pos: { x: o.pos.x, y: o.pos.y },
    facing: o.angle,
    radius: def.radius,
    alive: true,
    defId: o.defId,
    ownerId: caster.id,
    team: caster.team,
    skillId: o.skillId,
    skillLevel: o.skillLevel ?? 1,
    velocity: { x: Math.cos(o.angle) * speed, y: Math.sin(o.angle) * speed },
    traveled: 0,
    range: o.range ?? def.range,
    hitIds: [],
    homingTargetId: o.homingTargetId,
    payload: o.payload,
    casterSnapshot: toCombatant(caster),
  };
  return world.add(m);
}

export interface SpawnAreaOpts {
  skill: SkillDef;
  level: number;
  pos: Vec2;
  radius: number;
  /** Lifetime after the first tick delay. 0 = a single tick. */
  duration: number;
  tickEverySec: number;
  delay?: number;
  payload: AttackSpec;
}

export function spawnArea(world: SimWorld, caster: Actor, o: SpawnAreaOpts): AreaEntity {
  const delay = o.delay ?? 0;
  const a: AreaEntity = {
    id: world.allocId(),
    kind: 'area',
    pos: { x: o.pos.x, y: o.pos.y },
    facing: 0,
    radius: o.radius,
    alive: true,
    defId: o.skill.id,
    ownerId: caster.id,
    team: caster.team,
    skillLevel: o.level,
    remainingSec: delay + o.duration,
    tickEverySec: Math.max(0.05, o.tickEverySec),
    tickTimer: delay,
    payload: o.payload,
    casterSnapshot: toCombatant(caster),
    vfx: o.skill.vfx,
  };
  return world.add(a);
}

// ------------------------------------------------------------------ summons

export interface SummonRequest {
  def: MonsterDef;
  level: number;
  pos: Vec2;
  owner: Actor;
  /** Multipliers from the skill (life %, damage %). */
  lifePct?: number;
  damagePct?: number;
  skillId?: DefId;
  expireAt?: number;
}

export type SummonFactory = (world: SimWorld, req: SummonRequest) => MonsterEntity;

/** Minimal built-in factory; core/monsters may replace it with its real spawner. */
const defaultSummonFactory: SummonFactory = (world, req) => {
  const { def, level, owner } = req;
  const life = ((def.life.min + def.life.max) / 2) * (1 + 0.15 * (level - 1)) * ((req.lifePct ?? 100) / 100);
  const dmgMul = (1 + 0.12 * (level - 1)) * ((req.damagePct ?? 100) / 100);
  const stats = computeStats({
    level,
    base: {
      lifeMax: life,
      manaMax: 0,
      staminaMax: 0,
      defense: def.defense * (1 + 0.1 * (level - 1)),
      attackRating: def.attackRating * (1 + 0.1 * (level - 1)),
      minDamage: def.damage.min * dmgMul,
      maxDamage: def.damage.max * dmgMul,
    },
    allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    modifiers: [],
    difficulty: world.difficulty,
  });
  const m: MonsterEntity = {
    id: world.allocId(),
    kind: 'monster',
    pos: { x: req.pos.x, y: req.pos.y },
    facing: owner.facing,
    radius: 0.4 * (def.scale ?? 1),
    alive: true,
    defId: def.id,
    team: owner.team,
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
    modelId: def.modelId,
    rank: 'summon',
    mods: [],
    ownerId: owner.id,
    ai: {},
    home: { x: req.pos.x, y: req.pos.y },
  };
  return m;
};

let summonFactory: SummonFactory = defaultSummonFactory;
export function setSummonFactory(f: SummonFactory | null): void {
  summonFactory = f ?? defaultSummonFactory;
}

export function spawnSummon(world: SimWorld, req: SummonRequest): MonsterEntity {
  const m = summonFactory(world, req);
  m.ownerId = req.owner.id;
  m.team = req.owner.team;
  m.rank = 'summon';
  m.ai.summonSkill = req.skillId;
  if (req.expireAt !== undefined) m.ai.expireAt = req.expireAt;
  return world.add(m);
}
