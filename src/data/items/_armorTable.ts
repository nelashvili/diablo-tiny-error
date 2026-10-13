/** Armor line table. Each row is a NORMAL base; exceptional/elite are derived (see armor.ts). */
import type { ArmorClass } from '../schema';
import type { ClassId } from '../../core/types';

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
}

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
  extra: { block?: number; classOnly?: ClassId } = {},
): ArmorLine => ({ cls, names: [n1, n2, n3], defMin, defMax, str, qlvl, cost, size: { w, h }, ...extra });

export const ARMOR_LINES: ArmorLine[] = [
  // helms
  a('helm', 'Flight Cap', 'Flight Helm', 'Flight Crown', 3, 5, 0, 1, 15, 2, 2),
  a('helm', 'Trooper Helm', 'Trooper Warhelm', 'Trooper Overhelm', 15, 18, 26, 8, 60, 2, 2),
  a('helm', 'Battle Visor', 'Battle Greatvisor', 'Battle Megavisor', 30, 35, 63, 18, 140, 2, 2),
  a('helm', 'Yedi Hood', 'Yedi Master Hood', 'Yedi Grandmaster Hood', 6, 9, 0, 3, 40, 2, 2, {
    classOnly: 'yediKnight',
  }),
  a('helm', 'Yedi Cowl', 'Yedi Master Cowl', 'Yedi Grandmaster Cowl', 14, 20, 20, 10, 80, 2, 2, {
    classOnly: 'yediKnight',
  }),
  a('helm', 'Yedi Mask', 'Yedi Master Mask', 'Yedi Grandmaster Mask', 24, 30, 40, 16, 120, 2, 2, {
    classOnly: 'yediKnight',
  }),
  // chest armor
  a('chest', 'Flight Suit', 'Flight Exosuit', 'Flight Hypersuit', 8, 11, 12, 1, 40, 2, 3),
  a('chest', 'Trooper Armor', 'Trooper Hardsuit', 'Trooper Megasuit', 20, 23, 20, 7, 90, 2, 3),
  a('chest', 'Mesh Vest', 'Mesh Bodyguard', 'Mesh Fortress', 32, 36, 41, 14, 160, 2, 3),
  a('chest', 'Battle Plate', 'Battle Hyperplate', 'Battle Ultraplate', 60, 66, 75, 24, 300, 2, 3),
  // gloves
  a('gloves', 'Work Gloves', 'Work Gauntlets', 'Work Powergloves', 2, 3, 0, 1, 15, 2, 2),
  a('gloves', 'Heavy Gloves', 'Heavy Gauntlets', 'Heavy Powergloves', 5, 7, 16, 6, 40, 2, 2),
  a('gloves', 'Plated Gloves', 'Plated Gauntlets', 'Plated Powergloves', 9, 12, 27, 14, 80, 2, 2),
  // utility belts
  a('belt', 'Utility Sash', 'Utility Cummerbund', 'Utility Girdle', 2, 3, 0, 1, 15, 2, 1),
  a('belt', 'Utility Belt', 'Utility Powerbelt', 'Utility Megabelt', 6, 8, 20, 8, 50, 2, 1),
  a('belt', 'Plated Belt', 'Plated Powerbelt', 'Plated Megabelt', 12, 14, 38, 16, 100, 2, 2),
  // boots
  a('boots', 'Work Boots', 'Work Greaves', 'Work Powerboots', 2, 3, 0, 1, 15, 2, 2),
  a('boots', 'Heavy Boots', 'Heavy Greaves', 'Heavy Powerboots', 5, 6, 18, 7, 40, 2, 2),
  a('boots', 'Plated Boots', 'Plated Greaves', 'Plated Powerboots', 9, 11, 30, 15, 85, 2, 2),
  // shields (energy shields, off-hand)
  a('shield', 'Buckler', 'Buckler Mk2', 'Buckler Mk3', 8, 10, 12, 1, 30, 2, 2, { block: 30 }),
  a('shield', 'Deflector Shield', 'Deflector Aegis', 'Deflector Bulwark', 13, 15, 22, 6, 60, 2, 3, {
    block: 30,
  }),
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
