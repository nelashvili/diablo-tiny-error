/**
 * D2 globe, reimagined: a glass sphere with animated liquid (two offset sine waves scrolling at
 * different speeds), rising bubbles, a specular highlight and a brass rim. Values show on
 * hover, keyboard focus, or tap (toggle).
 */
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Signal } from '@preact/signals';
import { t } from '../../data/names';
import { formatInt, ratio } from './format';

/** Wave path spanning 3 wavelengths (60px each) so a 60px scroll loops seamlessly. */
function wavePath(amp: number, phase: number): string {
  let d = `M ${-60 + phase} 0`;
  for (let x = -60; x < 180; x += 60) {
    d += ` q 15 ${-amp} 30 0 q 15 ${amp} 30 0`;
  }
  return d + ' V 140 H -60 Z';
}

const BACK_WAVE = wavePath(5, 0);
const FRONT_WAVE = wavePath(3.5, 0);

export function Orb(props: {
  kind: 'life' | 'mana';
  cur: Signal<number>;
  max: Signal<number>;
  label: string;
}): JSX.Element {
  const { kind, cur, max, label } = props;
  const [pinned, setPinned] = useState(false);
  const c = cur.value;
  const m = max.value;
  const r = ratio(c, m);
  // Liquid top travels from y=10 (full) to y=110 (empty) inside the r=50 glass.
  const top = 110 - r * 100;
  const low = kind === 'life' && r < 0.25 && c > 0;
  const color = kind === 'life' ? 'var(--ui-life)' : 'var(--ui-mana)';
  const id = `hud-orb-${kind}`;
  const valueText = t('hud.orbValue', { cur: formatInt(c), max: formatInt(m) });
  return (
    <button
      type="button"
      class={`hud-orb hud-orb--${kind}${low ? ' is-low' : ''}${pinned ? ' is-pinned' : ''}`}
      style={{ '--orb-c': color } as JSX.CSSProperties}
      aria-label={`${label}: ${valueText}`}
      onClick={() => setPinned((v) => !v)}
    >
      <svg viewBox="0 0 120 120" class="hud-orb__svg" aria-hidden="true">
        <defs>
          <clipPath id={`${id}-clip`}>
            <circle cx="60" cy="60" r="50" />
          </clipPath>
          <linearGradient id={`${id}-liq`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${color} 75%, var(--ui-text))` }} />
            <stop offset="0.45" style={{ stopColor: color }} />
            <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${color} 35%, var(--ui-bg))` }} />
          </linearGradient>
          <radialGradient id={`${id}-glass`} cx="0.38" cy="0.28" r="0.75">
            <stop offset="0" style={{ stopColor: 'var(--ui-text)', stopOpacity: 0.55 }} />
            <stop offset="0.25" style={{ stopColor: 'var(--ui-text)', stopOpacity: 0.08 }} />
            <stop offset="0.7" style={{ stopColor: 'var(--ui-bg)', stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: 'var(--ui-bg)', stopOpacity: 0.65 }} />
          </radialGradient>
          <radialGradient id={`${id}-void`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${color} 18%, var(--ui-bg))` }} />
            <stop offset="1" style={{ stopColor: 'var(--ui-bg)' }} />
          </radialGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--ui-border-hi)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--ui-border)' }} />
            <stop offset="1" style={{ stopColor: 'var(--ui-border-hi)' }} />
          </linearGradient>
        </defs>

        {/* outer bezel */}
        <circle cx="60" cy="60" r="58" class="hud-orb__bezel" />
        <circle cx="60" cy="60" r="50" fill={`url(#${id}-void)`} />

        <g clip-path={`url(#${id}-clip)`}>
          <g class="hud-orb__level" style={{ transform: `translateY(${top}px)` }}>
            <path d={BACK_WAVE} fill={color} class="hud-orb__wave hud-orb__wave--back" />
            <path d={FRONT_WAVE} fill={`url(#${id}-liq)`} class="hud-orb__wave hud-orb__wave--front" />
            <rect x="0" y="2" width="120" height="2" fill="var(--ui-text)" opacity="0.18" />
            <g class="hud-orb__bubbles" fill="var(--ui-text)">
              <circle cx="42" cy="100" r="2.2" />
              <circle cx="70" cy="100" r="1.6" />
              <circle cx="58" cy="100" r="2.6" />
              <circle cx="80" cy="100" r="1.3" />
            </g>
          </g>
        </g>

        {/* glass + rim */}
        <circle cx="60" cy="60" r="50" fill={`url(#${id}-glass)`} />
        <ellipse
          cx="45"
          cy="34"
          rx="16"
          ry="9"
          fill="var(--ui-text)"
          opacity="0.22"
          transform="rotate(-28 45 34)"
        />
        <circle cx="60" cy="60" r="51" fill="none" stroke={`url(#${id}-rim)`} stroke-width="3" />
        <circle
          cx="60"
          cy="60"
          r="55.5"
          fill="none"
          stroke="var(--ui-border)"
          stroke-width="1"
          opacity="0.8"
        />
        {/* quarter ticks */}
        <g stroke="var(--ui-border-hi)" stroke-width="2" stroke-linecap="round">
          <path d="M60 2 V7 M60 113 V118 M2 60 H7 M113 60 H118" />
        </g>
      </svg>
      <span class="hud-orb__value">
        <span class="hud-orb__num">{formatInt(c)}</span>
        <span class="hud-orb__max">/ {formatInt(m)}</span>
      </span>
      <span class="hud-orb__label">{label}</span>
    </button>
  );
}
