import { DB } from '../../data/db';
import type { ItemBaseDef, TreasureClassDef } from '../../data/schema';
import { createItem, rollSuperior } from '../items/create';
import { isGear, setCandidates, uniqueCandidates } from '../items/lookup';
import type { ItemInstance } from '../items/types';
import type { Rng } from '../rng';
import type { ClassId, ItemQuality } from '../types';
import { CLASS_WEAPONS } from '../../data/items/_classAffinity';

export interface DropContext {
  treasureClass: string;
  monsterLevel: number;
  magicFind: number;
  goldFind: number;
  /** D2 player-count analog for noDrop; always 1 here. */
  players: 1;
  rank: 'normal' | 'champion' | 'unique' | 'boss';
  /** Class of the hero who made the kill: equipment drops lean toward what that class uses. */
  classId?: ClassId;
}

export interface DropResult {
  items: ItemInstance[];
  creditz: number;
}

type QualityMods = NonNullable<TreasureClassDef['quality']>;

/** D2 ItemRatio.txt analog: base, divisor, min (in 1/128 units). */
const RATIOS = {
  unique: { base: 400, div: 1, min: 6400 },
  set: { base: 160, div: 2, min: 5600 },
  rare: { base: 100, div: 2, min: 3200 },
  magic: { base: 18, div: 1, min: 200 },
} as const;

/** MF diminishing-returns constants (D2: unique 250, set 500, rare 600; magic undiminished). */
const MF_FACTOR = { unique: 250, set: 500, rare: 600 } as const;

/** Extra quality pressure per monster rank when the treasure class has no ratios of its own. */
const RANK_QUALITY: Record<DropContext['rank'], QualityMods> = {
  normal: { unique: 0, set: 0, rare: 0, magic: 0 },
  champion: { unique: 50, set: 50, rare: 100, magic: 100 },
  unique: { unique: 100, set: 100, rare: 200, magic: 200 },
  boss: { unique: 200, set: 200, rare: 300, magic: 300 },
};
const RANK_CREDITZ: Record<DropContext['rank'], number> = { normal: 1, champion: 1.5, unique: 2.5, boss: 5 };
/** Item level bonus by rank: tougher kills roll from higher equipment bands. */
export const RANK_ILVL_BONUS: Record<DropContext['rank'], number> = {
  normal: 0,
  champion: 1,
  unique: 2,
  boss: 5,
};

const QUALITY_ORDER: ItemQuality[] = ['inferior', 'normal', 'magic', 'rare', 'set', 'unique', 'crafted'];

/**
 * Weight multiplier for an item base given the killer's class: their own weapon types x3, gear only
 * they can use x3, other classes' weapons x0.35, other classes' exclusive gear x0.15.
 */
export function classAffinity(base: ItemBaseDef, classId: ClassId | undefined): number {
  if (!classId) return 1;
  if (base.classOnly) return base.classOnly === classId ? 3 : 0.15;
  if (base.category === 'weapon' && base.weaponClass)
    return CLASS_WEAPONS[classId].includes(base.weaponClass) ? 3 : 0.35;
  return 1;
}

/** Effective magic find after D2 diminishing returns. */
export function mfEffective(mf: number, kind: 'unique' | 'set' | 'rare' | 'magic'): number {
  if (mf <= 10 || kind === 'magic') return Math.max(0, mf);
  const f = MF_FACTOR[kind];
  return (mf * f) / (mf + f);
}

/** Per-roll success probability for one quality tier. */
export function qualityChance(
  kind: 'unique' | 'set' | 'rare' | 'magic',
  ilvl: number,
  qlvl: number,
  magicFind: number,
  tcMod = 0,
): number {
  const r = RATIOS[kind];
  let denom = (r.base - Math.max(0, ilvl - qlvl) / r.div) * 128;
  denom = (denom * 100) / (100 + mfEffective(magicFind, kind));
  denom = Math.max(denom, r.min);
  denom -= (denom * Math.min(tcMod, 900)) / 1024;
  return Math.min(1, 128 / denom);
}

/** D2 quality determination for a gear drop: unique, set, rare, magic, else (low quality) normal. */
export function rollQuality(
  base: ItemBaseDef,
  ilvl: number,
  magicFind: number,
  mods: QualityMods | undefined,
  rng: Rng,
): ItemQuality {
  if (!isGear(base)) return 'normal';
  if (
    uniqueCandidates(base.id, ilvl).length > 0 &&
    rng.chance(qualityChance('unique', ilvl, base.qlvl, magicFind, mods?.unique))
  )
    return 'unique';
  if (
    setCandidates(base.id, ilvl).length > 0 &&
    rng.chance(qualityChance('set', ilvl, base.qlvl, magicFind, mods?.set))
  )
    return 'set';
  if (rng.chance(qualityChance('rare', ilvl, base.qlvl, magicFind, mods?.rare))) return 'rare';
  if (rng.chance(qualityChance('magic', ilvl, base.qlvl, magicFind, mods?.magic))) return 'magic';
  return rng.chance(0.1) ? 'inferior' : 'normal';
}

let bandIndex: Map<string, number[]> | null = null;
/** Resolve a treasure class id; unbanded ids (`tc.weap`) pick the highest `tc.weap.N` with N <= ilvl. */
export function resolveTreasure(id: string, ilvl: number): TreasureClassDef | undefined {
  const exact = DB.treasure.get(id);
  if (exact) return exact;
  if (!bandIndex) {
    bandIndex = new Map();
    for (const tid of DB.treasure.keys()) {
      const m = /^(.*)\.(\d+)$/.exec(tid);
      if (m) {
        const arr = bandIndex.get(m[1]!) ?? [];
        arr.push(Number(m[2]));
        bandIndex.set(
          m[1]!,
          arr.sort((a, b) => a - b),
        );
      }
    }
  }
  const bands = bandIndex.get(id);
  if (!bands) return undefined;
  let pick = bands[0]!;
  for (const b of bands) if (b <= ilvl) pick = b;
  return DB.treasure.get(`${id}.${pick}`);
}

export function rollCreditz(ilvl: number, goldFind: number, rank: DropContext['rank'], rng: Rng): number {
  const base = rng.int(5, 15) * (1 + ilvl * 0.4) * RANK_CREDITZ[rank];
  return Math.max(1, Math.round(base * (1 + Math.max(0, goldFind) / 100)));
}

export function rollDrops(ctx: DropContext, rng: Rng): DropResult {
  const result: DropResult = { items: [], creditz: 0 };
  const ilvl = Math.max(1, ctx.monsterLevel + RANK_ILVL_BONUS[ctx.rank]);
  // Bosses always drop at least one rare-or-better piece of gear.
  let guaranteeRare = ctx.rank === 'boss';

  const drop = (baseId: string, mods: QualityMods | undefined): void => {
    const base = DB.items.get(baseId);
    if (!base) return;
    let quality = rollQuality(base, ilvl, ctx.magicFind, mods, rng);
    if (guaranteeRare && isGear(base)) {
      if (QUALITY_ORDER.indexOf(quality) < QUALITY_ORDER.indexOf('rare')) quality = 'rare';
      guaranteeRare = false;
    }
    const item = createItem(baseId, { quality, ilvl }, rng);
    rollSuperior(item, rng);
    result.items.push(item);
  };

  const roll = (tcId: string, inherited: QualityMods | undefined, depth: number): void => {
    if (depth > 8) return;
    const tc = resolveTreasure(tcId, ilvl);
    if (!tc) return;
    const mods = tc.quality ?? inherited;
    // Entry weights, leaning item bases toward what the killer's class uses.
    const weights = tc.entries.map((e) => {
      const w = Math.max(0, e.weight);
      const base = ctx.classId ? DB.items.get(e.ref) : undefined;
      return base ? w * classAffinity(base, ctx.classId) : w;
    });
    const total = tc.noDrop + weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return;
    for (let i = 0; i < tc.picks; i++) {
      let r = rng.next() * total;
      if (r < tc.noDrop) continue;
      r -= tc.noDrop;
      let chosen: TreasureClassDef['entries'][number] | undefined;
      for (let k = 0; k < tc.entries.length; k++) {
        r -= weights[k]!;
        if (r < 0) {
          chosen = tc.entries[k];
          break;
        }
      }
      chosen ??= tc.entries[tc.entries.length - 1];
      if (!chosen) continue;
      if (chosen.ref === 'creditz') result.creditz += rollCreditz(ilvl, ctx.goldFind, ctx.rank, rng);
      else if (DB.items.has(chosen.ref)) drop(chosen.ref, mods ?? RANK_QUALITY[ctx.rank]);
      else roll(chosen.ref, mods, depth + 1);
    }
  };

  roll(ctx.treasureClass, undefined, 0);
  return result;
}
