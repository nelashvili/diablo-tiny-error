/**
 * Level generation entry point. Deterministic: same (def.id, genParams, seed) => identical level.
 * Accepts a full LevelDef (links/monsters/density/... drive placements) or just the minimal
 * `Pick<LevelDef, 'id' | 'gen' | 'genParams'>`.
 *
 * Placement conventions (read by game/):
 *  - `exit.ref` = target level id, `exit.data.linkKind` = LevelDef link kind. When arriving from level X,
 *    spawn next to the exit whose ref === X; `playerStart` is the fallback (new game / portal arrival).
 *  - `monsterPack.data.tier` = 'normal' | 'champion' | 'unique'; ref = monster def id.
 *  - `boss.ref` = boss def id; `waypoint.ref` = 'obj.waypoint'; `npc.data.slot` = template slot index.
 */
import { Rng, hashString } from '../../rng';
import type { GeneratedLevel, LevelGenerator } from '../types';
import type { LevelGenKind } from '../../../data/schema';
import { finalize, type Layout, type LevelSpec } from './common';
import { generateMaze } from './maze';
import { generateOutdoor } from './outdoor';
import { generatePreset } from './preset';

export type { LevelSpec } from './common';

const BUILDERS: Record<LevelGenKind, (spec: LevelSpec, rng: Rng) => Layout> = {
  outdoor: generateOutdoor,
  maze: generateMaze,
  preset: generatePreset,
  town: generatePreset,
};

export function generateLevel(spec: LevelSpec, seed: number): GeneratedLevel {
  const rng = new Rng((seed ^ hashString(spec.id)) >>> 0);
  const layout = BUILDERS[spec.gen](spec, rng);
  return finalize(spec, layout, rng, seed);
}

/** `LevelGenerator` adapters (one per kind) for code that wants the contract interface. */
export const generators: Record<LevelGenKind, LevelGenerator> = Object.fromEntries(
  (Object.keys(BUILDERS) as LevelGenKind[]).map((kind) => [
    kind,
    {
      kind,
      generate: (levelId, params, seed) =>
        generateLevel({ id: levelId, gen: kind, genParams: params as LevelSpec['genParams'] }, seed),
    } satisfies LevelGenerator,
  ]),
) as Record<LevelGenKind, LevelGenerator>;
