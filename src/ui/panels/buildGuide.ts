/**
 * Build Guide (PLAN §3, optional overlay, off by default). Ordered goals per class:
 * "skillId" = 1 point, "skillId:N" = reach N hard points. Ids follow the PLAN skill names in
 * camelCase; entries for skills that don't exist yet are skipped.
 */
import type { ClassId } from '../../core/types';

export const BUILD_GUIDES: Record<ClassId, string[]> = {
  // Whirlwind-style Yedi: Litesaber Strike -> Forse Leap -> Saber Cyclone, with Saber Mastery.
  yediKnight: [
    'litesaberStrike',
    'saberMastery',
    'fearRoar',
    'litesaberStrike:3',
    'twinStrike',
    'forseLeap',
    'rally',
    'stunStrike',
    'saberMastery:5',
    'endurance',
    'focusStrike',
    'ironWill',
    'leapStrike',
    'saberFlurry',
    'battleOrders',
    'swiftStep',
    'saberCyclone',
    'saberCyclone:20',
    'saberMastery:20',
    'battleOrders:10',
  ],
  // Arc Fury Huntur: javelin tree with Dodge/Avoid/Evade.
  bountyHuntur: [
    'vibroJab',
    'precision',
    'scanPulse',
    'powerThrust',
    'toxinDart',
    'dodge',
    'arcJavelin',
    'impale',
    'avoid',
    'chargedThrust',
    'toxinCloud',
    'armorPiercing',
    'evade',
    'fend',
    'thunderThrust',
    'arcFury',
    'arcFury:20',
    'arcJavelin:10',
    'chargedThrust:10',
  ],
  // Frozen Orb Adept: Ice Bolt -> Frost Nova/Ice Blast -> Glacial Spike -> Blizzard -> Frozen Orb.
  forseAdept: [
    'iceBolt',
    'frostArmor',
    'iceBolt:3',
    'frostNova',
    'iceBlast',
    'forsePull',
    'staticField',
    'shiverArmor',
    'iceBlast:5',
    'glacialSpike',
    'forseBlink',
    'blizzard',
    'frozenOrb',
    'cryoMastery',
    'frozenOrb:20',
    'cryoMastery:10',
    'iceBolt:20',
  ],
};
