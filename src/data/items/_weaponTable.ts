/** Weapon line table. Each row is a NORMAL base; exceptional/elite are derived (see weapons.ts). */
import type { WeaponClass } from '../schema';
import type { ClassId } from '../../core/types';

export interface WeaponClassInfo {
  twoHanded: boolean;
  size: { w: number; h: number };
  /** Reach in tiles (ranged classes: projectile range). */
  range: number;
  /** Base attacks per second. */
  speed: number;
  maxSockets: number;
  durability: number;
  classOnly?: ClassId;
}

export const WEAPON_CLASSES: Record<WeaponClass, WeaponClassInfo> = {
  litesaber: {
    twoHanded: false,
    size: { w: 1, h: 3 },
    range: 1.6,
    speed: 1.3,
    maxSockets: 3,
    durability: 24,
  },
  doubleLitesaber: {
    twoHanded: true,
    size: { w: 2, h: 3 },
    range: 2.0,
    speed: 1.0,
    maxSockets: 4,
    durability: 28,
  },
  vibroAxe: { twoHanded: false, size: { w: 2, h: 3 }, range: 1.5, speed: 1.1, maxSockets: 4, durability: 26 },
  shockBaton: {
    twoHanded: false,
    size: { w: 1, h: 3 },
    range: 1.4,
    speed: 1.2,
    maxSockets: 3,
    durability: 24,
  },
  vibroPike: { twoHanded: true, size: { w: 2, h: 4 }, range: 2.6, speed: 0.9, maxSockets: 5, durability: 30 },
  throwingDisc: {
    twoHanded: false,
    size: { w: 1, h: 2 },
    range: 8,
    speed: 1.3,
    maxSockets: 2,
    durability: 20,
  },
  javelin: { twoHanded: false, size: { w: 1, h: 3 }, range: 9, speed: 1.1, maxSockets: 3, durability: 20 },
  blasturPistol: {
    twoHanded: true,
    size: { w: 2, h: 3 },
    range: 12,
    speed: 1.3,
    maxSockets: 4,
    durability: 22,
  },
  blasturRifle: {
    twoHanded: true,
    size: { w: 2, h: 3 },
    range: 13,
    speed: 0.9,
    maxSockets: 4,
    durability: 24,
    classOnly: 'bountyHuntur',
  },
  forseStaff: {
    twoHanded: true,
    size: { w: 2, h: 4 },
    range: 2.2,
    speed: 1.0,
    maxSockets: 5,
    durability: 20,
  },
  kyburFocus: {
    twoHanded: false,
    size: { w: 1, h: 2 },
    range: 1.2,
    speed: 1.1,
    maxSockets: 3,
    durability: 20,
    classOnly: 'forseAdept',
  },
};

/** D2 per-weapon-class Str/Dex damage bonus (% per 100 points). */
/** Which attribute powers each weapon class: blades hit with strength, blasters aim with dexterity, Forse weapons channel energy. */
export const WEAPON_STAT_BONUS: Record<WeaponClass, { str: number; dex: number; ene: number }> = {
  litesaber: { str: 100, dex: 0, ene: 0 },
  doubleLitesaber: { str: 100, dex: 0, ene: 0 },
  vibroAxe: { str: 100, dex: 0, ene: 0 },
  shockBaton: { str: 100, dex: 0, ene: 0 },
  vibroPike: { str: 100, dex: 0, ene: 0 },
  throwingDisc: { str: 75, dex: 75, ene: 0 },
  javelin: { str: 75, dex: 75, ene: 0 },
  blasturPistol: { str: 0, dex: 100, ene: 0 },
  blasturRifle: { str: 0, dex: 100, ene: 0 },
  forseStaff: { str: 0, dex: 0, ene: 100 },
  kyburFocus: { str: 0, dex: 0, ene: 100 },
};

export interface WeaponLine {
  cls: WeaponClass;
  names: [string, string, string];
  min: number;
  max: number;
  str: number;
  dex: number;
  qlvl: number;
  /** Speed multiplier vs class speed. */
  spd: number;
  cost: number;
}

const w = (
  cls: WeaponClass,
  n1: string,
  n2: string,
  n3: string,
  min: number,
  max: number,
  str: number,
  dex: number,
  qlvl: number,
  spd: number,
  cost: number,
): WeaponLine => ({ cls, names: [n1, n2, n3], min, max, str, dex, qlvl, spd, cost });

export const WEAPON_LINES: WeaponLine[] = [
  // litesabers (swords)
  w('litesaber', 'Training Litesaber', 'Duelist Litesaber', 'Masterwork Litesaber', 2, 7, 0, 0, 1, 1, 30),
  w('litesaber', 'Scout Litesaber', 'Ranger Litesaber', 'Vanguard Litesaber', 2, 9, 12, 0, 3, 1.0, 35),
  w('litesaber', 'Cadet Saber', 'Knight Saber', 'Grandmaster Saber', 3, 8, 0, 21, 5, 1.15, 40),
  w('litesaber', 'Guard Blade', 'Templar Blade', 'Paragon Blade', 5, 11, 25, 25, 8, 1.0, 75),
  w('litesaber', 'Sentry Litesaber', 'Warden Litesaber', 'Sentinel Litesaber', 6, 14, 28, 0, 10, 1.0, 90),
  w('litesaber', 'Padawon Falchion', 'Veteran Falchion', 'Warlord Falchion', 9, 17, 33, 0, 12, 0.9, 100),
  // double litesabers (2H swords)
  w(
    'doubleLitesaber',
    'Double Litesaber',
    'Dual Phase Litesaber',
    'Maul Pattern Litesaber',
    8,
    17,
    35,
    27,
    6,
    1.0,
    120,
  ),
  w(
    'doubleLitesaber',
    'Long Hilt Saber',
    'Long Hilt Duelist',
    'Long Hilt Overlord',
    13,
    30,
    47,
    0,
    14,
    0.9,
    180,
  ),
  w(
    'doubleLitesaber',
    'Heavy Dual Saber',
    'Heavy Dual Champion',
    'Heavy Dual Executioner',
    16,
    38,
    55,
    0,
    20,
    0.85,
    240,
  ),
  // vibro-axes
  w('vibroAxe', 'Vibro Hatchet', 'Vibro Tomahawk', 'Vibro Warhatchet', 3, 6, 0, 0, 1, 1.2, 25),
  w('vibroAxe', 'Vibro Axe', 'Vibro Reaver', 'Vibro Executioner', 4, 11, 32, 0, 4, 1.1, 50),
  w('vibroAxe', 'Double Vibro Axe', 'Twin Vibro Reaver', 'Twin Vibro Annihilator', 6, 15, 43, 0, 9, 1.0, 85),
  w('vibroAxe', 'Scrap Cleaver', 'Scrap Hewer', 'Scrap Devastator', 8, 14, 49, 0, 13, 1.0, 110),
  // shock batons (maces)
  w('shockBaton', 'Shock Stick', 'Shock Truncheon', 'Shock Pacifier', 1, 6, 0, 0, 1, 1.2, 20),
  w('shockBaton', 'Spiked Baton', 'Spiked Enforcer', 'Spiked Disciplinarian', 5, 8, 0, 0, 3, 1.2, 35),
  w('shockBaton', 'Stun Mace', 'Stun Maul', 'Stun Hammer', 5, 12, 27, 0, 6, 1.1, 60),
  w('shockBaton', 'Morning Zapper', 'Evening Zapper', 'Midnight Zapper', 7, 16, 36, 0, 12, 1.0, 100),
  // vibro-pikes (polearms)
  w('vibroPike', 'Vibro Spear', 'Vibro Lance', 'Vibro Dragoon Lance', 3, 15, 20, 0, 3, 0.95, 40),
  w('vibroPike', 'Vibro Trident', 'Vibro Triple Lance', 'Vibro Tri-Annihilator', 9, 27, 30, 0, 10, 0.9, 90),
  w('vibroPike', 'Halberd Pike', 'Halberd Piker', 'Halberd Piker Supreme', 12, 45, 75, 0, 22, 0.8, 220),
  // throwing discs
  w('throwingDisc', 'Practice Disc', 'Combat Disc', 'War Disc', 1, 3, 0, 0, 1, 1.2, 15),
  w('throwingDisc', 'Razor Disc', 'Razor Chakram', 'Razor Hypernova', 3, 9, 20, 20, 7, 1.3, 40),
  w('throwingDisc', 'Balanced Disc', 'Balanced Chakram', 'Balanced Quasar', 4, 11, 25, 25, 12, 1.2, 60),
  // javelins
  w('javelin', 'Javelin Trainer', 'Javelin Duelist', 'Javelin Ace', 3, 8, 0, 0, 1, 1.1, 25),
  w('javelin', 'War Javelin', 'War Javelin Mk2', 'War Javelin Mk3', 6, 14, 25, 20, 9, 1.1, 60),
  w('javelin', 'Harpoon Javelin', 'Harpoon Hunter', 'Harpoon Slayer', 10, 22, 40, 35, 18, 1.0, 110),
  // blastur pistols (bows)
  w('blasturPistol', 'Scout Blastur', 'Ranger Blastur', 'Sentinel Blastur', 2, 6, 0, 0, 1, 1.1, 30),
  w('blasturPistol', 'Hunting Blastur', 'Hunting Marksman', 'Hunting Sharpshooter', 3, 9, 20, 0, 5, 1.1, 50),
  w('blasturPistol', 'Patrol Blastur', 'Patrol Marksman', 'Patrol Sharpshooter', 4, 11, 22, 15, 8, 1.1, 70),
  w('blasturPistol', 'Long Blastur', 'Long Marksman', 'Long Sharpshooter', 5, 14, 24, 25, 12, 1.0, 90),
  w('blasturPistol', 'Heavy Blastur', 'Heavy Gunner', 'Heavy Annihilator', 6, 18, 30, 35, 20, 0.9, 130),
  // blastur rifles (Bounty Huntur only)
  w(
    'blasturRifle',
    'Huntur Carbine',
    'Huntur Carbine Elite',
    'Huntur Carbine Supreme',
    6,
    11,
    21,
    0,
    4,
    1.0,
    60,
  ),
  w(
    'blasturRifle',
    'Tracker Rifle',
    'Tracker Rifle Elite',
    'Tracker Rifle Supreme',
    7,
    15,
    26,
    15,
    8,
    0.95,
    95,
  ),
  w('blasturRifle', 'Huntur Rifle', 'Huntur Rifle Elite', 'Huntur Rifle Supreme', 8, 20, 0, 40, 12, 0.9, 130),
  w(
    'blasturRifle',
    'Huntur Repeater',
    'Huntur Repeater Elite',
    'Huntur Repeater Supreme',
    7,
    17,
    50,
    0,
    18,
    1.2,
    170,
  ),
  // forse staffs
  w('forseStaff', 'Apprentice Staff', 'Adept Staff', 'Archmaster Staff', 5, 8, 0, 0, 1, 1.0, 20),
  w('forseStaff', 'Initiate Staff', 'Disciple Staff', 'Luminary Staff', 6, 10, 0, 0, 3, 1.0, 30),
  w('forseStaff', 'Gnarled Rod', 'Gnarled Scepter', 'Gnarled Eldertwig', 8, 12, 0, 0, 6, 1.0, 45),
  w('forseStaff', 'Ceremonial Staff', 'Temple Staff', 'Oracle Staff', 10, 18, 15, 0, 11, 1.0, 70),
  w('forseStaff', 'Battle Staff', 'Battle Quarterstaff', 'Battle Warstaff', 12, 28, 25, 0, 16, 0.95, 90),
  // kybur focus crystals (orbs, Forse Adept only)
  w('kyburFocus', 'Kybur Shard', 'Kybur Sparkler', 'Kybur Starshard', 3, 5, 0, 0, 1, 1.1, 40),
  w('kyburFocus', 'Kybur Prism', 'Kybur Lattice', 'Kybur Starprism', 3, 7, 0, 0, 4, 1.1, 60),
  w('kyburFocus', 'Kybur Sphere', 'Kybur Globe', 'Kybur Cosmosphere', 4, 8, 0, 0, 9, 1.1, 80),
  w('kyburFocus', 'Kybur Lens', 'Kybur Monocle', 'Kybur Farlens', 5, 10, 0, 0, 13, 1.1, 110),
  w('kyburFocus', 'Kybur Orb', 'Kybur Mega Orb', 'Kybur Giga Orb', 6, 12, 0, 0, 18, 1.1, 150),
];
