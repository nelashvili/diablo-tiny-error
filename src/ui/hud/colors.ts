/** Map game concepts to theme tokens (CSS custom properties from ui/theme.css). */
import type { DamageType, ItemQuality } from '../../core/types';
import type { MonsterEntity, ActiveEffect } from '../../core/sim/entities';

const DMG_TOKENS: Record<DamageType, string> = {
  physical: '--dmg-physical',
  plasma: '--dmg-plasma',
  cryo: '--dmg-cryo',
  storm: '--dmg-storm',
  toxin: '--dmg-toxin',
  magic: '--dmg-magic',
};

/** CSS var() reference for a damage type; unknown types fall back to physical. */
export function damageColor(dtype: string): string {
  const tok = DMG_TOKENS[dtype as DamageType] ?? DMG_TOKENS.physical;
  return `var(${tok})`;
}

/** Token name (without var()) for a damage type — for canvas lookups. */
export function damageToken(dtype: string): string {
  return DMG_TOKENS[dtype as DamageType] ?? DMG_TOKENS.physical;
}

const QUALITIES: readonly ItemQuality[] = ['inferior', 'normal', 'magic', 'rare', 'set', 'unique', 'crafted'];

export function qualityColor(q: string): string {
  return `var(--q-${QUALITIES.includes(q as ItemQuality) ? q : 'normal'})`;
}

export type Rank = MonsterEntity['rank'];

/** D2 name colors: champion blue, unique/boss gold, everything else white. */
export function rankColor(rank: Rank | undefined): string {
  switch (rank) {
    case 'champion':
      return 'var(--q-magic)';
    case 'unique':
    case 'boss':
      return 'var(--q-unique)';
    default:
      return 'var(--q-normal)';
  }
}

/** Status effect kinds -> damage-type color, so "poisoned" reads green and "chilled" blue. */
export function effectColor(kind: ActiveEffect['spec']['kind']): string {
  switch (kind) {
    case 'chill':
    case 'freeze':
      return damageColor('cryo');
    case 'toxin':
      return damageColor('toxin');
    case 'burn':
      return damageColor('plasma');
    case 'stun':
      return damageColor('storm');
    default:
      return 'var(--ui-text-dim)';
  }
}
