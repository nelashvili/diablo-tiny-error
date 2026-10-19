/**
 * Procedural SVG icon set for the HUD (no external assets needed). Glyphs are drawn on a
 * 48x48 grid with `currentColor`, so callers tint them with theme tokens via CSS `color`.
 */
import type { JSX } from 'preact';
import type { SkillGlyph, ConsumableKind } from './lookup';
import { skillInfo } from './lookup';
import { damageColor } from './colors';

type GlyphProps = { size?: number | string; class?: string };

const GLYPHS: Record<SkillGlyph | 'hourglass' | 'arrow' | 'stars', JSX.Element> = {
  saber: (
    <g>
      <path d="M12 36 L36 12" stroke-width="5" stroke-linecap="round" opacity="0.35" />
      <path d="M13 35 L36 12" stroke-width="2.6" stroke-linecap="round" stroke="var(--ui-text)" />
      <path
        d="M8 40 L14 34 M10 32 L16 38"
        stroke-width="3.5"
        stroke-linecap="round"
        stroke="var(--ui-text-dim)"
      />
    </g>
  ),
  flame: (
    <path
      d="M24 6 C26 14 34 17 34 28 C34 35 29 41 24 41 C19 41 14 36 14 29 C14 23 18 21 19 16 C21 20 21 23 23 25 C25 20 22 12 24 6 Z M24 41 C21 41 19 38 19 35 C19 31 22 30 23 27 C25 30 29 32 29 35 C29 38 27 41 24 41 Z"
      fill="currentColor"
      fill-rule="evenodd"
      stroke="none"
    />
  ),
  snow: (
    <g stroke-width="3" stroke-linecap="round">
      <path d="M24 6 V42 M8.4 15 L39.6 33 M8.4 33 L39.6 15" />
      <path
        d="M19 9 L24 14 L29 9 M19 39 L24 34 L29 39 M8 21 L14 20 L12 14 M40 27 L34 28 L36 34 M8 27 L14 28 L12 34 M40 21 L34 20 L36 14"
        stroke-width="2.2"
      />
    </g>
  ),
  bolt: <path d="M28 4 L12 27 H22 L18 44 L36 19 H26 L30 4 Z" fill="currentColor" stroke="none" />,
  toxin: (
    <g fill="currentColor" stroke="none">
      <path d="M22 8 C22 8 11 22 11 30 C11 37 16 41 22 41 C28 41 33 37 33 30 C33 22 22 8 22 8 Z" />
      <circle cx="35" cy="12" r="4" opacity="0.8" />
      <circle cx="39" cy="22" r="2.6" opacity="0.65" />
      <ellipse cx="18" cy="31" rx="3" ry="4.5" fill="var(--ui-bg)" opacity="0.35" />
    </g>
  ),
  star: (
    <path d="M24 4 L28 20 L44 24 L28 28 L24 44 L20 28 L4 24 L20 20 Z" fill="currentColor" stroke="none" />
  ),
  stars: (
    <g fill="currentColor" stroke="none">
      <path d="M16 6 L18.5 14 L26 16 L18.5 18 L16 26 L13.5 18 L6 16 L13.5 14 Z" />
      <path d="M33 20 L35 26 L41 28 L35 30 L33 36 L31 30 L25 28 L31 26 Z" />
      <path d="M15 31 L16.5 35 L20 36 L16.5 37 L15 41 L13.5 37 L10 36 L13.5 35 Z" />
    </g>
  ),
  shield: (
    <g>
      <path d="M24 5 L39 11 V22 C39 32 32 39 24 43 C16 39 9 32 9 22 V11 Z" stroke-width="3" fill="none" />
      <path d="M24 12 L33 15.5 V22 C33 28 29 33 24 36 Z" fill="currentColor" stroke="none" opacity="0.7" />
    </g>
  ),
  droyd: (
    <g>
      <path
        d="M12 26 C12 16 17 10 24 10 C31 10 36 16 36 26 Z"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
      <rect x="12" y="27" width="24" height="13" rx="3" stroke-width="3" fill="none" />
      <circle cx="24" cy="19" r="4" fill="var(--ui-bg)" stroke="none" />
      <circle cx="24" cy="19" r="2" fill="var(--ui-text)" stroke="none" />
      <path d="M24 10 V5 M18 33 H30" stroke-width="2.5" stroke-linecap="round" />
    </g>
  ),
  leap: (
    <g stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M8 38 C12 18 26 10 38 12" />
      <path d="M30 6 L39 12 L32 20" />
      <path d="M6 42 H18" opacity="0.6" />
    </g>
  ),
  roar: (
    <g stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M10 18 V30 L18 30 L28 38 V10 L18 18 Z" fill="currentColor" stroke="none" />
      <path d="M33 17 C36 21 36 27 33 31" />
      <path d="M37 12 C43 19 43 29 37 36" opacity="0.7" />
    </g>
  ),
  gem: (
    <g>
      <path d="M24 5 L40 20 L24 43 L8 20 Z" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M8 20 H40 M24 5 L18 20 L24 43 L30 20 Z" stroke-width="1.6" stroke="var(--ui-bg)" fill="none" />
    </g>
  ),
  eye: (
    <g>
      <path
        d="M4 24 C11 13 18 10 24 10 C30 10 37 13 44 24 C37 35 30 38 24 38 C18 38 11 35 4 24 Z"
        stroke-width="3"
        fill="none"
      />
      <circle cx="24" cy="24" r="7" fill="currentColor" stroke="none" />
      <circle cx="26" cy="22" r="2.2" fill="var(--ui-text)" stroke="none" />
    </g>
  ),
  blaster: (
    <g stroke="none" fill="currentColor">
      <path d="M6 16 H34 L38 13 H42 V22 H26 L24 26 H18 L15 38 H8 L11 24 H6 Z" />
      <rect x="40" y="16" width="6" height="2.5" rx="1" fill="var(--ui-text)" />
    </g>
  ),
  spear: (
    <g stroke-linecap="round">
      <path d="M9 39 L33 15" stroke-width="3.2" />
      <path d="M31 8 L41 7 L40 17 L33 15 Z" fill="currentColor" stroke="none" />
      <path d="M8 34 L14 40" stroke-width="2.4" />
    </g>
  ),
  hourglass: (
    <g stroke-width="3" stroke-linejoin="round">
      <path d="M13 6 H35 M13 42 H35" stroke-linecap="round" />
      <path
        d="M15 6 C15 18 24 20 24 24 C24 28 15 30 15 42 H33 C33 30 24 28 24 24 C24 20 33 18 33 6"
        fill="none"
      />
      <path d="M18 40 C18 34 24 31 24 31 C24 31 30 34 30 40 Z" fill="currentColor" stroke="none" />
    </g>
  ),
  arrow: (
    <g stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M38 24 H10 M20 14 L10 24 L20 34" />
    </g>
  ),
};

export function Glyph({
  name,
  size = '100%',
  class: cls,
}: GlyphProps & { name: keyof typeof GLYPHS }): JSX.Element {
  return (
    <svg
      class={cls}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}

/** Square skill icon: element-tinted radial backdrop + glyph. */
export function SkillIcon({ id, class: cls }: { id: string; class?: string }): JSX.Element {
  const info = skillInfo(id);
  const style = { '--el': damageColor(info.element) } as JSX.CSSProperties;
  return (
    <span class={`hud-skillicon ${cls ?? ''}`} style={style}>
      <Glyph name={info.glyph} />
    </span>
  );
}

export function statusGlyph(id: string, buff: boolean): keyof typeof GLYPHS {
  if (buff) return skillInfo(id).glyph;
  switch (id) {
    case 'chill':
    case 'freeze':
      return 'snow';
    case 'toxin':
      return 'toxin';
    case 'burn':
      return 'flame';
    case 'stun':
    case 'lifted':
      return 'stars';
    case 'knockback':
      return 'arrow';
    default:
      return 'hourglass';
  }
}

const VIAL_COLOR: Record<ConsumableKind, string> = {
  heal: 'var(--ui-life)',
  mana: 'var(--ui-mana)',
  rejuv: 'var(--dmg-magic)',
  stamina: 'var(--ui-stamina)',
  recall: 'var(--dmg-cryo)',
  antidote: 'var(--dmg-toxin)',
  thaw: 'var(--dmg-plasma)',
  other: 'var(--ui-text-dim)',
};

/** Bakta stim / energy cell vial icon. */
export function ConsumableIcon({ kind }: { kind: ConsumableKind }): JSX.Element {
  const c = VIAL_COLOR[kind];
  if (kind === 'recall') {
    return (
      <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" style={{ color: c }}>
        <ellipse cx="24" cy="38" rx="13" ry="4" fill="none" stroke="currentColor" stroke-width="2.5" />
        <path d="M17 38 L21 12 H27 L31 38" fill="currentColor" opacity="0.35" />
        <path d="M24 6 V30" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        <circle cx="24" cy="10" r="4" fill="var(--ui-text)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" style={{ color: c }}>
      {/* cap */}
      <rect x="18" y="4" width="12" height="6" rx="1.5" fill="var(--ui-border-hi)" />
      {/* tube */}
      <path
        d="M17 10 H31 V36 C31 40.5 28 44 24 44 C20 44 17 40.5 17 36 Z"
        fill="var(--ui-bg-2)"
        stroke="var(--ui-text-dim)"
        stroke-width="1.5"
      />
      {/* liquid */}
      <path d="M18.5 19 H29.5 V36 C29.5 40 27 42.5 24 42.5 C21 42.5 18.5 40 18.5 36 Z" fill="currentColor" />
      <path d="M18.5 19 H29.5" stroke="var(--ui-text)" stroke-width="1" opacity="0.6" />
      {/* plus mark for heal stims, bolt for cells */}
      {kind === 'heal' && <path d="M24 25 V36 M18.5 30.5 H29.5" stroke="var(--ui-text)" stroke-width="2.6" />}
      {kind === 'mana' && <path d="M26 23 L21 31 H25 L22 38 L28 29 H24 Z" fill="var(--ui-text)" />}
      {/* glass highlight */}
      <path d="M20 13 V34" stroke="var(--ui-text)" stroke-width="1.6" stroke-linecap="round" opacity="0.45" />
    </svg>
  );
}

export type MenuIconName = 'character' | 'inventory' | 'skills' | 'quests' | 'map' | 'menu';

const MENU_PATHS: Record<MenuIconName, JSX.Element> = {
  character: (
    <g>
      <circle cx="24" cy="16" r="8" fill="currentColor" stroke="none" />
      <path
        d="M8 42 C8 31 15 26 24 26 C33 26 40 31 40 42 Z"
        fill="currentColor"
        stroke="none"
        opacity="0.85"
      />
    </g>
  ),
  inventory: (
    <g stroke-width="3" stroke-linejoin="round">
      <path d="M18 12 C18 7 30 7 30 12" fill="none" />
      <path d="M9 16 H39 L37 42 H11 Z" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M17 24 H31" stroke="var(--ui-bg)" stroke-linecap="round" />
    </g>
  ),
  skills: (
    <g stroke-width="2.4">
      <path d="M24 9 L13 24 L24 39 L35 24 Z M13 24 H35 M24 9 V39" fill="none" opacity="0.6" />
      <circle cx="24" cy="9" r="5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="24" r="5" fill="currentColor" stroke="none" />
      <circle cx="35" cy="24" r="5" fill="currentColor" stroke="none" />
      <circle cx="24" cy="39" r="5" fill="currentColor" stroke="none" />
    </g>
  ),
  quests: (
    <g>
      <rect x="10" y="6" width="28" height="36" rx="3" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M24 13 V28" stroke="var(--ui-bg)" stroke-width="4.5" stroke-linecap="round" />
      <circle cx="24" cy="35" r="2.8" fill="var(--ui-bg)" stroke="none" />
    </g>
  ),
  map: (
    <g stroke-width="2.6" stroke-linejoin="round">
      <path
        d="M6 12 L17 8 L31 12 L42 8 V36 L31 40 L17 36 L6 40 Z"
        fill="currentColor"
        stroke="none"
        opacity="0.85"
      />
      <path d="M17 8 V36 M31 12 V40" stroke="var(--ui-bg)" />
      <circle cx="24" cy="22" r="3" fill="var(--ui-bg)" stroke="none" />
    </g>
  ),
  menu: (
    <g stroke-width="4" stroke-linecap="round">
      <path d="M10 14 H38 M10 24 H38 M10 34 H38" />
    </g>
  ),
};

export function MenuIcon({ name }: { name: MenuIconName }): JSX.Element {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" stroke="currentColor" aria-hidden="true">
      {MENU_PATHS[name]}
    </svg>
  );
}

/** Boss crest: a winged star emblem (deliberately skull-free, PLAN §2). */
export function BossEmblem(): JSX.Element {
  return (
    <svg viewBox="0 0 64 40" width="100%" height="100%" aria-hidden="true" class="hud-boss-emblem">
      <path
        d="M32 4 L36 16 L48 20 L36 24 L32 36 L28 24 L16 20 L28 16 Z"
        fill="var(--q-unique)"
        stroke="var(--ui-border-hi)"
        stroke-width="1"
      />
      <path
        d="M26 20 C18 14 10 14 2 18 C9 19 13 22 15 26 C19 23 23 22 26 22 Z M38 20 C46 14 54 14 62 18 C55 19 51 22 49 26 C45 23 41 22 38 22 Z"
        fill="var(--ui-border-hi)"
        opacity="0.9"
      />
      <circle cx="32" cy="20" r="3" fill="var(--ui-bg)" />
    </svg>
  );
}
