/** Kybur crystal table (D2 gems: 7 colors x 5 grades). Not a data table: no default export. */
import type { StatId } from '../../core/stats/types';

export const GEM_GRADES = ['chipped', 'flawed', 'regular', 'flawless', 'perfect'] as const;
export type GemGrade = (typeof GEM_GRADES)[number];
export const GEM_GRADE_NAMES: Record<GemGrade, string> = {
  chipped: 'Chipped',
  flawed: 'Flawed',
  regular: 'Regular',
  flawless: 'Flawless',
  perfect: 'Perfect',
};
/** Required level per grade (D2: 1/5/12/18/27). */
export const GEM_GRADE_REQ = [1, 5, 12, 18, 27];
export const GEM_GRADE_COST = [20, 40, 80, 200, 600];

type Row = [StatId, number[]];

export interface GemColor {
  key: string;
  /** D2 analog, for designers. */
  d2: string;
  name: string;
  weapon: Row[];
  armor: Row[];
  shield: Row[];
}

const allRes = (v: number[]): Row[] => [
  ['resPlasma', v],
  ['resCryo', v],
  ['resStorm', v],
  ['resToxin', v],
];
const RES = [12, 16, 22, 28, 34];

export const GEM_COLORS: GemColor[] = [
  {
    key: 'red',
    d2: 'ruby',
    name: 'Rudy Kybur',
    weapon: [
      ['plasmaMin', [3, 5, 8, 10, 15]],
      ['plasmaMax', [4, 8, 12, 16, 20]],
    ],
    armor: [['lifeMax', [10, 17, 24, 31, 38]]],
    shield: [['resPlasma', RES]],
  },
  {
    key: 'blue',
    d2: 'sapphire',
    name: 'Sapphyre Kybur',
    weapon: [
      ['cryoMin', [1, 3, 5, 7, 10]],
      ['cryoMax', [3, 5, 9, 12, 16]],
      ['cryoLength', [2, 3, 3, 4, 4]],
    ],
    armor: [['manaMax', [10, 17, 24, 31, 38]]],
    shield: [['resCryo', RES]],
  },
  {
    key: 'yellow',
    d2: 'topaz',
    name: 'Topaaz Kybur',
    weapon: [
      ['stormMin', [1, 1, 1, 1, 1]],
      ['stormMax', [8, 14, 22, 30, 40]],
    ],
    armor: [['magicFind', [9, 12, 16, 20, 24]]],
    shield: [['resStorm', RES]],
  },
  {
    key: 'green',
    d2: 'emerald',
    name: 'Emerlad Kybur',
    weapon: [
      ['toxinMin', [10, 22, 36, 60, 100]],
      ['toxinMax', [10, 22, 36, 60, 100]],
      ['toxinLength', [3, 4, 5, 6, 7]],
    ],
    armor: [['dexterity', [3, 4, 6, 8, 10]]],
    shield: [['resToxin', RES]],
  },
  {
    key: 'white',
    d2: 'diamond',
    name: 'Diamund Kybur',
    weapon: [['deadlyStrike', [3, 4, 5, 6, 8]]],
    armor: [['attackRating', [20, 40, 60, 80, 100]]],
    shield: allRes([6, 8, 10, 12, 15]),
  },
  {
    key: 'purple',
    d2: 'amethyst',
    name: 'Amethist Kybur',
    weapon: [['attackRating', [40, 60, 80, 100, 150]]],
    armor: [['strength', [3, 4, 6, 8, 10]]],
    shield: [['defense', [8, 12, 18, 24, 30]]],
  },
  {
    key: 'syth',
    d2: 'skull',
    name: 'Syth Crystal',
    weapon: [
      ['lifeSteal', [2, 2, 3, 3, 4]],
      ['manaSteal', [1, 2, 2, 3, 3]],
    ],
    armor: [['lifeRegen', [1, 2, 3, 4, 5]]],
    shield: [['thorns', [4, 8, 12, 16, 20]]],
  },
];

export const gemId = (color: string, grade: GemGrade): string => `kybur.${color}.${grade}`;
