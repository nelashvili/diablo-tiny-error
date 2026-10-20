/** Armor line table. Each row is a NORMAL base; exceptional/elite are derived (see armor.ts). */
import type { ArmorClass } from '../schema';
import type { ClassId } from '../../core/types';

/** How a line is worn (render/models/wearables.ts builds each shape on the hero's bones). */
export type HelmShape = 'trooper' | 'mando' | 'hood' | 'circlet';
export type ChestShape =
  'suit' | 'vest' | 'trooper' | 'flak' | 'mesh' | 'plate' | 'robe' | 'mantle' | 'harness';
export type GlovesShape = 'work' | 'padded' | 'heavy' | 'grip' | 'plated' | 'wraps' | 'gauntlet' | 'bracer';
export type BootsShape = 'work' | 'trail' | 'heavy' | 'patrol' | 'plated' | 'yedi' | 'jet' | 'sandal';
export type BeltShape = 'sash' | 'tool' | 'utility' | 'combat' | 'plated' | 'yediSash' | 'holster' | 'cord';
export type WearShape = HelmShape | ChestShape | GlovesShape | BootsShape | BeltShape;

/** A line's worn shape and palette (main color, trim); tiers dress it up (render/models/outfit.ts). */
export interface LineLook {
  shape: WearShape;
  primary: number;
  trim: number;
}

export interface ArmorLine {
  cls: ArmorClass;
  names: [string, string, string];
  defMin: number;
  defMax: number;
  str: number;
  qlvl: number;
  cost: number;
  size: { w: number; h: number };
  block?: number;
  classOnly?: ClassId;
  look?: LineLook;
}

const L = (shape: WearShape, primary: number, trim: number): LineLook => ({ shape, primary, trim });

const a = (
  cls: ArmorClass,
  n1: string,
  n2: string,
  n3: string,
  defMin: number,
  defMax: number,
  str: number,
  qlvl: number,
  cost: number,
  w: number,
  h: number,
  extra: { block?: number; classOnly?: ClassId; look?: LineLook } = {},
): ArmorLine => ({ cls, names: [n1, n2, n3], defMin, defMax, str, qlvl, cost, size: { w, h }, ...extra });

export const ARMOR_LINES: ArmorLine[] = [
  // helms
  a('helm', 'Flight Cap', 'Flight Helm', 'Flight Crown', 3, 5, 0, 1, 15, 2, 2, {
    look: L('trooper', 0xe8e8e4, 0xd26a2a),
  }),
  a('helm', 'Scout Helm', 'Scout Warhelm', 'Scout Overhelm', 7, 10, 12, 4, 35, 2, 2, {
    look: L('trooper', 0x8a8a6a, 0x4a4a3a),
  }),
  a('helm', 'Trooper Helm', 'Trooper Warhelm', 'Trooper Overhelm', 13, 16, 22, 7, 60, 2, 2, {
    look: L('trooper', 0xe6e8ea, 0x2c2c30),
  }),
  a('helm', 'Recon Helm', 'Recon Warhelm', 'Recon Overhelm', 20, 24, 32, 11, 90, 2, 2, {
    look: L('mando', 0x5a6a5a, 0x2c2c30),
  }),
  a('helm', 'Battle Visor', 'Battle Greatvisor', 'Battle Megavisor', 30, 35, 63, 18, 140, 2, 2, {
    look: L('mando', 0xa2b2c6, 0x9a2a2a),
  }),
  a('helm', 'Yedi Hood', 'Yedi Master Hood', 'Yedi Grandmaster Hood', 6, 9, 0, 3, 40, 2, 2, {
    classOnly: 'yediKnight',
    look: L('hood', 0x7a5634, 0xc8b08a),
  }),
  a('helm', 'Yedi Cowl', 'Yedi Master Cowl', 'Yedi Grandmaster Cowl', 14, 20, 20, 10, 80, 2, 2, {
    classOnly: 'yediKnight',
    look: L('hood', 0x3e2a1a, 0xc8b08a),
  }),
  a('helm', 'Yedi Mask', 'Yedi Master Mask', 'Yedi Grandmaster Mask', 24, 30, 40, 16, 120, 2, 2, {
    classOnly: 'yediKnight',
    look: L('hood', 0x26262a, 0xb02a2a),
  }),
  a('helm', 'Adept Circlet', 'Adept Diadem', 'Adept Starcrown', 5, 8, 0, 3, 40, 2, 2, {
    classOnly: 'forseAdept',
    look: L('circlet', 0xc8a04a, 0xb36bff),
  }),
  a('helm', 'Hunter Bucket', 'Hunter Warbucket', 'Hunter Beskur Bucket', 16, 20, 25, 8, 75, 2, 2, {
    classOnly: 'bountyHuntur',
    look: L('mando', 0x6a7a52, 0xc0402a),
  }),
  // chest armor
  // Rebel pilot orange with a white harness.
  a('chest', 'Flight Suit', 'Flight Exosuit', 'Flight Hypersuit', 8, 11, 12, 1, 40, 2, 3, {
    look: L('suit', 0xd8682a, 0xeeeeea),
  }),
  a('chest', 'Padded Vest', 'Padded Guard Vest', 'Padded Battle Vest', 13, 16, 15, 4, 60, 2, 3, {
    look: L('vest', 0x8a7a5a, 0x5a4a3a),
  }),
  a('chest', 'Trooper Armor', 'Trooper Hardsuit', 'Trooper Megasuit', 20, 23, 20, 7, 90, 2, 3, {
    look: L('trooper', 0xe6e8ea, 0x2c2c30),
  }),
  a('chest', 'Flak Jacket', 'Flak Armor', 'Flak Warplate', 26, 30, 30, 10, 120, 2, 3, {
    look: L('flak', 0x5a6a4a, 0x3a3a34),
  }),
  a('chest', 'Mesh Vest', 'Mesh Bodyguard', 'Mesh Fortress', 32, 36, 41, 14, 160, 2, 3, {
    look: L('mesh', 0x4a5560, 0xd97a2a),
  }),
  a('chest', 'Battle Plate', 'Battle Hyperplate', 'Battle Ultraplate', 60, 66, 75, 24, 300, 2, 3, {
    look: L('plate', 0xa2b2c6, 0x9a2a2a),
  }),
  a('chest', 'Yedi Robe', 'Yedi Master Robe', 'Yedi Grandmaster Robe', 11, 15, 10, 3, 55, 2, 3, {
    classOnly: 'yediKnight',
    look: L('robe', 0x7a5634, 0xd8c8a0),
  }),
  a('chest', 'Adept Robe', 'Adept Mantle', 'Adept Starmantle', 10, 14, 8, 3, 50, 2, 3, {
    classOnly: 'forseAdept',
    look: L('mantle', 0xd8ccb0, 0x6a4a8a),
  }),
  a('chest', 'Hunter Harness', 'Hunter Warharness', 'Hunter Beskur Harness', 22, 26, 22, 7, 95, 2, 3, {
    classOnly: 'bountyHuntur',
    look: L('harness', 0x5a6648, 0x8a3a2a),
  }),
  // gloves
  a('gloves', 'Work Gloves', 'Work Gauntlets', 'Work Powergloves', 2, 3, 0, 1, 15, 2, 2, {
    look: L('work', 0xa88a60, 0x7a7a72),
  }),
  a('gloves', 'Padded Gloves', 'Padded Gauntlets', 'Padded Powergloves', 3, 5, 8, 3, 25, 2, 2, {
    look: L('padded', 0x7a6a50, 0xc8b890),
  }),
  a('gloves', 'Heavy Gloves', 'Heavy Gauntlets', 'Heavy Powergloves', 5, 7, 16, 6, 40, 2, 2, {
    look: L('heavy', 0x4a4440, 0x9aa4ae),
  }),
  a('gloves', 'Grip Gloves', 'Grip Gauntlets', 'Grip Powergloves', 7, 9, 22, 9, 60, 2, 2, {
    look: L('grip', 0x3e3a36, 0xb07a3a),
  }),
  a('gloves', 'Plated Gloves', 'Plated Gauntlets', 'Plated Powergloves', 9, 12, 27, 14, 80, 2, 2, {
    look: L('plated', 0x3a3e46, 0x9aa4ae),
  }),
  a('gloves', 'Yedi Wraps', 'Yedi Master Wraps', 'Yedi Grandmaster Wraps', 3, 5, 0, 3, 30, 2, 2, {
    classOnly: 'yediKnight',
    look: L('wraps', 0xc8b890, 0x7a5634),
  }),
  a('gloves', 'Hunter Gauntlets', 'Hunter Warfists', 'Hunter Deathfists', 6, 8, 18, 7, 50, 2, 2, {
    classOnly: 'bountyHuntur',
    look: L('gauntlet', 0x5a6648, 0xd04020),
  }),
  a('gloves', 'Rune Bracers', 'Rune Wardbracers', 'Rune Starbracers', 4, 6, 0, 5, 40, 2, 2, {
    classOnly: 'forseAdept',
    look: L('bracer', 0x6a5a8a, 0xb36bff),
  }),
  // utility belts
  a('belt', 'Utility Sash', 'Utility Cummerbund', 'Utility Girdle', 2, 3, 0, 1, 15, 2, 1, {
    look: L('sash', 0x8a5a3a, 0xc8b890),
  }),
  a('belt', 'Tool Belt', 'Tool Powerbelt', 'Tool Megabelt', 4, 5, 10, 4, 30, 2, 1, {
    look: L('tool', 0x6a4a2a, 0x9aa4ae),
  }),
  a('belt', 'Utility Belt', 'Utility Powerbelt', 'Utility Megabelt', 6, 8, 20, 7, 50, 2, 1, {
    look: L('utility', 0x3a3a34, 0xd8b04a),
  }),
  a('belt', 'Combat Belt', 'Combat Powerbelt', 'Combat Megabelt', 9, 11, 28, 11, 75, 2, 1, {
    look: L('combat', 0x4a5040, 0xb07a3a),
  }),
  a('belt', 'Plated Belt', 'Plated Powerbelt', 'Plated Megabelt', 12, 14, 38, 16, 100, 2, 2, {
    look: L('plated', 0x3a3e46, 0x9aa4ae),
  }),
  a('belt', 'Yedi Sash', 'Yedi Master Sash', 'Yedi Grandmaster Sash', 3, 5, 0, 3, 30, 2, 1, {
    classOnly: 'yediKnight',
    look: L('yediSash', 0xd8c8a0, 0x5a3a20),
  }),
  a('belt', 'Gunslinger Belt', 'Gunslinger Rig', 'Gunslinger Warrig', 6, 8, 15, 6, 45, 2, 1, {
    classOnly: 'bountyHuntur',
    look: L('holster', 0x4a3420, 0xc0a060),
  }),
  a('belt', 'Focus Cord', 'Focus Girdle', 'Focus Starcord', 3, 4, 0, 4, 35, 2, 1, {
    classOnly: 'forseAdept',
    look: L('cord', 0x5a3a7a, 0xb36bff),
  }),
  // boots
  a('boots', 'Work Boots', 'Work Greaves', 'Work Powerboots', 2, 3, 0, 1, 15, 2, 2, {
    look: L('work', 0xa88a60, 0x7a7a72),
  }),
  a('boots', 'Trail Boots', 'Trail Greaves', 'Trail Powerboots', 3, 4, 10, 4, 25, 2, 2, {
    look: L('trail', 0x7a6a50, 0xc04a2a),
  }),
  a('boots', 'Heavy Boots', 'Heavy Greaves', 'Heavy Powerboots', 5, 6, 18, 7, 40, 2, 2, {
    look: L('heavy', 0x4a4440, 0x9aa4ae),
  }),
  a('boots', 'Patrol Boots', 'Patrol Greaves', 'Patrol Powerboots', 7, 9, 24, 11, 60, 2, 2, {
    look: L('patrol', 0x2e2c2a, 0xe6e8ea),
  }),
  a('boots', 'Plated Boots', 'Plated Greaves', 'Plated Powerboots', 9, 11, 30, 15, 85, 2, 2, {
    look: L('plated', 0x3a3e46, 0x9aa4ae),
  }),
  a('boots', 'Yedi Boots', 'Yedi Master Boots', 'Yedi Grandmaster Boots', 3, 5, 0, 3, 30, 2, 2, {
    classOnly: 'yediKnight',
    look: L('yedi', 0x3a2a1e, 0x7a5634),
  }),
  a('boots', 'Jet Boots', 'Jet Striders', 'Jet Skyboots', 6, 8, 18, 8, 55, 2, 2, {
    classOnly: 'bountyHuntur',
    look: L('jet', 0x5a6648, 0xff8a3d),
  }),
  a('boots', 'Pilgrim Sandals', 'Pilgrim Treads', 'Pilgrim Starwalkers', 2, 4, 0, 2, 25, 2, 2, {
    classOnly: 'forseAdept',
    look: L('sandal', 0x8a6a48, 0xd8ccb0),
  }),
  // shields (energy shields, off-hand)
  a('shield', 'Buckler', 'Buckler Mk2', 'Buckler Mk3', 8, 10, 12, 1, 30, 2, 2, { block: 30 }),
  a('shield', 'Riot Shield', 'Riot Aegis', 'Riot Bulwark', 10, 12, 16, 3, 40, 2, 2, { block: 30 }),
  a('shield', 'Deflector Shield', 'Deflector Aegis', 'Deflector Bulwark', 13, 15, 22, 6, 60, 2, 3, {
    block: 30,
  }),
  a('shield', 'Guard Shield', 'Guard Aegis', 'Guard Bulwark', 16, 19, 26, 10, 85, 2, 3, { block: 32 }),
  a('shield', 'Barrier Shield', 'Barrier Aegis', 'Barrier Bulwark', 20, 24, 30, 14, 110, 2, 3, { block: 35 }),
  a('shield', 'Fortress Shield', 'Fortress Aegis', 'Fortress Bulwark', 30, 36, 60, 22, 220, 2, 4, {
    block: 45,
  }),
];

export interface JewelryLine {
  cls: 'ring' | 'amulet';
  id: string;
  name: string;
  qlvl: number;
  cost: number;
}

export const JEWELRY_LINES: JewelryLine[] = [
  { cls: 'ring', id: 'signalRing', name: 'Signal Ring', qlvl: 1, cost: 100 },
  { cls: 'amulet', id: 'holoPendant', name: 'Holo Pendant', qlvl: 1, cost: 150 },
];
