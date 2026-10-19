import type { VfxDef } from '../../render/types';

/**
 * Litesaber blade colors (core/items/blade): per color a swing trail (`vfx.saber.attack.<color>`), a
 * slash cut with sparks on every hit (`vfx.saber.hit.<color>`) and the color's own burst on top
 * (`vfx.saber.burst.<color>`): plasma embers, cryo frost, storm arcs, toxin puffs, a Forse ring, a white
 * flash, Syth smoke. Plain sabers use vfx.saber.attack / vfx.saber.sparks (data/vfx/skills.ts).
 */
const TRAIL = { primitive: 'saberTrail', size: 0.42, durationSec: 0.3 } as const;
const SLASH = { primitive: 'impact', size: 1.2, particles: 18 } as const;

export default [
  // --- swing trails: color = ribbon, color2 = leading glow
  { id: 'vfx.saber.attack.red', ...TRAIL, color: 0xff3a10, color2: 0xffc08a },
  { id: 'vfx.saber.attack.blue', ...TRAIL, color: 0x5ad2ff, color2: 0xeefcff },
  { id: 'vfx.saber.attack.yellow', ...TRAIL, color: 0xffc21a, color2: 0xfff6c0 },
  { id: 'vfx.saber.attack.green', ...TRAIL, color: 0x2aff4a, color2: 0xd0ffd8 },
  { id: 'vfx.saber.attack.white', ...TRAIL, color: 0xdfe8ff, color2: 0xffffff, size: 0.48 },
  { id: 'vfx.saber.attack.purple', ...TRAIL, color: 0xa040ff, color2: 0xf0d8ff },
  { id: 'vfx.saber.attack.syth', ...TRAIL, color: 0xe00a20, color2: 0xff8a8a },
  // --- slash cuts: color = sparks, color2 = the cut streak
  { id: 'vfx.saber.hit.red', ...SLASH, color: 0xffb04a, color2: 0xff3a10 },
  { id: 'vfx.saber.hit.blue', ...SLASH, color: 0xeefcff, color2: 0x5ad2ff },
  { id: 'vfx.saber.hit.yellow', ...SLASH, color: 0xfff0a0, color2: 0xffc21a },
  { id: 'vfx.saber.hit.green', ...SLASH, color: 0xd8ffb0, color2: 0x2aff4a },
  { id: 'vfx.saber.hit.white', ...SLASH, color: 0xffffff, color2: 0xcfe0ff, particles: 32 },
  { id: 'vfx.saber.hit.purple', ...SLASH, color: 0xf0c8ff, color2: 0xa040ff },
  { id: 'vfx.saber.hit.syth', ...SLASH, color: 0xff7a6a, color2: 0xe00a20 },
  // --- each color's own burst
  // plasma: embers drifting up off the cut
  {
    id: 'vfx.saber.burst.red',
    primitive: 'impact',
    color: 0xff7a1a,
    color2: 0x8a1a00,
    size: 1,
    particles: 18,
  },
  // cryo: ice shards falling around a frost ring
  {
    id: 'vfx.saber.burst.blue',
    primitive: 'impact',
    color: 0xd8f6ff,
    color2: 0x5ad2ff,
    size: 1,
    particles: 16,
  },
  // storm: short lightning arcs jumping off the target (spawned 2-3 at a time)
  {
    id: 'vfx.saber.burst.yellow',
    primitive: 'beam',
    color: 0xffe066,
    color2: 0xffffff,
    size: 0.14,
    durationSec: 0.16,
    particles: 8,
  },
  // toxin: a green puff
  {
    id: 'vfx.saber.burst.green',
    primitive: 'impact',
    color: 0x4adf3a,
    color2: 0x1a5a12,
    size: 0.8,
    particles: 10,
  },
  // diamond: a white flash
  {
    id: 'vfx.saber.burst.white',
    primitive: 'nova',
    color: 0xdfe8ff,
    color2: 0xffffff,
    size: 0.8,
    durationSec: 0.25,
    particles: 10,
  },
  // amethyst: a Forse ring with rising motes
  {
    id: 'vfx.saber.burst.purple',
    primitive: 'nova',
    color: 0xa040ff,
    color2: 0xf0d8ff,
    size: 1.1,
    durationSec: 0.35,
    particles: 12,
  },
  // syth: dark smoke
  {
    id: 'vfx.saber.burst.syth',
    primitive: 'dissolveSmoke',
    color: 0x2a0a10,
    color2: 0x8a0a1a,
    size: 0.45,
    durationSec: 0.8,
    particles: 8,
  },
] satisfies VfxDef[];
