/** Skill level resolution and per-level parameter evaluation (with synergies). */
import { DB } from '../../data/db';
import { evalLevel } from '../../data/levelScaled';
import type { SkillDef } from '../../data/schema';
import type { DerivedStats } from '../stats/types';
import type { DefId } from '../types';
import type { Actor } from '../sim/entities';

/** Basic skills (attack, throw, kick) have no class and are always known. */
export const isBasicSkill = (def: SkillDef): boolean => !def.classId;

/** Level from hard points + bonuses (D2: +skills only apply to skills with >=1 hard point). */
export function levelFromParts(def: SkillDef, hard: number, bonus: DerivedStats['skillBonus']): number {
  if (isBasicSkill(def)) return Math.max(1, hard);
  const single = bonus.bySkill[def.id] ?? 0;
  if (hard > 0) {
    return (
      hard + bonus.all + (bonus.byClass[def.classId ?? ''] ?? 0) + (bonus.byTree[def.tree] ?? 0) + single
    );
  }
  return Math.max(0, single);
}

/** Effective skill level (hard points + item/buff bonuses; monsters use their def level). */
export function getSkillLevel(actor: Actor, skillId: DefId): number {
  const def = DB.skills.get(skillId);
  if (!def) return 0;
  if (actor.kind === 'player') return levelFromParts(def, actor.skills[skillId] ?? 0, actor.stats.skillBonus);
  if (isBasicSkill(def)) return 1;
  if (actor.kind === 'merc') {
    const md = DB.mercs.get(actor.defId);
    const e = md?.skills.find((s) => s.skill === skillId);
    if (e) return Math.max(1, Math.floor(actor.level / Math.max(1, e.levelPerLevels)));
  }
  const entry = DB.monsters.get(actor.defId)?.skills?.find((s) => s.skill === skillId);
  return entry?.level ?? 1;
}

/** Hard points the actor has in a skill (for synergies). Non-players have none. */
export function hardPoints(actor: Actor, skillId: DefId): number {
  return actor.kind === 'player' ? (actor.skills[skillId] ?? 0) : 0;
}

/** Total synergy percent for `target` (e.g. 'plasma', 'radius', 'attackRating'). */
export function synergyPct(actor: Actor, skill: SkillDef, target: string): number {
  if (!skill.synergies) return 0;
  let pct = 0;
  for (const s of skill.synergies) if (s.target === target) pct += s.pctPerLevel * hardPoints(actor, s.from);
  return pct;
}

/** Named numeric parameter at `level`, boosted by synergies targeting that param name. */
export function skillParam(actor: Actor, skill: SkillDef, name: string, level: number, fallback = 0): number {
  const raw = skill.params?.[name];
  if (raw === undefined) return fallback;
  const v = evalLevel(raw, level);
  const syn = synergyPct(actor, skill, name);
  return syn ? v * (1 + syn / 100) : v;
}
