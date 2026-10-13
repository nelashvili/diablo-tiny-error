// STUB (Wave 0) — replaced by agent "stats-combat". Keep the exported signature.
import type { ComputeStats, DerivedStats } from './types';

export const computeStats: ComputeStats = (src) => {
  const a = {
    strength: (src.base.strength ?? 0) + src.allocated.strength,
    dexterity: (src.base.dexterity ?? 0) + src.allocated.dexterity,
    vitality: (src.base.vitality ?? 0) + src.allocated.vitality,
    energy: (src.base.energy ?? 0) + src.allocated.energy,
  };
  const zero = { min: 0, max: 0 };
  const stats: DerivedStats = {
    ...a,
    lifeMax: src.base.lifeMax ?? 50,
    manaMax: src.base.manaMax ?? 20,
    staminaMax: src.base.staminaMax ?? 80,
    lifeRegen: 0,
    manaRegenPerSec: 1,
    attackRating: a.dexterity * 5,
    defense: a.dexterity / 4,
    blockChance: 0,
    res: { plasma: 0, cryo: 0, storm: 0, toxin: 0 },
    physMin: src.weapon?.min ?? 1,
    physMax: src.weapon?.max ?? 2,
    elemental: { plasma: zero, cryo: zero, storm: zero, toxin: zero, magic: zero },
    attackSpeedMul: 1,
    castSpeedMul: 1,
    hitRecoveryMul: 1,
    blockSpeedMul: 1,
    moveSpeedMul: 1,
    raw: {},
    skillBonus: { all: 0, byClass: {}, byTree: {}, bySkill: {} },
  };
  return stats;
};
