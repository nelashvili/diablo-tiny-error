/**
 * Behaviour variants per VfxDef id. VfxDef (frozen contract) has no `style` field, so variants are
 * looked up here by id; unlisted ids use the primitive's default style.
 */
export type VfxStyle =
  | 'default'
  | 'blastur' // bolt: short bright streak
  | 'orb' // bolt: big soft orb with sparks
  | 'lightning' // beam: jagged
  | 'stream' // beam: smooth wobbling stream
  | 'falling' // aoeZone: shards/snow falling
  | 'cloud' // aoeZone: rising smoke
  | 'strikes' // aoeZone: periodic sky strikes
  | 'ringUp' // nova: ring + rising motes (shouts)
  | 'flash' // nova: vertical flash (teleport)
  | 'dust' // impact: alpha dust puff
  | 'slash' // impact: litesaber cut streak + directional sparks
  | 'embers' // impact: rising embers
  | 'frost'; // impact: falling ice shards + cold mist

const TABLE: Record<string, VfxStyle> = {
  'vfx.bolt.blastur': 'blastur',
  'vfx.bolt.blasturBlue': 'blastur',
  'vfx.bolt.javelin': 'blastur',
  'vfx.bolt.quill': 'blastur',
  'vfx.bolt.plasmaOrb': 'orb',
  'vfx.bolt.cryo': 'orb',
  'vfx.bolt.storm': 'orb',
  'vfx.bolt.toxin': 'orb',
  'vfx.bolt.magic': 'orb',
  'vfx.beam.forse': 'lightning',
  'vfx.beam.storm': 'lightning',
  'vfx.beam.plasma': 'stream',
  'vfx.arc.forseLightning': 'lightning',
  'vfx.arc.sythLightning': 'lightning',
  'vfx.grip': 'stream',
  'vfx.grip.syth': 'stream',
  'vfx.beam.syth': 'stream',
  'vfx.forseRepulse': 'ringUp',
  'vfx.grip.drop': 'dust',
  'vfx.wallSlam': 'dust',
  'vfx.zone.blizzard': 'falling',
  'vfx.zone.toxinCloud': 'cloud',
  'vfx.zone.starfall': 'strikes',
  'vfx.nova.battleCry': 'ringUp',
  'vfx.teleport': 'flash',
  'vfx.leapLanding': 'dust',
  'vfx.saber.sparks': 'slash',
  'vfx.saber.hit.red': 'slash',
  'vfx.saber.hit.blue': 'slash',
  'vfx.saber.hit.yellow': 'slash',
  'vfx.saber.hit.green': 'slash',
  'vfx.saber.hit.white': 'slash',
  'vfx.saber.hit.purple': 'slash',
  'vfx.saber.hit.syth': 'slash',
  'vfx.saber.burst.red': 'embers',
  'vfx.saber.burst.blue': 'frost',
  'vfx.saber.burst.yellow': 'lightning',
  'vfx.saber.burst.green': 'dust',
  'vfx.saber.burst.white': 'flash',
  'vfx.saber.burst.purple': 'ringUp',
};

export function styleOf(id: string): VfxStyle {
  return TABLE[id] ?? 'default';
}
