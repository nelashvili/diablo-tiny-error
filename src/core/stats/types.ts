/**
 * Stat & modifier contracts (D2 "ItemStatCost" analog).
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 *
 * Pipeline: base (class/monster + allocated points) -> item mods -> skill passives -> buffs/auras
 * -> DerivedStats. Implemented in core/stats (Wave 1, agent "stats-combat").
 */
import type { DamageType, Difficulty } from '../types';

/** Every stat a modifier can touch. Percent variants are expressed via Modifier.op = 'percent'. */
export type StatId =
  // attributes
  | 'strength'
  | 'dexterity'
  | 'vitality'
  | 'energy'
  // pools
  | 'lifeMax'
  | 'manaMax'
  | 'staminaMax'
  | 'lifeRegen' // life per second
  | 'manaRegenPct' // % increased mana regeneration
  | 'lifePerKill'
  | 'manaPerKill'
  // offense
  | 'attackRating'
  | 'enhancedDamage' // % enhanced weapon damage (D2 "ED")
  | 'minDamage' // flat physical min (adds to weapon)
  | 'maxDamage' // flat physical max
  | 'plasmaMin'
  | 'plasmaMax'
  | 'cryoMin'
  | 'cryoMax'
  | 'cryoLength' // seconds of chill
  | 'stormMin'
  | 'stormMax'
  | 'toxinMin' // total over duration, like D2 poison
  | 'toxinMax'
  | 'toxinLength' // seconds
  | 'magicMin'
  | 'magicMax'
  | 'plasmaSkillDamage' // % to plasma skill damage (D2 "+% fire skill damage")
  | 'cryoSkillDamage'
  | 'stormSkillDamage'
  | 'toxinSkillDamage'
  | 'enemyPlasmaRes' // -% enemy res (D2 -res)
  | 'enemyCryoRes'
  | 'enemyStormRes'
  | 'enemyToxinRes'
  | 'ias' // increased attack speed %
  | 'fcr' // faster cast rate %
  | 'crushingBlow' // %
  | 'deadlyStrike' // % chance double physical
  | 'criticalStrike' // % chance double physical (skill-based)
  | 'lifeSteal' // %
  | 'manaSteal' // %
  | 'pierce' // % chance missile pierces
  | 'knockback' // 0/1
  | 'preventHeal' // 0/1
  // defense
  | 'defense'
  | 'blockChance' // %, from shields/skills before dex scaling
  | 'fbr' // faster block rate %
  | 'fhr' // faster hit recovery %
  | 'frw' // faster run/walk %
  | 'resPlasma'
  | 'resCryo'
  | 'resStorm'
  | 'resToxin'
  | 'maxResPlasma'
  | 'maxResCryo'
  | 'maxResStorm'
  | 'maxResToxin'
  | 'damageReduced' // flat physical DR
  | 'damageReducedPct' // % physical DR
  | 'magicDamageReduced' // flat
  | 'thorns' // attacker takes damage
  | 'cannotBeFrozen' // 0/1
  | 'halfFreezeDuration' // 0/1
  | 'poisonLengthReduced' // %
  | 'dodgeChance' // % (melee) from passives
  | 'avoidChance' // % (missiles)
  | 'evadeChance' // % (while moving)
  // utility
  | 'magicFind' // % "Salvage Find"
  | 'goldFind' // % "Creditz Find"
  | 'lightRadius'
  | 'staminaDrainReduced'
  | 'requirementsReduced' // % (item-local)
  // skills
  | 'allSkills' // +N to all skills
  | 'classSkills' // +N to class skills (param = ClassId)
  | 'treeSkills' // +N to a skill tree (param = tree id)
  | 'singleSkill' // +N to one skill (param = skill id)
  | 'chargedSkill' // item has charges of a skill (param = skill id, value = level)
  | 'auraWhenEquipped'; // (param = skill id, value = level)

export type ModifierOp = 'flat' | 'percent';

export interface Modifier {
  stat: StatId;
  value: number;
  op: ModifierOp;
  /** Extra key for parameterized stats (skill id, tree id, class id). */
  param?: string;
  /** Where it came from — for tooltips & debugging (e.g. "item:123", "skill:ironWill", "aura:might"). */
  source?: string;
}

/** Fully resolved stats used by combat and UI. Numbers are post-modifier, post-cap. */
export interface DerivedStats {
  strength: number;
  dexterity: number;
  vitality: number;
  energy: number;
  lifeMax: number;
  manaMax: number;
  staminaMax: number;
  lifeRegen: number;
  manaRegenPerSec: number;
  attackRating: number;
  defense: number;
  /** Effective block % after dex/level formula, capped at 75. */
  blockChance: number;
  /** Final resists after difficulty penalty, clamped to [-100, maxRes]. */
  res: Record<'plasma' | 'cryo' | 'storm' | 'toxin', number>;
  /** Weapon/physical damage range after ED and str/dex bonus. */
  physMin: number;
  physMax: number;
  /** Added elemental damage per type (on attack). */
  elemental: Record<'plasma' | 'cryo' | 'storm' | 'toxin' | 'magic', { min: number; max: number }>;
  /** Speed multipliers (1 = base). Continuous, no breakpoints (PLAN §4). */
  attackSpeedMul: number;
  castSpeedMul: number;
  hitRecoveryMul: number;
  blockSpeedMul: number;
  moveSpeedMul: number;
  /** Raw totals of every StatId (flat after percent applied) for anything not surfaced above. */
  raw: Partial<Record<StatId, number>>;
  /** Skill bonuses: resolved later per skill via skills module. */
  skillBonus: {
    all: number;
    byClass: Record<string, number>;
    byTree: Record<string, number>;
    bySkill: Record<string, number>;
  };
}

/** Inputs to the stat pipeline. */
export interface StatSources {
  level: number;
  /** Class or monster base values (attributes, base life etc.). */
  base: Partial<Record<StatId, number>>;
  /** Hard points allocated by the player into attributes. */
  allocated: { strength: number; dexterity: number; vitality: number; energy: number };
  modifiers: readonly Modifier[];
  difficulty: Difficulty;
  /** Weapon info if any — needed for str/dex damage bonus and ED application. */
  weapon?: {
    min: number;
    max: number;
    /** D2 weapon class stat bonus: e.g. swords strBonus=100 dexBonus=0, bows dexBonus=100. Percent per 100 points. */
    strBonus: number;
    dexBonus: number;
    /** Energy bonus (Forse staffs, Kybur focuses); optional, defaults to 0. */
    eneBonus?: number;
    speed: number; // base attacks per second
  };
  /** Per-class life/mana gains (PLAN §4). */
  growth?: ClassGrowth;
}

export interface ClassGrowth {
  lifePerLevel: number;
  lifePerVit: number;
  manaPerLevel: number;
  manaPerEnergy: number;
  staminaPerLevel: number;
  staminaPerVit: number;
}

/** Signature implemented by core/stats/compute.ts in Wave 1. */
export type ComputeStats = (src: StatSources) => DerivedStats;

export type { DamageType };
