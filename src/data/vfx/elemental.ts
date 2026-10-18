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
    color: 0xff1a0a,
    color2: 0xffe0d8,
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
  // Melee hit flavors (monster claws/slams/wraith touches, spear stabs).
  { id: 'vfx.hit.claw', primitive: 'impact', color: 0xffe0c0, color2: 0xc8a080, size: 0.9, particles: 10 },
  { id: 'vfx.hit.slam', primitive: 'impact', color: 0xd8c8a8, color2: 0x8a7a60, size: 1.4, particles: 18 },
  { id: 'vfx.hit.wraith', primitive: 'impact', color: 0x9a8aff, color2: 0x3a2a6a, size: 1, particles: 14 },
  { id: 'vfx.hit.stab', primitive: 'impact', color: 0xffffff, color2: 0xa8c0e0, size: 0.8, particles: 8 },
  // Basic attacks and monster casts.
  { id: 'vfx.slash', primitive: 'impact', color: 0xffffff, color2: 0xc8d4e8, size: 0.8, particles: 8 },
  { id: 'vfx.kick', primitive: 'impact', color: 0xe8dcc8, color2: 0x9a8a70, size: 0.8, particles: 8 },
  { id: 'vfx.throw', primitive: 'impact', color: 0xd8e0ea, color2: 0xffffff, size: 0.5, particles: 4 },
  {
    id: 'vfx.muzzle.red',
    primitive: 'impact',
    color: 0xff4a30,
    color2: 0xfff0e0,
    size: 0.45,
    durationSec: 0.12,
    particles: 6,
  },
  { id: 'vfx.muzzle.quill', primitive: 'impact', color: 0x9a7a50, color2: 0xf0e0c0, size: 0.4, particles: 5 },
  { id: 'vfx.cast.plasma', primitive: 'impact', color: 0xff8a2a, color2: 0xffe08a, size: 0.9, particles: 12 },
  { id: 'vfx.cast.storm', primitive: 'impact', color: 0xffe94a, color2: 0xfff8c0, size: 0.9, particles: 12 },
  { id: 'vfx.cast.toxin', primitive: 'impact', color: 0x6dff5a, color2: 0xc4ff9a, size: 0.9, particles: 12 },
  {
    id: 'vfx.nova.darkStorm',
    primitive: 'nova',
    color: 0x7a4aff,
    color2: 0x2a1a5a,
    size: 4,
    durationSec: 0.6,
    particles: 30,
  },
  // Muzzle flashes, spawned where a blastur bolt leaves the barrel.
  {
    id: 'vfx.muzzle.blastur',
    primitive: 'impact',
    color: 0xff4a30,
    color2: 0xfff0e0,
    size: 0.45,
    durationSec: 0.12,
    particles: 6,
  },
  {
    id: 'vfx.muzzle.blasturBlue',
    primitive: 'impact',
    color: 0x3a8cff,
    color2: 0xe8f4ff,
    size: 0.45,
    durationSec: 0.12,
    particles: 6,
  },
  // Thrown weapons and monster quills: thin streaks; discs: a spinning silver glint.
  {
    id: 'vfx.bolt.javelin',
    primitive: 'bolt',
    color: 0xb8c4d0,
    color2: 0xffffff,
    size: 0.1,
    durationSec: 0.3,
    particles: 0,
  },
  {
    id: 'vfx.bolt.quill',
    primitive: 'bolt',
    color: 0x9a7a50,
    color2: 0xf0e0c0,
    size: 0.07,
    durationSec: 0.3,
    particles: 0,
  },
  {
    id: 'vfx.bolt.disc',
    primitive: 'bolt',
    color: 0x9fc4ff,
    color2: 0xffffff,
    size: 0.2,
    durationSec: 0.4,
    particles: 20,
  },
] satisfies VfxDef[];
