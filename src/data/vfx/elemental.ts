import type { VfxDef } from '../../render/types';

/**
 * Per-element generic effects. Conventions (see render/vfx/index.ts):
 *  bolt: size = head radius, particles = trail particles/sec, durationSec = flight time when spawned.
 *  nova: size = default max radius (tiles), particles = edge sparks, durationSec = expand time.
 *  impact: size = scale, particles = spark count.
 *  Element colors: physical white, plasma orange, cryo blue, storm yellow, toxin green, magic purple.
 */
const ELEMENTS = [
  { key: 'physical', color: 0xffffff, color2: 0xbfc8d8 },
  { key: 'plasma', color: 0xff8a2a, color2: 0xff3a10 },
  { key: 'cryo', color: 0x7fd4ff, color2: 0xe8f8ff },
  { key: 'storm', color: 0xffe94a, color2: 0xfff8c0 },
  { key: 'toxin', color: 0x6dff5a, color2: 0xc4ff9a },
  { key: 'magic', color: 0xb36bff, color2: 0xf0d8ff },
] as const;

const generated: VfxDef[] = [];
for (const e of ELEMENTS) {
  generated.push(
    {
      id: `vfx.impact.${e.key}`,
      primitive: 'impact',
      color: e.color,
      color2: e.color2,
      size: 1,
      particles: 14,
    },
    {
      id: `vfx.nova.${e.key}`,
      primitive: 'nova',
      color: e.color,
      color2: e.color2,
      size: 4,
      durationSec: 0.55,
      particles: 28,
    },
    {
      id: `vfx.bolt.${e.key}`,
      primitive: 'bolt',
      color: e.color,
      color2: e.color2,
      size: 0.28,
      durationSec: 0.5,
      particles: 45,
    },
  );
}

export default [
  ...generated,
  {
    id: 'vfx.bolt.plasmaOrb',
    primitive: 'bolt',
    color: 0xff8a2a,
    color2: 0xffe08a,
    size: 0.4,
    durationSec: 0.6,
    particles: 60,
  },
  // Blastur bolts: short bright streaks.
  {
    id: 'vfx.bolt.blastur',
    primitive: 'bolt',
    color: 0xff3030,
    color2: 0xffd0c0,
    size: 0.14,
    durationSec: 0.3,
    particles: 18,
  },
  {
    id: 'vfx.bolt.blasturBlue',
    primitive: 'bolt',
    color: 0x3a8cff,
    color2: 0xd0e8ff,
    size: 0.14,
    durationSec: 0.3,
    particles: 18,
  },
] satisfies VfxDef[];
