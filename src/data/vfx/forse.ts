import type { VfxDef } from '../../render/types';

/**
 * Forse powers (Push, Pull, Grip, Lightning, Repulse, Mind Trik), Saber Throw, Jetpak Boost and the
 * enemy Syth versions. Hero powers are blue-violet; Syth powers are red or violet-white.
 * Arcs (`vfx.arc.*`) are beams drawn from the hand to each target by the `skillArc` event.
 */
export default [
  // --- lightning arcs: short-lived jagged beams, re-fired every cast while the button is held
  {
    id: 'vfx.arc.forseLightning',
    primitive: 'beam',
    color: 0x9ab8ff,
    color2: 0xffffff,
    size: 0.22,
    durationSec: 0.22,
    particles: 16,
  },
  {
    id: 'vfx.arc.sythLightning',
    primitive: 'beam',
    color: 0xb48cff,
    color2: 0xf4ecff,
    size: 0.24,
    durationSec: 0.3,
    particles: 16,
  },
  // --- push / repulse: a fast ripple of bent air
  {
    id: 'vfx.forsePush',
    primitive: 'nova',
    color: 0x8fb0ff,
    color2: 0xe8f0ff,
    size: 3,
    durationSec: 0.35,
    particles: 22,
  },
  {
    id: 'vfx.forsePush.syth',
    primitive: 'nova',
    color: 0xff4a4a,
    color2: 0xffc0c0,
    size: 3,
    durationSec: 0.35,
    particles: 22,
  },
  {
    id: 'vfx.forseRepulse',
    primitive: 'nova',
    color: 0x8fb0ff,
    color2: 0xffffff,
    size: 4,
    durationSec: 0.5,
    particles: 40,
  },
  {
    id: 'vfx.mindTrik',
    primitive: 'nova',
    color: 0x6ad8ff,
    color2: 0xd8f6ff,
    size: 6,
    durationSec: 0.8,
    particles: 24,
  },
  // --- grip: a pale tether to the target, a swirl under it, and a dusty thud when it drops
  {
    id: 'vfx.grip',
    primitive: 'beam',
    color: 0x8fb0ff,
    color2: 0xe8f0ff,
    size: 0.12,
    durationSec: 0.5,
    particles: 0,
  },
  {
    id: 'vfx.grip.syth',
    primitive: 'beam',
    color: 0xff4a4a,
    color2: 0xffd0d0,
    size: 0.12,
    durationSec: 0.6,
    particles: 0,
  },
  { id: 'vfx.grip.lift', primitive: 'aura', color: 0x8fb0ff, color2: 0xffffff, size: 1.2, durationSec: 1.2 },
  { id: 'vfx.grip.drop', primitive: 'impact', color: 0xb59a74, color2: 0x6b5a44, size: 1.1, particles: 12 },
  { id: 'vfx.wallSlam', primitive: 'impact', color: 0xe8e0d0, color2: 0x8a8070, size: 1.4, particles: 18 },
  {
    id: 'vfx.beam.syth',
    primitive: 'beam',
    color: 0xff4a4a,
    color2: 0xffd0d0,
    size: 0.18,
    durationSec: 0.4,
    particles: 0,
  },
  // --- telegraphs: hands glowing before an enemy power fires
  { id: 'vfx.windup.syth', primitive: 'aura', color: 0xb48cff, color2: 0xffffff, size: 1 },
  { id: 'vfx.windup.sythRed', primitive: 'aura', color: 0xff3a3a, color2: 0xffc0c0, size: 1 },
  // --- deflection spark on a litesaber
  { id: 'vfx.deflect', primitive: 'impact', color: 0xffffff, color2: 0x9ad0ff, size: 1, particles: 16 },
  // --- thrown sabers: spinning glowing blades
  {
    id: 'vfx.bolt.saber',
    primitive: 'bolt',
    color: 0x4aa8ff,
    color2: 0xe0f2ff,
    size: 0.34,
    durationSec: 1,
    particles: 50,
  },
  {
    id: 'vfx.bolt.saberRed',
    primitive: 'bolt',
    color: 0xff2a2a,
    color2: 0xffd8d8,
    size: 0.34,
    durationSec: 1,
    particles: 50,
  },
  // --- jetpak landing: a plasma burst ring
  {
    id: 'vfx.jetpak',
    primitive: 'nova',
    color: 0xff8a2a,
    color2: 0xffe08a,
    size: 2,
    durationSec: 0.4,
    particles: 30,
  },
] satisfies VfxDef[];
