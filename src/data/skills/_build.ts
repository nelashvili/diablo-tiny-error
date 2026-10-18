/**
 * Helpers for authoring class skill tables (no default export, so the DB loader skips this file).
 * `ls(base, a, b, c, d, e)` is a D2-style per-level progression: +a per level for levels 2-8,
 * +b for 9-16, +c for 17-22, +d for 23-28, +e from 29 on.
 */
import type { ClassId } from '../../core/types';
import type { LevelScaled, SkillDef } from '../schema';

export const ls = (base: number, a: number, b = a, c = b, d = c, e = d): LevelScaled => ({
  base,
  perLevel: [a, b, c, d, e],
});

/** Damage range that grows per level (min and max share the brackets). */
export const dmg = (
  min: number,
  max: number,
  perMin: number,
  perMax: number,
  growth = [1, 1.5, 2, 2.5, 3],
): { min: LevelScaled; max: LevelScaled } => ({
  min: ls(min, ...(growth.map((g) => +(perMin * g).toFixed(2)) as [number, number, number, number, number])),
  max: ls(max, ...(growth.map((g) => +(perMax * g).toFixed(2)) as [number, number, number, number, number])),
});

/** Tier (0-5) -> required character level, per PLAN §3. */
export const TIER_LEVEL = [1, 6, 12, 18, 24, 30] as const;

type Authored = Omit<
  SkillDef,
  | 'classId'
  | 'name'
  | 'description'
  | 'reqLevel'
  | 'maxHardPoints'
  | 'ui'
  | 'tree'
  | 'prereqs'
  | 'leftClickable'
> & {
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  col: 0 | 1 | 2;
  icon?: string;
  prereqs?: string[];
  leftClickable?: boolean;
};

/** Build a class skill: fills naming, tier level, tree and UI slot conventions. */
export function classSkill(classId: ClassId, tree: string) {
  return (s: Authored): SkillDef => {
    const { tier, col, icon, prereqs, leftClickable, ...rest } = s;
    return {
      ...rest,
      classId,
      tree: `${classId}.${tree}`,
      name: `skill.${s.id}`,
      description: `skill.${s.id}.desc`,
      reqLevel: TIER_LEVEL[tier],
      prereqs: prereqs ?? [],
      maxHardPoints: 20,
      ui: { col, row: tier, icon: icon ?? s.kind },
      leftClickable:
        leftClickable ?? (s.kind === 'meleeAttack' || s.kind === 'missile' || s.kind === 'multiMissile'),
    };
  };
}
