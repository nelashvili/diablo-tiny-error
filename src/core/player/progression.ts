/** XP, leveling, stat/skill allocation, respec and death penalties. */
import { DB } from '../../data/db';
import type { MonsterDef } from '../../data/schema';
import { MAX_LEVEL, experienceForLevel, levelForExperience } from '../stats/xp';
import type { DefId, Difficulty } from '../types';
import type { PlayerEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';

export const STAT_POINTS_PER_LEVEL = 5;
export const SKILL_POINTS_PER_LEVEL = 1;
export const MAX_HARD_POINTS = 20;

export type StatKey = 'strength' | 'dexterity' | 'vitality' | 'energy';

/** XP a monster of `level` is worth before the player-level penalty. */
export function monsterXp(def: Pick<MonsterDef, 'xp'> | undefined, level: number, rank = 'normal'): number {
  const base = (def?.xp ?? 5) * 1.2 ** Math.max(0, level - 1);
  const mult = rank === 'champion' ? 3 : rank === 'unique' ? 4 : 1;
  return Math.max(1, Math.round(base * mult));
}

/** Add XP; handles multi-level jumps. Returns levels gained. */
export function gainXp(world: SimWorld, p: PlayerEntity, amount: number): number {
  if (amount <= 0 || p.level >= MAX_LEVEL) return 0;
  const cap = experienceForLevel(MAX_LEVEL);
  p.xp = Math.min(cap, p.xp + amount);
  world.emit({ type: 'xpGained', id: p.id, amount });
  const newLevel = levelForExperience(p.xp);
  let gained = 0;
  while (p.level < newLevel) {
    p.level++;
    gained++;
    p.statPointsUnspent += STAT_POINTS_PER_LEVEL;
    p.skillPointsUnspent += SKILL_POINTS_PER_LEVEL;
    world.emit({ type: 'levelUp', id: p.id, level: p.level });
  }
  if (gained > 0) p.statsDirty = true; // NOT a full heal (not D2)
  return gained;
}

export function allocateStat(p: PlayerEntity, stat: StatKey, amount: number): boolean {
  const n = Math.floor(amount);
  if (!(n >= 1) || n > p.statPointsUnspent || !(stat in p.allocated)) return false;
  p.allocated[stat] += n;
  p.statPointsUnspent -= n;
  p.statsDirty = true;
  return true;
}

export type AllocateFail = 'unknown' | 'class' | 'points' | 'level' | 'prereq' | 'max';

export function skillAllocationProblem(p: PlayerEntity, skillId: DefId): AllocateFail | null {
  const def = DB.skills.get(skillId);
  if (!def || !def.classId) return 'unknown';
  if (def.classId !== p.classId) return 'class';
  if (p.skillPointsUnspent < 1) return 'points';
  if ((p.skills[skillId] ?? 0) >= MAX_HARD_POINTS) return 'max';
  if (p.level < def.reqLevel) return 'level';
  for (const pre of def.prereqs) if ((p.skills[pre] ?? 0) < 1) return 'prereq';
  return null;
}

export const canAllocateSkill = (p: PlayerEntity, skillId: DefId): boolean =>
  skillAllocationProblem(p, skillId) === null;

export function allocateSkill(p: PlayerEntity, skillId: DefId): boolean {
  if (skillAllocationProblem(p, skillId) !== null) return false;
  p.skills[skillId] = (p.skills[skillId] ?? 0) + 1;
  p.skillPointsUnspent -= 1;
  p.statsDirty = true;
  return true;
}

/** Free respec (one per difficulty by default). Refunds all stat and skill points. */
export function respec(p: PlayerEntity, difficulty: Difficulty): boolean {
  if ((p.respecs[difficulty] ?? 0) < 1) return false;
  p.respecs[difficulty] -= 1;
  const a = p.allocated;
  p.statPointsUnspent += a.strength + a.dexterity + a.vitality + a.energy;
  a.strength = a.dexterity = a.vitality = a.energy = 0;
  for (const v of Object.values(p.skills)) p.skillPointsUnspent += v;
  p.skills = {};
  const known = (id: DefId | null): boolean => id !== null && (DB.skills.get(id)?.classId ? false : true);
  if (!known(p.leftSkill)) p.leftSkill = 'attack';
  if (!known(p.rightSkill)) p.rightSkill = 'attack';
  p.hotkeys = p.hotkeys.map((h) => (known(h) ? h : null));
  p.statsDirty = true;
  return true;
}

// ------------------------------------------------------------------ death rules (PLAN §2)

/** Fraction of carried Creditz lost on defeat. */
export const CREDITZ_LOSS: Record<Difficulty, number> = { normal: 0.1, veteran: 0.15, legend: 0.2 };
/** Fraction of the current level's XP span lost on defeat (never de-levels). Normal: none. */
export const XP_LOSS: Record<Difficulty, number> = { normal: 0, veteran: 0.05, legend: 0.1 };

/** Apply Defeated penalties. Returns what was lost. */
export function applyDeathPenalty(world: SimWorld, p: PlayerEntity): { creditzLost: number; xpLost: number } {
  const d = world.difficulty;
  const creditzLost = Math.floor(p.creditz * CREDITZ_LOSS[d]);
  p.creditz -= creditzLost;
  let xpLost = 0;
  if (XP_LOSS[d] > 0 && p.level < MAX_LEVEL) {
    const lo = experienceForLevel(p.level);
    const span = experienceForLevel(p.level + 1) - lo;
    xpLost = Math.min(Math.floor(span * XP_LOSS[d]), Math.max(0, p.xp - lo));
    p.xp -= xpLost;
  }
  if (creditzLost > 0) world.emit({ type: 'creditzChanged', playerId: p.id, creditz: p.creditz });
  return { creditzLost, xpLost };
}
