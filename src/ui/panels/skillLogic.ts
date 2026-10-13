/**
 * Pure skill-tree helpers: bonus levels from +skills, availability states (D2 rules),
 * prerequisite connectors for the tree view and Build Guide suggestion.
 */
import type { DerivedStats } from '../../core/stats/types';
import type { DefId } from '../../core/types';
import type { SkillDef } from '../../data/schema';

export const MAX_HARD_POINTS = 20;
export const TIER_LEVELS = [1, 6, 12, 18, 24, 30] as const;

type Bonus = DerivedStats['skillBonus'];

/** Total +skill bonus for a skill from all sources. Specific +skill always applies (D2 rule). */
export function skillBonus(bonus: Bonus | undefined, skill: SkillDef, hard: number): number {
  if (!bonus) return 0;
  const specific = bonus.bySkill[skill.id] ?? 0;
  if (hard <= 0) return specific;
  return bonus.all + (bonus.byClass[skill.classId] ?? 0) + (bonus.byTree[skill.tree] ?? 0) + specific;
}

/** Effective level used for numbers (hard + bonus), 0 when unusable. */
export function effectiveLevel(hard: number, bonus: number): number {
  return hard > 0 || bonus > 0 ? hard + bonus : 0;
}

export type SkillState = 'locked' | 'unlocked' | 'available' | 'learned' | 'maxed';

export interface SkillCtx {
  charLevel: number;
  unspent: number;
  hard: Readonly<Record<DefId, number>>;
}

export interface SkillStatus {
  state: SkillState;
  levelOk: boolean;
  missingPrereqs: DefId[];
  hard: number;
}

/**
 * - locked: character level too low or a prerequisite has no hard points (and no own points)
 * - maxed: 20 hard points
 * - available: a point can be spent right now
 * - learned: has points but none to spend
 * - unlocked: requirements met, no points in it and none to spend
 */
export function skillStatus(skill: SkillDef, ctx: SkillCtx): SkillStatus {
  const hard = ctx.hard[skill.id] ?? 0;
  const levelOk = ctx.charLevel >= skill.reqLevel;
  const missingPrereqs = skill.prereqs.filter((p) => (ctx.hard[p] ?? 0) <= 0);
  const reqOk = levelOk && missingPrereqs.length === 0;
  let state: SkillState;
  if (hard >= MAX_HARD_POINTS) state = 'maxed';
  else if (!reqOk && hard === 0) state = 'locked';
  else if (reqOk && ctx.unspent > 0) state = 'available';
  else if (hard > 0) state = 'learned';
  else state = 'unlocked';
  return { state, levelOk, missingPrereqs, hard };
}

export function canAllocate(skill: SkillDef, ctx: SkillCtx): boolean {
  return skillStatus(skill, ctx).state === 'available';
}

export interface Connector {
  from: { col: number; row: number };
  to: { col: number; row: number };
  fromId: DefId;
  toId: DefId;
  /** Prerequisite has at least one hard point. */
  met: boolean;
}

/** Prerequisite lines between skills of the same tree (cross-tree prereqs are skipped). */
export function treeConnectors(treeSkills: readonly SkillDef[], hard: Readonly<Record<DefId, number>>) {
  const byId = new Map(treeSkills.map((s) => [s.id, s]));
  const out: Connector[] = [];
  for (const s of treeSkills) {
    for (const p of s.prereqs) {
      const ps = byId.get(p);
      if (!ps) continue;
      out.push({
        from: { col: ps.ui.col, row: ps.ui.row },
        to: { col: s.ui.col, row: s.ui.row },
        fromId: ps.id,
        toId: s.id,
        met: (hard[p] ?? 0) > 0,
      });
    }
  }
  return out;
}

/** Points spent in a tree (hard points only). */
export function pointsInTree(treeSkills: readonly SkillDef[], hard: Readonly<Record<DefId, number>>) {
  return treeSkills.reduce((n, s) => n + (hard[s.id] ?? 0), 0);
}

/**
 * Build Guide: the first skill in the class's suggested order that the player can put a point
 * into now. `guide` entries may repeat an id with a target level (e.g. "plasmaBolt:5").
 */
export function buildGuideNext(
  guide: readonly string[],
  skills: ReadonlyMap<DefId, SkillDef>,
  ctx: SkillCtx,
): DefId | null {
  for (const entry of guide) {
    const [id, target] = entry.split(':') as [string, string | undefined];
    const s = skills.get(id);
    if (!s) continue;
    const want = target ? Number(target) : 1;
    if ((ctx.hard[id] ?? 0) >= want) continue;
    const st = skillStatus(s, ctx);
    if (st.levelOk && st.missingPrereqs.length === 0 && st.state !== 'maxed') return id;
    return null; // next goal isn't reachable yet: save the point (D2 habit)
  }
  return null;
}

/** All skill ids mentioned by a guide (for "part of the plan" markers). */
export function guideIds(guide: readonly string[]): Set<string> {
  return new Set(guide.map((e) => e.split(':')[0]!));
}
