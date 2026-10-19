/** Per-act monster treasure classes (`tc.a{1-4}.{normal|champion|unique}`) and act-boss TCs. */
import type { TreasureClassDef } from '../schema';

type Q = NonNullable<TreasureClassDef['quality']>;

const equip: TreasureClassDef = {
  id: 'tc.equip',
  picks: 1,
  noDrop: 0,
  entries: [
    { ref: 'tc.weap', weight: 50 },
    { ref: 'tc.armo', weight: 40 },
    { ref: 'tc.jewel', weight: 10 },
  ],
};

const RANKS: {
  rank: 'normal' | 'champion' | 'unique';
  picks: number;
  noDrop: number;
  w: [number, number, number, number];
  q: Q;
}[] = [
  // A normal monster drops something about 28% of the time, mostly creditz and stims; the gear it
  // does drop is magic about one time in four (ratios below are D2 ItemRatio tcMods, in 1/1024).
  {
    rank: 'normal',
    picks: 1,
    noDrop: 115,
    w: [20, 10, 12, 2],
    q: { unique: 150, set: 150, rare: 600, magic: 800 },
  },
  {
    rank: 'champion',
    picks: 2,
    noDrop: 45,
    w: [25, 10, 30, 5],
    q: { unique: 400, set: 400, rare: 800, magic: 880 },
  },
  {
    rank: 'unique',
    picks: 2,
    noDrop: 10,
    w: [25, 10, 40, 8],
    q: { unique: 500, set: 500, rare: 900, magic: 900 },
  },
];

function act(n: number): TreasureClassDef[] {
  return RANKS.map((r) => ({
    id: `tc.a${n}.${r.rank}`,
    picks: r.picks,
    // later acts are a little more generous
    noDrop: Math.max(0, r.noDrop - (n - 1) * (r.rank === 'normal' ? 8 : 3)),
    entries: [
      { ref: 'creditz' as const, weight: r.w[0] },
      { ref: 'tc.stim', weight: r.w[1] },
      { ref: 'tc.equip', weight: r.w[2] },
      { ref: 'tc.gem', weight: r.w[3] },
    ],
    quality: r.q,
  }));
}

const BOSSES = ['countDooky', 'greatSarlack', 'darthMole', 'emperorPalpitate'];
// Bosses: much better odds of uniques/sets (plus a guaranteed rare and +5 item levels, see core/loot).
const DIFFS: { d: string; picks: number; q: Q }[] = [
  { d: 'normal', picks: 5, q: { unique: 600, set: 550, rare: 850, magic: 880 } },
  { d: 'veteran', picks: 6, q: { unique: 680, set: 620, rare: 880, magic: 900 } },
  { d: 'legend', picks: 7, q: { unique: 760, set: 700, rare: 900, magic: 900 } },
];

/** Aliases requested by the monsters data: Act I boss + superuniques. */
const aliases: TreasureClassDef[] = DIFFS.flatMap((x, i): TreasureClassDef[] => [
  {
    id: `tc.a1.countDooky.${x.d}`,
    picks: 1,
    noDrop: 0,
    entries: [{ ref: `tc.boss.countDooky.${x.d}`, weight: 1 }],
  },
  {
    id: `tc.a1.superunique.${x.d}`,
    picks: 2 + i,
    noDrop: 0,
    entries: [
      { ref: 'tc.equip', weight: 55 },
      { ref: 'creditz', weight: 25 },
      { ref: 'tc.gem', weight: 10 },
      { ref: 'tc.stim', weight: 10 },
    ],
    quality: { unique: 400 + i * 50, set: 400 + i * 50, rare: 850, magic: 880 },
  },
]);

export default [
  ...aliases,
  equip,
  ...[1, 2, 3, 4].flatMap(act),
  ...BOSSES.flatMap((b) =>
    DIFFS.map((x): TreasureClassDef => ({
      id: `tc.boss.${b}.${x.d}`,
      picks: x.picks,
      noDrop: 0,
      entries: [
        { ref: 'tc.equip', weight: 70 },
        { ref: 'creditz', weight: 15 },
        { ref: 'tc.gem', weight: 10 },
        { ref: 'tc.stim', weight: 5 },
      ],
      quality: x.q,
    })),
  ),
] satisfies TreasureClassDef[];
