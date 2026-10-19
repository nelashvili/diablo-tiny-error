/**
 * Banded equipment / gem / stim treasure classes (D2 weap3/armo3 analog): `tc.weap.N` lists the weapon
 * bases with qlvl in (N-W, N], weighted toward higher qlvl, so drops climb with the area level. The window
 * W is narrow early (one band per level up to 12) so each new area brings new bases. Refs to the unbanded
 * id (`tc.weap`) resolve in core/loot to the highest band <= item level.
 */
import { GEM_COLORS, GEM_GRADES, gemId } from '../gems/_gemTable';
import type { ItemBaseDef, TreasureClassDef } from '../schema';
import armor from '../items/armor';
import weapons from '../items/weapons';

const BANDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84];

/** Width of a band's qlvl window. */
const bandWindow = (band: number): number => Math.min(24, Math.max(8, band));

function banded(prefix: string, bases: ItemBaseDef[]): TreasureClassDef[] {
  return BANDS.map((band) => {
    const w = bandWindow(band);
    let pool = bases.filter((b) => b.qlvl <= band && b.qlvl > band - w);
    if (pool.length === 0) pool = bases.filter((b) => b.qlvl <= band);
    return {
      id: `${prefix}.${band}`,
      picks: 1,
      noDrop: 0,
      entries: pool.map((b) => {
        // 1 at the bottom of the window up to w at the band's level, squared to favor newer bases
        const near = Math.max(1, b.qlvl - (band - w));
        return { ref: b.id, weight: near * near * (b.classOnly ? 0.5 : 1) };
      }),
    };
  });
}

const GEM_BANDS: [number, number][] = [
  [1, 0],
  [12, 1],
  [24, 2],
  [36, 3],
  [48, 4],
];

function gems(): TreasureClassDef[] {
  return GEM_BANDS.map(([band, top]) => ({
    id: `tc.gem.${band}`,
    picks: 1,
    noDrop: 0,
    entries: GEM_COLORS.flatMap((c) =>
      GEM_GRADES.slice(Math.max(0, top - 1), top + 1).map((g, i, arr) => ({
        ref: gemId(c.key, g),
        // the highest available grade is rarer than the previous one
        weight: i === arr.length - 1 && arr.length > 1 ? 1 : 3,
      })),
    ),
  }));
}

const STIM_BANDS: [number, string[]][] = [
  [1, ['baktaStim', 'energyCell', 'recallBeacon']],
  [8, ['baktaStimLight', 'energyCellLight', 'antidote', 'thaw', 'stamina', 'recallBeacon']],
  [18, ['baktaStimMedium', 'energyCellMedium', 'rejuvStim', 'antidote', 'thaw', 'stamina']],
  [32, ['baktaStimGreater', 'energyCellGreater', 'rejuvStim', 'baktaStimMedium', 'energyCellMedium']],
  [48, ['baktaStimSuper', 'energyCellSuper', 'rejuvStimFull', 'baktaStimGreater', 'energyCellGreater']],
];

export default [
  ...banded(
    'tc.weap',
    weapons.filter((b) => b.category === 'weapon'),
  ),
  ...banded(
    'tc.armo',
    armor.filter((b) => b.category === 'armor'),
  ),
  {
    id: 'tc.jewel',
    picks: 1,
    noDrop: 0,
    entries: [
      { ref: 'signalRing', weight: 1 },
      { ref: 'holoPendant', weight: 1 },
    ],
  },
  ...gems(),
  ...STIM_BANDS.map(([band, ids]): TreasureClassDef => ({
    id: `tc.stim.${band}`,
    picks: 1,
    noDrop: 0,
    entries: ids.map((ref, i) => ({ ref, weight: i < 2 ? 3 : 1 })),
  })),
] satisfies TreasureClassDef[];
