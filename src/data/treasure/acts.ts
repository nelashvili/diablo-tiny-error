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
  {
    rank: 'normal',
    picks: 1,
    noDrop: 60,
    w: [20, 12, 14, 2],
    q: { unique: 0, set: 0, rare: 60, magic: 160 },
  },
  {
    rank: 'champion',
    picks: 2,
    noDrop: 20,
    w: [25, 10, 30, 5],
    q: { unique: 100, set: 100, rare: 200, magic: 200 },
  },
  {
    rank: 'unique',
    picks: 3,
    noDrop: 5,
    w: [25, 10, 40, 8],
    q: { unique: 150, set: 150, rare: 300, magic: 300 },
  },
];

function act(n: number): TreasureClassDef[] {
  return RANKS.map((r) => ({
    id: `tc.a${n}.${r.rank}`,
    picks: r.picks,
    // later acts are a little more generous
    noDrop: Math.max(0, r.noDrop - (n - 1) * (r.rank === 'normal' ? 5 : 2)),
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
const DIFFS: { d: string; picks: number; q: Q }[] = [
  { d: 'normal', picks: 5, q: { unique: 300, set: 300, rare: 500, magic: 400 } },
  { d: 'veteran', picks: 6, q: { unique: 350, set: 350, rare: 550, magic: 450 } },
  { d: 'legend', picks: 7, q: { unique: 400, set: 400, rare: 600, magic: 500 } },
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
    picks: 3 + i,
    noDrop: 0,
    entries: [
      { ref: 'tc.equip', weight: 55 },
      { ref: 'creditz', weight: 25 },
      { ref: 'tc.gem', weight: 10 },
      { ref: 'tc.stim', weight: 10 },
    ],
    quality: { unique: 200 + i * 25, set: 200 + i * 25, rare: 400, magic: 350 },
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
        { ref: 'tc.equip', weight: 60 },
        { ref: 'creditz', weight: 20 },
        { ref: 'tc.gem', weight: 10 },
        { ref: 'tc.stim', weight: 10 },
      ],
      quality: x.q,
    })),
  ),
] satisfies TreasureClassDef[];
