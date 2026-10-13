// STUB (Wave 0) — replaced by agent "stats-combat". Keep the exported signature.
import type { ResolveAttack } from './types';

export const resolveAttack: ResolveAttack = (attacker, _defender, _spec, rng) => {
  const dmg = rng.int(Math.floor(attacker.stats.physMin), Math.ceil(attacker.stats.physMax));
  return {
    outcome: 'hit',
    damage: { physical: dmg },
    total: dmg,
    crit: false,
    crushed: false,
    effects: [],
    lifeStolen: 0,
    manaStolen: 0,
  };
};
