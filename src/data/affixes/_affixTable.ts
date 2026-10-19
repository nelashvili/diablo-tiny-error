/**
 * Affix table builder (D2 MagicPrefix.txt / MagicSuffix.txt analog). Not a data table itself: no default
 * export. `prefixes.ts` / `suffixes.ts` expose the rows to the DB, `names/itemsAffixes.ts` the display text.
 *
 * Roll convention (see core/items/create.ts): mods of ONE affix whose (min,max) are identical share a single
 * roll, so "+X to all resistances" and "X poison damage" stay consistent.
 */
import type { StatId } from '../../core/stats/types';
import type { ClassId } from '../../core/types';
import type { AffixDef } from '../schema';

type IT = AffixDef['itemTypes'][number];
type Mods = AffixDef['mods'];

export interface AffixRow {
  def: AffixDef;
  /** Display text (goes to the names file). */
  text: string;
}

const W: IT[] = ['weapon'];
const A: IT[] = ['armor'];
const AJ: IT[] = ['armor', 'jewelry'];
const ANY: IT[] = ['any'];

const m = (
  stat: StatId,
  min: number,
  max: number = min,
  op: 'flat' | 'percent' = 'flat',
  param?: string,
): Mods[number] => ({ stat, op, min, max, ...(param ? { param } : {}) });

type FamRow = [text: string, level: number, freq: number, ...nums: number[]];

function fam(
  kind: 'prefix' | 'suffix',
  group: string,
  types: IT[],
  rows: FamRow[],
  mk: (n: number[]) => Mods,
  opts: { rare?: boolean; classOnly?: ClassId; rareTopOnly?: boolean } = {},
): AffixRow[] {
  return rows.map((r, i) => {
    const [text, level, freq, ...nums] = r;
    const id = `${kind === 'prefix' ? 'pre' : 'suf'}.${group}.${i + 1}`;
    const next = rows[i + 1];
    const def: AffixDef = {
      id,
      kind,
      name: `affix.${id}`,
      level,
      // each tier stops being rolled once the next tier opens up far enough (D2 maxlevel analog)
      ...(next && next[1] > level + 25 ? { maxLevel: next[1] + 20 } : {}),
      group: group.split('.')[0]!,
      rare: opts.rare ?? true,
      frequency: freq,
      itemTypes: types,
      ...(opts.classOnly ? { classOnly: opts.classOnly } : {}),
      mods: mk(nums),
    };
    return { def, text };
  });
}

const ELEMENTS = [
  {
    stat: ['resPlasma', 'plasma'],
    pre: ['Rudy', 'Garnit', 'Crimsin', 'Vermilyun'],
    suf: ['of Heat Shielding', 'of Flame Warding', 'of Plasma Proofing', 'of the Sunproof'],
  },
  {
    stat: ['resCryo', 'cryo'],
    pre: ['Sapphyre', 'Azur', 'Cobolt', 'Lapiz'],
    suf: ['of Cold Shielding', 'of Frost Warding', 'of Cryo Proofing', 'of the Snowproof'],
  },
  {
    stat: ['resStorm', 'storm'],
    pre: ['Ambur', 'Tangerene', 'Saffrun', 'Topaaz-Gold'],
    suf: ['of Static Shielding', 'of Spark Warding', 'of Storm Proofing', 'of the Thunderproof'],
  },
  {
    stat: ['resToxin', 'toxin'],
    pre: ['Jaid', 'Verdent', 'Virridian', 'Malakyte'],
    suf: ['of Antidoat', 'of Toxin Warding', 'of Poison Proofing', 'of the Fumeproof'],
  },
] as const;
const RES_LV = [1, 12, 25, 40];
const RES_VAL = [
  [5, 10],
  [11, 20],
  [21, 30],
  [31, 40],
];

function resFamilies(kind: 'prefix' | 'suffix'): AffixRow[] {
  const out: AffixRow[] = [];
  for (const e of ELEMENTS) {
    const names = kind === 'prefix' ? e.pre : e.suf;
    const rows: FamRow[] = names.map((n, i) => [n, RES_LV[i]!, 9 - i * 2, ...RES_VAL[i]!]);
    out.push(...fam(kind, e.stat[0], AJ, rows, ([lo, hi]) => [m(e.stat[0], lo!, hi!)]));
  }
  return out;
}

const CLASS_ITEM_TYPES: Record<ClassId, IT[]> = {
  yediKnight: ['helm'],
  bountyHuntur: ['blasturRifle'],
  forseAdept: ['kyburFocus'],
};

// ------------------------------------------------------------------------------------------ prefixes

const treeFams: AffixRow[] = (
  [
    ['yediKnight', 'yediKnight.saberForms', 'Dueling'],
    ['yediKnight', 'yediKnight.masteries', 'Disciplined'],
    ['yediKnight', 'yediKnight.commands', 'Commanding'],
    ['bountyHuntur', 'bountyHuntur.blasturs', 'Sharpshooting'],
    ['bountyHuntur', 'bountyHuntur.instincts', 'Instinctive'],
    ['bountyHuntur', 'bountyHuntur.spearArc', 'Spearing'],
    ['forseAdept', 'forseAdept.plasma', 'Blazing'],
    ['forseAdept', 'forseAdept.storm', 'Thundering'],
    ['forseAdept', 'forseAdept.cryo', 'Frostbitten'],
  ] as const
).flatMap(([cls, tree, text]) =>
  fam(
    'prefix',
    `treeSkills.${tree}`,
    CLASS_ITEM_TYPES[cls],
    [[text, 12, 3, 1]],
    ([v]) => [m('treeSkills', v!, v!, 'flat', tree)],
    { classOnly: cls },
  ).map((r) => ({ ...r, def: { ...r.def, group: 'treeSkills' } })),
);

const classPrefixes: AffixRow[] = (
  [
    ['yediKnight', ['Padawon', 'Yedi Master']],
    ['bountyHuntur', ['Rookie Huntur', 'Bounty Huntur']],
    ['forseAdept', ['Initiate', 'Forse Adept']],
  ] as const
).flatMap(([cls, names]) =>
  fam(
    'prefix',
    `classSkills.${cls}`,
    CLASS_ITEM_TYPES[cls],
    [
      [`${names[0]}'s`, 14, 3, 1],
      [`${names[1]}'s`, 36, 1, 2],
    ],
    ([v]) => [m('classSkills', v!, v!, 'flat', cls)],
    { classOnly: cls },
  ).map((r) => ({ ...r, def: { ...r.def, group: 'classSkills' } })),
);

export const PREFIX_ROWS: AffixRow[] = [
  ...fam(
    'prefix',
    'ed',
    W,
    [
      ['Jaggid', 1, 10, 10, 20],
      ['Deadlee', 5, 9, 21, 30],
      ['Vishus', 11, 8, 31, 40],
      ['Brutul', 18, 7, 41, 50],
      ['Massif', 26, 5, 51, 65],
      ['Savidge', 36, 3, 66, 80],
      ['Mercilus', 48, 2, 81, 100],
    ],
    ([lo, hi]) => [m('enhancedDamage', lo!, hi!, 'percent')],
  ),
  ...fam(
    'prefix',
    'ed.ar',
    W,
    [
      ['Acurate', 8, 6, 20, 30, 20, 40],
      ['Presize', 24, 4, 40, 50, 40, 60],
      ['Pinpoynt', 42, 2, 60, 75, 80, 120],
    ],
    ([a, b, c, d]) => [m('enhancedDamage', a!, b!, 'percent'), m('attackRating', c!, d!)],
  ),
  ...fam(
    'prefix',
    'dmgFlat',
    W,
    [
      ['Sharpe', 1, 10, 1, 2, 3, 5],
      ['Finer', 8, 9, 2, 3, 6, 9],
      ['Honned', 17, 7, 3, 5, 10, 15],
      ['Razzor', 28, 5, 5, 8, 16, 24],
      ['Vibro-Tuned', 40, 3, 8, 12, 25, 38],
      ['Hypermatter', 52, 2, 12, 16, 39, 55],
    ],
    ([a, b, c, d]) => [m('minDamage', a!, b!), m('maxDamage', c!, d!)],
  ),
  ...fam(
    'prefix',
    'ar',
    W,
    [
      ['Bronz', 1, 10, 10, 20],
      ['Irun', 5, 9, 20, 30],
      ['Steal', 12, 8, 30, 45],
      ['Silvur', 18, 6, 45, 60],
      ['Goldun', 28, 5, 60, 80],
      ['Platinun', 40, 3, 80, 110],
      ['Meteorik', 52, 2, 110, 150],
    ],
    ([lo, hi]) => [m('attackRating', lo!, hi!)],
  ),
  ...fam(
    'prefix',
    'dmgPlasma',
    W,
    [
      ['Heeted', 4, 8, 1, 3, 4, 6],
      ['Glowwing', 15, 6, 3, 6, 8, 14],
      ['Moltin', 30, 3, 7, 12, 16, 26],
    ],
    ([a, b, c, d]) => [m('plasmaMin', a!, b!), m('plasmaMax', c!, d!)],
  ),
  ...fam(
    'prefix',
    'dmgCryo',
    W,
    [
      ['Coolled', 4, 8, 1, 2, 3, 5, 2],
      ['Frostid', 15, 6, 2, 4, 6, 10, 3],
      ['Glaciul', 30, 3, 5, 9, 12, 20, 4],
    ],
    ([a, b, c, d, e]) => [m('cryoMin', a!, b!), m('cryoMax', c!, d!), m('cryoLength', e!)],
  ),
  ...fam(
    'prefix',
    'dmgStorm',
    W,
    [
      ['Staticc', 4, 8, 1, 1, 5, 9],
      ['Shokking', 15, 6, 1, 1, 14, 22],
      ['Voltik', 30, 3, 1, 1, 30, 50],
    ],
    ([a, b, c, d]) => [m('stormMin', a!, b!), m('stormMax', c!, d!)],
  ),
  ...fam(
    'prefix',
    'dmgToxin',
    W,
    [
      ['Nokshus', 4, 8, 10, 14, 3],
      ['Venimus', 15, 6, 25, 40, 4],
      ['Deedly', 30, 3, 60, 90, 5],
    ],
    ([a, b, len]) => [m('toxinMin', a!, b!), m('toxinMax', a!, b!), m('toxinLength', len!)],
  ),
  ...fam(
    'prefix',
    'defPct',
    A,
    [
      ['Sturdee', 1, 10, 10, 20],
      ['Strungg', 5, 9, 21, 30],
      ['Glorius', 12, 7, 31, 40],
      ['Blest', 20, 5, 41, 50],
      ['Saintlee', 32, 3, 51, 65],
      ['Hollee', 44, 2, 66, 80],
    ],
    ([lo, hi]) => [m('defense', lo!, hi!, 'percent')],
  ),
  ...resFamilies('prefix'),
  ...fam(
    'prefix',
    'life',
    AJ,
    [
      ['Hearty', 3, 8, 5, 10],
      ['Hale', 14, 6, 11, 20],
      ['Robust', 28, 4, 21, 30],
      ['Titanik', 42, 2, 31, 40],
    ],
    ([lo, hi]) => [m('lifeMax', lo!, hi!)],
  ),
  ...fam(
    'prefix',
    'mana',
    [...AJ, 'forseStaff', 'kyburFocus'],
    [
      ['Charjed', 3, 8, 5, 10],
      ['Surging', 14, 6, 11, 20],
      ['Overflowing', 28, 4, 21, 35],
      ['Cosmick', 42, 2, 36, 50],
    ],
    ([lo, hi]) => [m('manaMax', lo!, hi!)],
  ),
  ...classPrefixes,
  ...treeFams,
  ...fam(
    'prefix',
    'block',
    ['shield'],
    [
      ['Parrying', 1, 9, 5, 10],
      ['Warding', 12, 6, 11, 15],
      ['Aegis-Bound', 26, 3, 16, 20],
    ],
    ([lo, hi]) => [m('blockChance', lo!, hi!)],
  ),
];

// ------------------------------------------------------------------------------------------ suffixes

const attr = (group: StatId, names: string[], types: IT[] = ANY): AffixRow[] =>
  fam(
    'suffix',
    group,
    types,
    names.map((n, i): FamRow => [n, [1, 8, 17, 28, 40][i]!, 9 - i * 2, i * 2 + 1, i * 2 + 2]),
    ([lo, hi]) => [m(group, lo!, hi!)],
  );

export const SUFFIX_ROWS: AffixRow[] = [
  ...attr('strength', [
    'of the Porg',
    'of the Jawwa',
    'of the Tuskin',
    'of the Rankor',
    'of the Wookie-Cookie',
  ]),
  ...attr('dexterity', [
    'of the Womp Ratt',
    'of the Gungun',
    'of the Cloud Riddur',
    'of the Nightsistah',
    'of Quick Yoduh',
  ]),
  ...attr('vitality', [
    'of the Calfa',
    'of the Banthaa',
    'of the Bull Banthaa',
    'of the Rankor Hide',
    'of the Sarlack',
  ]),
  ...attr('energy', [
    'of the Padawon',
    'of the Initiate',
    'of the Yedi Knight',
    'of the Yedi Master',
    'of the Grand Master',
  ]),
  ...fam(
    'suffix',
    'life',
    AJ,
    [
      ['of Healthiness', 5, 8, 5, 10],
      ['of Vitallity', 15, 7, 11, 20],
      ['of Vigour', 25, 5, 21, 30],
      ['of Livelyhood', 35, 3, 31, 40],
      ['of Immortallity', 48, 2, 41, 60],
    ],
    ([lo, hi]) => [m('lifeMax', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'mana',
    [...AJ, 'forseStaff', 'kyburFocus'],
    [
      ['of Clever Mind', 3, 8, 5, 10],
      ['of Sharp Mind', 14, 6, 11, 20],
      ['of Deep Mind', 28, 4, 21, 35],
      ['of the Forse Font', 42, 2, 36, 50],
    ],
    ([lo, hi]) => [m('manaMax', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'defFlat',
    A,
    [
      ['of Protekshun', 2, 8, 5, 10],
      ['of Shielding', 14, 6, 11, 25],
      ['of Warding', 26, 4, 26, 45],
      ['of the Fortress', 38, 2, 46, 70],
    ],
    ([lo, hi]) => [m('defense', lo!, hi!)],
  ),
  ...resFamilies('suffix'),
  ...fam(
    'suffix',
    'allRes',
    AJ,
    [
      ['of the Rainbow', 10, 4, 5, 8],
      ['of the Prism', 24, 3, 9, 15],
      ['of the Spectrum', 40, 1, 16, 22],
    ],
    ([lo, hi]) => [
      m('resPlasma', lo!, hi!),
      m('resCryo', lo!, hi!),
      m('resStorm', lo!, hi!),
      m('resToxin', lo!, hi!),
    ],
    { rare: false },
  ),
  ...fam(
    'suffix',
    'ias',
    ['weapon', 'gloves', 'ring', 'amulet'],
    [
      ['of Hastiness', 5, 8, 10],
      ['of Swiftniss', 18, 6, 20],
      ['of Alacrity', 32, 3, 30],
      ['of Lightspeed', 44, 1, 40],
    ],
    ([v]) => [m('ias', v!)],
  ),
  ...fam(
    'suffix',
    'fcr',
    ['forseStaff', 'kyburFocus', 'amulet', 'ring', 'helm', 'gloves', 'belt'],
    [
      ['of Chanting', 6, 7, 10],
      ['of Spellcrafting', 18, 5, 20],
      ['of Forse Mastery', 30, 2, 30],
    ],
    ([v]) => [m('fcr', v!)],
  ),
  ...fam(
    'suffix',
    'fhr',
    ['helm', 'chest', 'gloves', 'boots', 'belt', 'shield', 'amulet', 'ring'],
    [
      ['of Recovry', 6, 7, 10],
      ['of Resilience', 16, 5, 17],
      ['of Shrugging Off', 28, 3, 24],
    ],
    ([v]) => [m('fhr', v!)],
  ),
  ...fam(
    'suffix',
    'frw',
    ['boots'],
    [
      ['of Strolling', 3, 8, 10],
      ['of Hustling', 12, 6, 20],
      ['of Sprinting', 24, 4, 30],
      ['of Hyperspace Dash', 38, 2, 40],
    ],
    ([v]) => [m('frw', v!)],
  ),
  ...fam(
    'suffix',
    'lifeSteal',
    ['weapon', 'ring', 'amulet'],
    [
      ['of Leeching', 5, 6, 3, 4],
      ['of Draining', 18, 4, 5, 6],
      ['of Vampirism', 36, 2, 7, 8],
    ],
    ([lo, hi]) => [m('lifeSteal', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'manaSteal',
    ['weapon', 'ring', 'amulet'],
    [
      ['of Siphoning', 5, 6, 2, 3],
      ['of Tapping', 18, 4, 3, 4],
      ['of Forse Theft', 36, 2, 4, 6],
    ],
    ([lo, hi]) => [m('manaSteal', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'cb',
    W,
    [
      ['of Crushing', 8, 5, 5, 10],
      ['of Smashing', 28, 2, 11, 18],
    ],
    ([lo, hi]) => [m('crushingBlow', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'ds',
    W,
    [
      ['of Deadlyness', 10, 5, 5, 10],
      ['of Doom', 30, 2, 11, 20],
    ],
    ([lo, hi]) => [m('deadlyStrike', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'mf',
    ['helm', 'boots', 'gloves', 'belt', 'ring', 'amulet'],
    [
      ['of Fortune', 5, 6, 10, 15],
      ['of Good Fortune', 20, 4, 16, 24],
      ['of the Lucky Smuggler', 38, 2, 25, 35],
    ],
    ([lo, hi]) => [m('magicFind', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'gf',
    ['gloves', 'belt', 'ring', 'amulet'],
    [
      ['of Greed', 3, 6, 20, 40],
      ['of Prosperity', 18, 4, 41, 80],
      ['of the Hutz Treasury', 36, 2, 81, 120],
    ],
    ([lo, hi]) => [m('goldFind', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'light',
    ['helm', 'shield', 'ring', 'amulet'],
    [
      ['of Lite', 1, 6, 1],
      ['of Brilliance', 14, 3, 2],
    ],
    ([v]) => [m('lightRadius', v!)],
  ),
  ...fam(
    'suffix',
    'regen',
    AJ,
    [
      ['of Mending', 5, 6, 1, 2],
      ['of Renewal', 18, 4, 3, 4],
      ['of Regenerashun', 34, 2, 5, 6],
    ],
    ([lo, hi]) => [m('lifeRegen', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'thorns',
    A,
    [
      ['of Prickles', 4, 5, 1, 3],
      ['of Spikes', 18, 3, 4, 8],
    ],
    ([lo, hi]) => [m('thorns', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'dr',
    A,
    [
      ['of Padding', 10, 5, 1, 2],
      ['of Cushioning', 30, 2, 3, 5],
    ],
    ([lo, hi]) => [m('damageReduced', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'lifePerKill',
    ['weapon', 'ring', 'amulet'],
    [
      ['of the Harvest', 10, 4, 1, 2],
      ['of the Grand Harvest', 30, 2, 3, 5],
    ],
    ([lo, hi]) => [m('lifePerKill', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'manaPerKill',
    ['weapon', 'ring', 'amulet'],
    [
      ['of the Sip', 10, 4, 1, 2],
      ['of the Gulp', 30, 2, 3, 5],
    ],
    ([lo, hi]) => [m('manaPerKill', lo!, hi!)],
  ),
  ...fam('suffix', 'cbf', ['helm', 'boots', 'gloves', 'belt'], [['of Thawing', 20, 3, 1]], ([v]) => [
    m('cannotBeFrozen', v!),
  ]),
  ...fam(
    'suffix',
    'stam',
    ['boots', 'belt', 'chest'],
    [
      ['of Endurence', 3, 6, 1, 3],
      ['of Marathons', 20, 3, 3, 6],
    ],
    // Was max stamina; stamina is gone, so these now regenerate life.
    ([lo, hi]) => [m('lifeRegen', lo!, hi!)],
  ),
  ...fam(
    'suffix',
    'req',
    ['weapon', 'armor'],
    [
      ['of Ease', 5, 5, 15],
      ['of Comfort', 15, 3, 20],
    ],
    ([v]) => [m('requirementsReduced', v!, v!, 'percent')],
    { rare: false },
  ),
  ...fam('suffix', 'allSkills', ['amulet'], [['of the Forse', 25, 1, 1]], ([v]) => [m('allSkills', v!)], {
    rare: false,
  }),
  ...fam(
    'suffix',
    'classSkills',
    ['amulet'],
    [['of Yedi Mastery', 12, 2, 1]],
    () => [m('classSkills', 1, 1, 'flat', 'yediKnight')],
    { rare: false },
  ).map((r) => ({ ...r, def: { ...r.def, id: 'suf.classSkills.yedi', name: 'affix.suf.classSkills.yedi' } })),
  ...fam(
    'suffix',
    'classSkills',
    ['amulet'],
    [['of Huntur Mastery', 12, 2, 1]],
    () => [m('classSkills', 1, 1, 'flat', 'bountyHuntur')],
    { rare: false },
  ).map((r) => ({
    ...r,
    def: { ...r.def, id: 'suf.classSkills.huntur', name: 'affix.suf.classSkills.huntur' },
  })),
  ...fam(
    'suffix',
    'classSkills',
    ['amulet'],
    [['of Adept Mastery', 12, 2, 1]],
    () => [m('classSkills', 1, 1, 'flat', 'forseAdept')],
    { rare: false },
  ).map((r) => ({
    ...r,
    def: { ...r.def, id: 'suf.classSkills.adept', name: 'affix.suf.classSkills.adept' },
  })),
];
