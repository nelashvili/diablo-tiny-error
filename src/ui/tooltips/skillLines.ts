/**
 * Pure: numbers shown in a skill tooltip for a given effective level, with synergy bonuses.
 */
import { evalLevel } from '../../data/levelScaled';
import { hasName, t } from '../../data/names';
import type { DamageType, DefId } from '../../core/types';
import type { SkillDef } from '../../data/schema';

export interface SkillLine {
  key: string;
  label: string;
  value: string;
  element?: DamageType;
}

export const fmtNum = (n: number): string => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** "attackRating" → "Attack Rating" (fallback when no name key exists). */
export function humanize(key: string): string {
  const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function labelFor(prefix: string, key: string): string {
  const k = `${prefix}.${key}`;
  return hasName(k) ? t(k) : humanize(key);
}

/** Total synergy % per target from hard points of the `from` skills. */
export function synergyTotals(
  skill: SkillDef,
  hard: Readonly<Record<DefId, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of skill.synergies ?? []) {
    out[s.target] = (out[s.target] ?? 0) + s.pctPerLevel * (hard[s.from] ?? 0);
  }
  return out;
}

const SECONDS = new Set(['duration', 'durationSec', 'cooldown', 'chillSec', 'stunSec', 'freezeSec']);

export function skillLines(
  skill: SkillDef,
  level: number,
  hard: Readonly<Record<DefId, number>>,
  resourceName = t('ui.resource'),
): SkillLine[] {
  if (level <= 0) return [];
  const syn = synergyTotals(skill, hard);
  const lines: SkillLine[] = [];
  const mana = evalLevel(skill.manaCost, level);
  if (mana > 0)
    lines.push({ key: 'mana', label: t('ui.skill.cost', { resource: resourceName }), value: fmtNum(mana) });
  for (const [type, dmg] of Object.entries(skill.damage ?? {}) as [
    DamageType,
    { min: never; max: never },
  ][]) {
    const mul = 1 + (syn[type] ?? 0) / 100;
    const min = evalLevel(dmg.min, level) * mul;
    const max = evalLevel(dmg.max, level) * mul;
    lines.push({
      key: `dmg.${type}`,
      label: t('ui.skill.damage', { type: t(`dmg.${type}`) }),
      value: min === max ? fmtNum(min) : `${fmtNum(min)}-${fmtNum(max)}`,
      element: type,
    });
  }
  if (skill.weaponDamagePct !== undefined) {
    const v = evalLevel(skill.weaponDamagePct, level);
    lines.push({
      key: 'wdmg',
      label: t('ui.skill.weaponDamage'),
      value: `${v >= 0 ? '+' : ''}${fmtNum(v)}%`,
    });
  }
  if (skill.attackRatingPct !== undefined) {
    const v = evalLevel(skill.attackRatingPct, level) * (1 + (syn.attackRating ?? 0) / 100);
    lines.push({ key: 'ar', label: t('ui.stat.attackRating'), value: `+${fmtNum(v)}%` });
  }
  for (const [k, v] of Object.entries(skill.params ?? {})) {
    const mul = 1 + (syn[k] ?? 0) / 100;
    const n = evalLevel(v, level) * mul;
    lines.push({
      key: `p.${k}`,
      label: labelFor('ui.param', k),
      value: fmtNum(n) + (SECONDS.has(k) ? 's' : ''),
    });
  }
  for (const m of skill.mods ?? []) {
    const n = evalLevel(m.value, level) * (1 + (syn[m.stat] ?? 0) / 100);
    lines.push({
      key: `m.${m.stat}`,
      label: labelFor('ui.stat', m.stat),
      value: `${n >= 0 ? '+' : ''}${fmtNum(n)}${m.op === 'percent' ? '%' : ''}`,
    });
  }
  if (skill.cooldownSec !== undefined) {
    const c = evalLevel(skill.cooldownSec, level);
    if (c > 0) lines.push({ key: 'cd', label: t('ui.skill.cooldown'), value: `${fmtNum(c)}s` });
  }
  return lines;
}
