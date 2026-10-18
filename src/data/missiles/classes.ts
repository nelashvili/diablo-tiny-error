import type { MissileDef } from '../schema';

/** Class skill projectiles (Bounty Huntur blasturs & javelins, Forse Adept spells). */
export default [
  // Bounty Huntur — blasturs
  { id: 'chargedShot', speed: 26, range: 18, radius: 0.25, vfx: 'vfx.bolt.blasturBlue' },
  { id: 'plasmaShot', speed: 24, range: 18, radius: 0.28, vfx: 'vfx.bolt.plasma' },
  { id: 'cryoShot', speed: 24, range: 18, radius: 0.28, vfx: 'vfx.bolt.cryo' },
  { id: 'burstRound', speed: 22, range: 18, radius: 0.3, explodeRadius: 1.8, vfx: 'vfx.bolt.plasmaOrb' },
  { id: 'freezeRound', speed: 22, range: 18, radius: 0.3, explodeRadius: 1.8, vfx: 'vfx.bolt.cryo' },
  { id: 'seekerRound', speed: 20, range: 22, radius: 0.3, homing: true, vfx: 'vfx.bolt.blasturBlue' },
  {
    id: 'incendiaryRound',
    speed: 20,
    range: 18,
    radius: 0.32,
    explodeRadius: 2.6,
    vfx: 'vfx.bolt.plasmaOrb',
  },
  { id: 'cryoBurst', speed: 20, range: 18, radius: 0.32, explodeRadius: 2.6, vfx: 'vfx.bolt.cryo' },
  // Bounty Huntur — javelins
  { id: 'toxinDart', speed: 18, range: 14, radius: 0.3, explodeRadius: 1.2, vfx: 'vfx.bolt.toxin' },
  { id: 'arcJavelin', speed: 26, range: 16, radius: 0.3, pierce: true, vfx: 'vfx.bolt.storm' },
  { id: 'arcFury', speed: 24, range: 16, radius: 0.3, pierce: true, vfx: 'vfx.bolt.storm' },
  // Forse Adept
  { id: 'plasmaBolt', speed: 16, range: 15, radius: 0.3, vfx: 'vfx.bolt.plasma' },
  { id: 'plasmaOrb', speed: 14, range: 15, radius: 0.35, explodeRadius: 2.2, vfx: 'vfx.bolt.plasmaOrb' },
  { id: 'sparkBolt', speed: 9, range: 9, radius: 0.25, vfx: 'vfx.bolt.storm' },
  { id: 'iceBolt', speed: 16, range: 15, radius: 0.3, vfx: 'vfx.bolt.cryo' },
  { id: 'iceBlast', speed: 15, range: 15, radius: 0.32, vfx: 'vfx.bolt.cryo' },
  { id: 'glacialSpike', speed: 14, range: 15, radius: 0.35, explodeRadius: 2.2, vfx: 'vfx.bolt.cryo' },
  {
    id: 'frozenOrb',
    speed: 7,
    range: 13,
    radius: 0.5,
    pierce: true,
    explodeRadius: 3.5,
    vfx: 'vfx.bolt.cryo',
  },
  // Blastur Turret shots
  { id: 'turretBolt', speed: 18, range: 12, radius: 0.28, vfx: 'vfx.bolt.plasma' },
] satisfies MissileDef[];
