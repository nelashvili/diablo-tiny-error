import type { MissileDef } from '../schema';

/** Monster-only projectiles (ids prefixed m_). */
export default [
  { id: 'm_blasturBolt', speed: 14, range: 14, radius: 0.2, vfx: 'vfx.bolt.blastur' },
  { id: 'm_stormBolt', speed: 12, range: 12, radius: 0.25, vfx: 'vfx.bolt.storm' },
  { id: 'm_quill', speed: 13, range: 9, radius: 0.15, vfx: 'vfx.bolt.quill' },
  { id: 'm_darkBolt', speed: 10, range: 13, radius: 0.3, explodeRadius: 0.8, vfx: 'vfx.bolt.plasma' },
  { id: 'm_countessBolt', speed: 11, range: 14, radius: 0.3, explodeRadius: 1, vfx: 'vfx.bolt.plasma' },
  // Syth litesaber thrown like a boomerang: out and back, hitting on both legs.
  {
    id: 'm_saberThrow',
    speed: 13,
    range: 8,
    radius: 0.45,
    pierce: true,
    returns: true,
    vfx: 'vfx.bolt.saberRed',
  },
] satisfies MissileDef[];
