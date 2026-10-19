/**
 * How each litesaber blade color looks and moves: blade/core colors, glow width and how the blade
 * flickers (plasma blazes, cryo holds steady, storm crackles, toxin breathes, a Syth blade is unstable).
 * The swing trail and hit effects for each color are VFX defs named after it (data/vfx/sabers.ts).
 */
import type { BladeColor } from '../../core/items/blade';

export type Flicker = 'hum' | 'blaze' | 'steady' | 'crackle' | 'breathe' | 'bright' | 'waver' | 'unstable';

export interface BladeLook {
  color: number;
  /** How far the white-hot core leans to white (0..1). */
  coreWhite: number;
  /** Glow width multiplier. */
  width: number;
  flicker: Flicker;
}

export const BLADE_LOOKS: Record<BladeColor, BladeLook> = {
  red: { color: 0xff3c14, coreWhite: 0.7, width: 1.1, flicker: 'blaze' },
  blue: { color: 0x7fe2ff, coreWhite: 0.8, width: 1, flicker: 'steady' },
  yellow: { color: 0xffd23a, coreWhite: 0.75, width: 1.05, flicker: 'crackle' },
  green: { color: 0x3dff5a, coreWhite: 0.7, width: 1.05, flicker: 'breathe' },
  white: { color: 0xeef2ff, coreWhite: 0.9, width: 1.3, flicker: 'bright' },
  purple: { color: 0xb04bff, coreWhite: 0.7, width: 1.1, flicker: 'waver' },
  syth: { color: 0xff0a24, coreWhite: 0.5, width: 1.15, flicker: 'unstable' },
};

export interface FlickerFrame {
  /** Glow width scale. */
  w: number;
  /** Sideways glow jitter (blade units). */
  jx: number;
}

/**
 * Glow width (and jitter) at `time` for a flicker kind. `rnd` is a 0..1 random source (crackles and
 * unstable blades spit at random); `phase` de-syncs blades from each other.
 */
export function flickerAt(
  kind: Flicker,
  time: number,
  phase: number,
  rnd: () => number,
  out: FlickerFrame,
): FlickerFrame {
  const t = time + phase;
  out.jx = 0;
  switch (kind) {
    case 'blaze':
      out.w = 1 + Math.sin(t * 24) * 0.09 + Math.sin(t * 6.8) * 0.07;
      break;
    case 'steady':
      out.w = 1 + Math.sin(t * 5.5) * 0.03;
      break;
    case 'crackle': {
      const spike = rnd() > 0.86;
      out.w = 1 + (spike ? 0.18 + rnd() * 0.25 : Math.sin(t * 52) * 0.04);
      if (spike) out.jx = (rnd() - 0.5) * 0.02;
      break;
    }
    case 'breathe':
      out.w = 1 + Math.sin(t * 3.1) * 0.13;
      break;
    case 'bright':
      out.w = 1.06 + Math.sin(t * 30) * 0.035;
      break;
    case 'waver':
      out.w = 1 + Math.sin(t * 8.5) * 0.08 + Math.sin(t * 31) * 0.03;
      break;
    case 'unstable':
      out.w = 1 + (rnd() - 0.45) * 0.3;
      out.jx = (rnd() - 0.5) * 0.025;
      break;
    default:
      out.w = 1 + Math.sin(t * 38) * 0.06 + Math.sin(t * 11.3) * 0.05;
  }
  return out;
}
