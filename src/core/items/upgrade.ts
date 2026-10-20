/**
 * "Is this better than what I'm wearing?" — a single rough power score per item so the UI can flag
 * upgrades (green ▲) and downgrades (red ▼). Deliberately simple: weapon damage per second,
 * defense, and a weight per modifier point. Pure; no class/skill simulation.
 */
import type { StatId } from '../stats/types';
import { baseOf, isGear } from './lookup';
import { DUAL_WIELD } from '../player/weapon';
import { isDualWieldBase, itemDefense, itemModifiers, weaponInfo } from './helpers';
import type { ItemInstance } from './types';

/** Score per point of each stat (flat op). Unlisted stats count DEFAULT_WEIGHT. */
const WEIGHTS: Partial<Record<StatId, number>> = {
  strength: 1,
  dexterity: 1,
  vitality: 1.2,
  energy: 0.8,
  lifeMax: 0.5,
  manaMax: 0.35,
  lifeRegen: 1,
  lifePerKill: 1,
  manaPerKill: 0.8,
  attackRating: 0.04,
  minDamage: 1.5,
  maxDamage: 1.5,
  plasmaMin: 0.5,
  plasmaMax: 0.5,
  cryoMin: 0.5,
  cryoMax: 0.5,
  stormMin: 0.4,
  stormMax: 0.4,
  toxinMin: 0.2,
  toxinMax: 0.2,
  magicMin: 0.5,
  magicMax: 0.5,
  ias: 0.3,
  fcr: 0.3,
  lifeSteal: 1.5,
  manaSteal: 1,
  crushingBlow: 0.8,
  deadlyStrike: 0.8,
  defense: 0.12,
  blockChance: 0.5,
  fhr: 0.2,
  frw: 0.25,
  resPlasma: 0.35,
  resCryo: 0.35,
  resStorm: 0.35,
  resToxin: 0.35,
  damageReduced: 1,
  damageReducedPct: 2,
  magicFind: 0.15,
  goldFind: 0.05,
  allSkills: 25,
  classSkills: 18,
  treeSkills: 10,
  singleSkill: 5,
};
const DEFAULT_WEIGHT = 0.3;
/** Weapon damage-per-second points are worth this much score each. */
const DPS_WEIGHT = 3;
/** Scores within this fraction of each other count as a side-grade. */
const SAME_BAND = 0.03;

const RANGED = new Set<string>(['blasturPistol', 'blasturRifle', 'javelin', 'throwingDisc']);
const isRanged = (item: ItemInstance): boolean => RANGED.has(baseOf(item)?.weaponClass ?? '');

/** Rough power of an item on its own. */
export function itemScore(item: ItemInstance): number {
  return weaponScore(item) + gearScore(item);
}

/** The weapon-damage part of the score (0 for armor). */
function weaponScore(item: ItemInstance): number {
  const w = weaponInfo(item);
  if (!w) return 0;
  const flat = item.mods.reduce(
    (s, m) => (m.op === 'flat' && (m.stat === 'minDamage' || m.stat === 'maxDamage') ? s + m.value / 2 : s),
    0,
  );
  return ((w.min + w.max) / 2 + flat) * w.speed * DPS_WEIGHT;
}

/** Everything but weapon damage: modifiers and defense. */
function gearScore(item: ItemInstance): number {
  let score = 0;
  const w = weaponInfo(item);
  for (const m of itemModifiers(item)) {
    if (m.stat === 'defense' && m.op === 'flat') continue; // counted from itemDefense below
    if (w && m.op === 'flat' && (m.stat === 'minDamage' || m.stat === 'maxDamage')) continue;
    score += m.value * (WEIGHTS[m.stat] ?? DEFAULT_WEIGHT);
  }
  score += itemDefense(item) * (WEIGHTS.defense ?? 0);
  return score;
}

/**
 * What both hands hold together. Two blades take turns (their damage averages) and swing faster
 * with the dual-wield bonus; a shield or other off-hand item simply adds its own score.
 */
export function handsScore(main: ItemInstance, off: ItemInstance | undefined): number {
  if (!off) return itemScore(main);
  if (!isDualWieldBase(main.base) || !isDualWieldBase(off.base)) return itemScore(main) + itemScore(off);
  const blades = ((weaponScore(main) + weaponScore(off)) / 2) * (1 + DUAL_WIELD.attackSpeed / 100);
  return blades + gearScore(main) + gearScore(off);
}

export type UpgradeVerdict = 'up' | 'down' | 'same';

function verdictOf(mine: number, cur: number): UpgradeVerdict {
  const band = Math.max(1, Math.abs(cur) * SAME_BAND);
  if (mine > cur + band) return 'up';
  if (mine < cur - band) return 'down';
  return 'same';
}

/** `pct`-style change between two scores. */
export function scorePct(mine: number, cur: number): number {
  if (cur <= 0) return mine > 0 ? 100 : 0;
  return Math.round((mine / cur - 1) * 100);
}

/**
 * A main-hand weapon that takes the off-hand item off (a two-hander, or a weapon that ends dual
 * wielding) measured against everything both hands hold now. Null when it is not comparable.
 */
export function handsVerdict(
  candidate: ItemInstance,
  main: ItemInstance,
  off: ItemInstance,
): { verdict: UpgradeVerdict; pct: number } | null {
  if (isRanged(main) !== isRanged(candidate)) return null;
  const cur = handsScore(main, off);
  const mine = itemScore(candidate);
  return { verdict: verdictOf(mine, cur), pct: scorePct(mine, cur) };
}

/** How much stronger `candidate` is than `equipped`, in percent of the equipped item's score. */
export function upgradePct(candidate: ItemInstance, equipped: ItemInstance): number {
  return scorePct(itemScore(candidate), itemScore(equipped));
}

/**
 * Compare `candidate` with what is equipped in the slot(s) it would go into. With several slots
 * (rings) it is measured against the weaker one; an empty slot is always an upgrade.
 * Returns null for things that are not gear.
 */
export function upgradeVerdict(
  candidate: ItemInstance,
  equipped: readonly (ItemInstance | null | undefined)[],
): UpgradeVerdict | null {
  const base = baseOf(candidate);
  if (!base || !isGear(base)) return null;
  if (equipped.length === 0 || equipped.some((e) => !e)) return 'up';
  // A blaster vs a litesaber is a change of playstyle, not an upgrade: don't judge it.
  if (equipped.some((e) => isRanged(e!) !== isRanged(candidate))) return null;
  const cur = Math.min(...equipped.map((e) => itemScore(e!)));
  return verdictOf(itemScore(candidate), cur);
}
