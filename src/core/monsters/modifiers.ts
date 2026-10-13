/**
 * D2 champion/unique monster modifiers: stat effects, random selection, on-hit specs, death procs
 * and render tints.
 */
import type { DerivedStats } from '../stats/types';
import type { Rng } from '../rng';
import type { Difficulty, ElementalType, Vec2 } from '../types';
import type { MonsterModifier } from '../../data/schema';
import type { AttackSpec, StatusEffectSpec } from '../combat/types';
import type { AreaEntity, MonsterEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import { difficultyIndex } from './scaling';

export const ALL_MODIFIERS: readonly MonsterModifier[] = [
  'extraStrong',
  'extraFast',
  'cursed',
  'magicResistant',
  'plasmaEnchanted',
  'stormEnchanted',
  'cryoEnchanted',
  'multishot',
  'stoneSkin',
  'teleport',
  'manaBurn',
  'auraEnchanted',
  'spectralHit',
];

/** Pairs that make no sense together (an Enchanted pack that is also Magic Resistant is fine in D2). */
const ELEMENT_OF: Partial<Record<MonsterModifier, ElementalType>> = {
  plasmaEnchanted: 'plasma',
  stormEnchanted: 'storm',
  cryoEnchanted: 'cryo',
};

/** Number of random modifiers for a unique: 1-2 on Normal, +1 per difficulty, max 3. */
export function rollModifierCount(rng: Rng, difficulty: Difficulty): number {
  return Math.min(3, rng.int(1, 2) + difficultyIndex(difficulty));
}

export function rollModifiers(
  rng: Rng,
  count: number,
  exclude: readonly MonsterModifier[] = [],
): MonsterModifier[] {
  const pool = ALL_MODIFIERS.filter((m) => !exclude.includes(m));
  rng.shuffle(pool);
  return pool.slice(0, Math.min(count, pool.length));
}

const MAGIC_RES: Record<Difficulty, number> = { normal: 40, veteran: 55, legend: 70 };

/** Extra data modifiers produce that is not part of DerivedStats; stored in `monster.ai`. */
export interface ModifierExtras {
  spectralElement?: ElementalType;
  /** Flags consumed by combat/skills when this monster hits (cursed = amplify damage, manaBurn). */
  hitFlags: { cursed?: boolean; manaBurn?: boolean; aura?: string };
}

export const AURAS = ['might', 'fanaticism', 'holyFreeze', 'holyFire', 'holyShock', 'conviction'] as const;

/** Mutates `stats` in place with the stat effects of `mods`. */
export function applyModifiers(
  stats: DerivedStats,
  mods: readonly MonsterModifier[],
  ctx: { difficulty: Difficulty; rng: Rng },
): ModifierExtras {
  const extras: ModifierExtras = { hitFlags: {} };
  const avg = (stats.physMin + stats.physMax) / 2;
  for (const mod of mods) {
    switch (mod) {
      case 'extraStrong':
        stats.physMin *= 1.5;
        stats.physMax *= 1.5;
        stats.attackRating *= 1.2;
        break;
      case 'extraFast':
        stats.moveSpeedMul *= 1.4;
        stats.attackSpeedMul *= 1.5;
        stats.castSpeedMul *= 1.5;
        stats.hitRecoveryMul *= 1.5;
        break;
      case 'cursed':
        extras.hitFlags.cursed = true;
        break;
      case 'magicResistant': {
        const r = MAGIC_RES[ctx.difficulty];
        for (const k of ['plasma', 'cryo', 'storm', 'toxin'] as const)
          stats.res[k] = Math.min(100, stats.res[k] + r);
        break;
      }
      case 'plasmaEnchanted':
      case 'stormEnchanted':
      case 'cryoEnchanted': {
        const el = ELEMENT_OF[mod] as ElementalType;
        const e = stats.elemental[el];
        e.min += avg * 0.4;
        e.max += avg * 0.9;
        stats.res[el] = Math.min(100, Math.max(stats.res[el], 75));
        break;
      }
      case 'multishot':
        // Behavior lives in AI: ranged attackers swap to m_multishot.
        break;
      case 'stoneSkin':
        stats.defense *= 2.5;
        stats.raw.damageReducedPct = Math.min(75, (stats.raw.damageReducedPct ?? 0) + 40);
        break;
      case 'teleport':
        break; // AI blinks
      case 'manaBurn':
        extras.hitFlags.manaBurn = true;
        break;
      case 'auraEnchanted': {
        extras.hitFlags.aura = ctx.rng.pick(AURAS);
        stats.physMin *= 1.2;
        stats.physMax *= 1.2;
        stats.attackRating *= 1.2;
        break;
      }
      case 'spectralHit': {
        const el = ctx.rng.pick(['plasma', 'cryo', 'storm'] as const);
        extras.spectralElement = el;
        const e = stats.elemental[el];
        e.min += avg * 0.3;
        e.max += avg * 0.7;
        break;
      }
    }
  }
  return extras;
}

/** On-hit status effects a monster's attacks should carry (combat/skills append these). */
export function monsterHitEffects(m: Pick<MonsterEntity, 'mods'>): StatusEffectSpec[] {
  const out: StatusEffectSpec[] = [];
  if (m.mods.includes('cryoEnchanted')) out.push({ kind: 'chill', durationSec: 2, magnitude: 30 });
  if (m.mods.includes('plasmaEnchanted')) out.push({ kind: 'burn', durationSec: 2, magnitude: 6 });
  return out;
}

/** Render tint (0xRRGGBB) for rank, so the renderer can colour champions/uniques. */
export function monsterTint(rank: MonsterEntity['rank'], mods: readonly MonsterModifier[]): number | null {
  for (const m of mods) {
    if (m === 'plasmaEnchanted') return 0xff7a2a;
    if (m === 'cryoEnchanted') return 0x5fb8ff;
    if (m === 'stormEnchanted') return 0xffe94a;
  }
  if (rank === 'champion') return 0x5a7bff;
  if (rank === 'unique' || rank === 'boss') return 0xffd24a;
  return null;
}

/** Spawn the on-death nova/explosion of an enchanted monster (as a short-lived AreaEntity). */
export function spawnDeathProc(world: SimWorld, m: MonsterEntity, pos: Vec2): AreaEntity[] {
  const out: AreaEntity[] = [];
  for (const mod of m.mods) {
    const el = ELEMENT_OF[mod];
    if (!el) continue;
    const avg = (m.stats.physMin + m.stats.physMax) / 2;
    const payload: AttackSpec = {
      delivery: 'spell',
      useWeaponDamage: false,
      skillDamage: { [el]: { min: avg * 0.8, max: avg * 1.6 } },
      effects: el === 'cryo' ? [{ kind: 'chill', durationSec: 3, magnitude: 40 }] : undefined,
    };
    const area: AreaEntity = {
      id: world.allocId(),
      kind: 'area',
      pos: { x: pos.x, y: pos.y },
      facing: 0,
      radius: 3,
      alive: true,
      defId: `m_deathNova.${el}`,
      ownerId: m.id,
      team: m.team,
      skillLevel: 1,
      remainingSec: 0.04,
      tickEverySec: 0.04,
      tickTimer: 0,
      payload,
      vfx: `vfx.nova.${el}`,
    };
    out.push(world.add(area));
  }
  return out;
}
