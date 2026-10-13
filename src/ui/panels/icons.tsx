/**
 * Procedural SVG icons (no assets needed). Item icons are chosen from the base's weapon/armor
 * class or category; skill icons from the skill kind, tinted by element.
 */
import type { ItemBaseDef, SkillDef } from '../../data/schema';
import type { DamageType, EquipSlot } from '../../core/types';

type Glyph = { d: string; fill?: boolean; extra?: string };

/** 24x24 paths. `fill` glyphs are filled with currentColor, others stroked. */
export const GLYPHS: Record<string, Glyph> = {
  litesaber: { d: 'M12 2v13M10 15h4v3h-4zM11 18h2v4h-2z', extra: 'blade' },
  doubleLitesaber: { d: 'M12 1v8M12 15v8M10 9h4v6h-4z', extra: 'blade' },
  vibroAxe: { d: 'M7 3c6 0 9 3 9 7l-4 1zM12 7l0 15', fill: false },
  shockBaton: { d: 'M12 22V8M9 3h6l-1 5h-4zM8 5l-2-1M16 5l2-1M12 1v2' },
  vibroPike: { d: 'M12 22V7M12 1l3 6h-6zM9 9h6' },
  throwingDisc: {
    d: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM12 3v3M12 18v3M3 12h3M18 12h3',
  },
  javelin: { d: 'M4 20L19 5M19 5l1-3-3 1M6 16l2 2' },
  blasturPistol: { d: 'M3 8h15v4H9l-1 7H4l1-7H3zM18 9h3M11 12v2' },
  blasturRifle: { d: 'M1 9h18v3H8l-2 6H3l2-6H1zM19 10h4M10 7h5v2' },
  forseStaff: { d: 'M12 23V7M12 1a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM9 10h6' },
  kyburFocus: { d: 'M12 2l6 8-6 12-6-12zM6 10h12M12 2v20' },
  helm: { d: 'M4 14a8 8 0 0 1 16 0v4h-4v-3H8v3H4zM8 10h8' },
  chest: { d: 'M7 3l-4 3 2 5 2-1v11h10V10l2 1 2-5-4-3-2 2h-4zM12 9v8' },
  gloves: { d: 'M7 21v-8l-2-4 2-1 2 3V4h2v6V3h2v7V4h2v7l2-3 2 1-3 6v6z' },
  belt: { d: 'M2 9h20v6H2zM10 8h4v8h-4zM5 9v6M19 9v6' },
  boots: { d: 'M7 3h6v11l7 3v4H5v-3l2-1zM7 10h6' },
  shield: { d: 'M12 2l8 3v6c0 6-4 9-8 11-4-2-8-5-8-11V5zM12 6v12M8 10h8' },
  ring: { d: 'M12 8a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM12 4l3 3h-6z' },
  amulet: { d: 'M5 3c1 6 4 9 7 9s6-3 7-9M12 12l4 4-4 6-4-6z' },
  stim: { d: 'M10 2h4v3h-4zM8 5h8l1 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8zM8 13h8', extra: 'liquid' },
  cell: { d: 'M9 2h6v2h-6zM7 4h10v18H7zM10 9l-1 5h3l-1 5 4-7h-3l1-3z' },
  beacon: { d: 'M12 22V12M8 22h8M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM6 4a8 8 0 0 0 0 8M18 4a8 8 0 0 1 0 8' },
  gem: { d: 'M7 4h10l4 5-9 12L3 9zM3 9h18M9 4l3 5 3-5M12 9v12' },
  glyph: { d: 'M5 3h14v18H5zM9 8h6M12 8v8M9 16h6' },
  quest: { d: 'M12 2l9 5v10l-9 5-9-5V7zM12 2v20M3 7l18 10M21 7L3 17' },
  creditz: {
    d: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM15 9a3 2.5 0 0 0-6 0c0 3 6 2 6 5a3 2.5 0 0 1-6 0M12 5v14',
  },
  // skill kinds
  meleeAttack: { d: 'M4 20L16 8M15 3l6 6-3 3-6-6zM6 15l3 3' },
  missile: { d: 'M2 12h12M14 8l8 4-8 4zM4 9l-2 3 2 3' },
  multiMissile: { d: 'M3 12h11M14 9l6 3-6 3zM5 5l9 4M5 19l9-4' },
  nova: {
    d: 'M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z',
  },
  area: { d: 'M12 3a9 4 0 1 1 0 .1M12 8v3M8 6v3M16 6v3M12 14a9 4 0 1 1 0 .1' },
  beam: { d: 'M3 12h18M3 9h14M3 15h14M19 8l3 4-3 4' },
  chain: { d: 'M3 18l5-6 4 3 4-8 5 4M3 18l2-7M21 11l-1-6' },
  wall: { d: 'M3 20h18M5 20c0-6 3-6 3-12 2 4 3 4 3 12M13 20c0-5 3-6 3-11 2 4 3 5 3 11' },
  trail: { d: 'M2 20c4-1 6-4 8-8s6-6 12-6M6 20c1-3 2-4 4-5M14 10c1-2 3-3 5-3' },
  movement: { d: 'M4 18l6-6-6-6M12 18l6-6-6-6' },
  whirl: { d: 'M12 12m-2 0a2 2 0 1 0 4 0a5 5 0 1 0-10 0a8 8 0 1 0 16 0' },
  buff: { d: 'M12 2l8 3v6c0 6-4 9-8 11-4-2-8-5-8-11V5zM12 7v9M8 11h8' },
  aura: { d: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0' },
  warcry: { d: 'M4 9h4l6-5v16l-6-5H4zM17 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14' },
  summon: { d: 'M6 9h12v9H6zM9 18v3M15 18v3M12 9V5M10 3h4M9 12h2M13 12h2M9 15h6' },
  utility: { d: 'M14 4a5 5 0 0 0-5 7l-6 6 3 3 6-6a5 5 0 0 0 7-5l-3 3-3-3z' },
  passive: { d: 'M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z' },
  lock: { d: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v3' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  check: { d: 'M4 12l5 5L20 6' },
  sort: { d: 'M4 6h16M4 12h10M4 18h5M18 13v8M15 18l3 3 3-3' },
  star: { d: 'M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z', fill: true },
  swap: { d: 'M4 8h14l-3-3M20 16H6l3 3' },
};

export function Icon({ name, size = 24, cls }: { name: string; size?: number | string; cls?: string }) {
  const g = GLYPHS[name] ?? GLYPHS.quest!;
  return (
    <svg
      class={`dte-icon ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={g.fill ? 'currentColor' : 'none'}
      stroke={g.fill ? 'none' : 'currentColor'}
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {g.extra === 'blade' && <rect x="10.6" y="1.5" width="2.8" height="13.5" rx="1.4" class="dte-blade" />}
      {g.extra === 'liquid' && <rect x="8" y="13" width="8" height="8" rx="1.5" class="dte-liquid" />}
      <path d={g.d} />
    </svg>
  );
}

const USE_ICONS: Record<string, string> = {
  heal: 'stim',
  mana: 'cell',
  rejuv: 'stim',
  recall: 'beacon',
  identify: 'quest',
  stamina: 'cell',
  antidote: 'stim',
  thaw: 'stim',
};

export function itemGlyph(base: ItemBaseDef | undefined, baseId: string): string {
  if (!base) {
    // Guess from the id so placeholders still look sensible.
    const id = baseId.toLowerCase();
    for (const k of [
      'saber',
      'staff',
      'blastur',
      'rifle',
      'javelin',
      'helm',
      'boot',
      'glove',
      'belt',
      'ring',
    ]) {
      if (id.includes(k))
        return {
          saber: 'litesaber',
          staff: 'forseStaff',
          blastur: 'blasturPistol',
          rifle: 'blasturRifle',
          javelin: 'javelin',
          helm: 'helm',
          boot: 'boots',
          glove: 'gloves',
          belt: 'belt',
          ring: 'ring',
        }[k]!;
    }
    return 'quest';
  }
  if (base.weaponClass) return base.weaponClass;
  if (base.armorClass) return base.armorClass;
  if (base.use) return USE_ICONS[base.use.kind] ?? 'stim';
  switch (base.category) {
    case 'gem':
      return 'gem';
    case 'glyph':
      return 'glyph';
    case 'currency':
      return 'creditz';
    default:
      return 'quest';
  }
}

export const SLOT_GLYPH: Record<EquipSlot, string> = {
  head: 'helm',
  amulet: 'amulet',
  chest: 'chest',
  mainHand: 'litesaber',
  offHand: 'shield',
  ring1: 'ring',
  ring2: 'ring',
  gloves: 'gloves',
  belt: 'belt',
  boots: 'boots',
};

export function skillGlyph(s: SkillDef): string {
  return GLYPHS[s.ui.icon] ? s.ui.icon : s.kind;
}

export const ELEMENT_VAR: Record<DamageType, string> = {
  physical: '--dmg-physical',
  plasma: '--dmg-plasma',
  cryo: '--dmg-cryo',
  storm: '--dmg-storm',
  toxin: '--dmg-toxin',
  magic: '--dmg-magic',
};
