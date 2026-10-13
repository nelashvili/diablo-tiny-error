/**
 * Modifier aggregation. Each StatId collects `flat` and `percent` sums; parameterized stats
 * (skills) are additionally collected per param.
 */
import type { Modifier, StatId } from './types';

export interface StatBucket {
  flat: number;
  pct: number;
}

export interface Aggregated {
  stat: Map<StatId, StatBucket>;
  /** Parameterized stats: stat -> param -> flat sum. */
  param: Map<StatId, Map<string, number>>;
}

const PARAM_STATS: ReadonlySet<StatId> = new Set<StatId>([
  'classSkills',
  'treeSkills',
  'singleSkill',
  'chargedSkill',
  'auraWhenEquipped',
]);

export function isParamStat(s: StatId): boolean {
  return PARAM_STATS.has(s);
}

export function aggregate(mods: readonly Modifier[]): Aggregated {
  const stat = new Map<StatId, StatBucket>();
  const param = new Map<StatId, Map<string, number>>();
  for (const m of mods) {
    if (isParamStat(m.stat)) {
      let pm = param.get(m.stat);
      if (!pm) param.set(m.stat, (pm = new Map()));
      const key = m.param ?? '';
      pm.set(key, (pm.get(key) ?? 0) + m.value);
    }
    let b = stat.get(m.stat);
    if (!b) stat.set(m.stat, (b = { flat: 0, pct: 0 }));
    if (m.op === 'percent') b.pct += m.value;
    else b.flat += m.value;
  }
  return { stat, param };
}

/** (base + flat) * (1 + pct/100). */
export function total(agg: Aggregated, stat: StatId, base = 0): number {
  const b = agg.stat.get(stat);
  if (!b) return base;
  return (base + b.flat) * (1 + b.pct / 100);
}
