/**
 * Level population: turns generator placements (monsterPack / boss) into packs, champions and
 * unique groups with minions.
 */
import type { DefId, Vec2 } from '../types';
import type { Rng } from '../rng';
import type { MonsterEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import type { GeneratedLevel, Placement, TileMap } from '../world/types';
import { isWalkable } from '../world/types';
import { DB } from '../../data/db';
import type { LevelDef, MonsterDef } from '../../data/schema';
import { createMonster } from './create';
import { rollModifierCount, rollModifiers } from './modifiers';

/** Find a free walkable spot near `center` (spiral-ish random search). Returns null if none. */
export function findSpawnPos(
  map: TileMap,
  center: Vec2,
  rng: Rng,
  taken: Vec2[],
  maxRadius = 4,
  minSep = 0.9,
): Vec2 | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = Math.min(maxRadius, 0.6 + attempt * 0.12 + rng.float(0, 1));
    const a = rng.float(0, Math.PI * 2);
    const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
    if (!isWalkable(map, p.x, p.y)) continue;
    if (taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < minSep)) continue;
    return p;
  }
  return null;
}

export interface SpawnResult {
  monsters: MonsterEntity[];
  packs: number;
  champions: number;
  uniques: number;
  bosses: MonsterEntity[];
}

function pickMonsterDef(levelDef: LevelDef, placement: Placement, rng: Rng): MonsterDef | undefined {
  if (placement.ref) {
    const d = DB.monsters.get(placement.ref);
    if (d) return d;
  }
  const candidates = levelDef.monsters.map((id) => DB.monsters.get(id)).filter((d): d is MonsterDef => !!d);
  return candidates.length ? rng.pick(candidates) : undefined;
}

export function spawnLevelMonsters(
  world: SimWorld,
  levelDef: LevelDef,
  level: GeneratedLevel,
  rng: Rng,
): SpawnResult {
  const diff = world.difficulty;
  const mlvl = levelDef.monsterLevel[diff];
  const map = level.map;
  const taken: Vec2[] = [];
  const result: SpawnResult = { monsters: [], packs: 0, champions: 0, uniques: 0, bosses: [] };

  // 1. Decide which pack placements become champion / unique groups.
  const packPlacements = level.placements.filter((p) => p.kind === 'monsterPack');
  const plans: { placement: Placement; def: MonsterDef }[] = [];
  for (const p of packPlacements) {
    const def = pickMonsterDef(levelDef, p, rng);
    if (def) plans.push({ placement: p, def });
  }
  const eligible = plans
    .map((_, i) => i)
    .filter((i) => (plans[i] as { def: MonsterDef }).def.flags.canBeChampion);
  rng.shuffle(eligible);
  const nUnique = Math.min(eligible.length, rng.int(levelDef.uniques.min, levelDef.uniques.max));
  const uniqueIdx = new Set(eligible.splice(0, nUnique));
  const nChamp = Math.min(eligible.length, rng.int(levelDef.champions.min, levelDef.champions.max));
  const champIdx = new Set(eligible.splice(0, nChamp));

  // 2. Spawn.
  plans.forEach(({ placement, def }, i) => {
    const members: MonsterEntity[] = [];
    const size = Math.max(1, rng.int(def.pack.min, def.pack.max));
    const center = placement.pos;
    const spawnOne = (
      defId: DefId,
      rank: MonsterEntity['rank'],
      opts: Parameters<typeof createMonster>[5],
    ) => {
      const pos = findSpawnPos(map, center, rng, taken, 2.5 + Math.sqrt(size));
      if (!pos) return undefined;
      taken.push(pos);
      const m = createMonster(world, defId, pos, mlvl, rank, {
        rng,
        facing: rng.float(0, Math.PI * 2),
        ...opts,
      });
      members.push(m);
      return m;
    };

    if (uniqueIdx.has(i)) {
      const mods = rollModifiers(rng, rollModifierCount(rng, diff));
      const leader = spawnOne(def.id, 'unique', { mods });
      if (leader) {
        result.uniques++;
        for (let k = 1; k < size; k++) spawnOne(def.id, 'minion', { mods, leaderId: leader.id });
      }
    } else if (champIdx.has(i)) {
      const mods = rollModifiers(rng, 1);
      const n = Math.max(2, Math.min(4, size));
      let leaderId: number | undefined;
      for (let k = 0; k < n; k++) {
        const m = spawnOne(def.id, 'champion', { mods, leaderId });
        if (m && leaderId === undefined) leaderId = m.id;
      }
      if (leaderId !== undefined) result.champions++;
    } else {
      let leaderId: number | undefined;
      for (let k = 0; k < size; k++) {
        const m = spawnOne(def.id, k === 0 ? 'normal' : 'minion', { leaderId });
        if (m && leaderId === undefined) leaderId = m.id;
        if (m && k === 0) m.rank = 'normal';
      }
      for (const minionId of def.minions ?? []) {
        spawnOne(minionId, 'minion', { leaderId });
      }
    }
    if (members.length) result.packs++;
    result.monsters.push(...members);
  });

  // 3. Bosses.
  for (const p of level.placements) {
    if (p.kind !== 'boss' || !p.ref) continue;
    const boss = DB.bosses.get(p.ref);
    if (!boss) continue;
    const pos = findSpawnPos(map, p.pos, rng, taken, 1.5) ?? p.pos;
    taken.push(pos);
    const m = createMonster(world, boss.monster, pos, boss.level[diff], 'boss', {
      rng,
      mods: boss.mods,
      nameKey: boss.name,
      bossId: boss.id,
      facing: p.facing,
    });
    if (boss.intro) m.ai.introKey = boss.intro;
    result.bosses.push(m);
    result.monsters.push(m);
    const count = boss.minions ? rng.int(boss.minions.count.min, boss.minions.count.max) : 0;
    for (let k = 0; k < count && boss.minions; k++) {
      const mp = findSpawnPos(map, pos, rng, taken, 5);
      if (!mp) break;
      taken.push(mp);
      result.monsters.push(
        createMonster(world, boss.minions.monster, mp, boss.level[diff], 'minion', {
          rng,
          mods: boss.mods,
          leaderId: m.id,
        }),
      );
    }
  }
  return result;
}
