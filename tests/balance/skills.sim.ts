import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DB } from '@/data/db';
import { Rng } from '@/core/rng';
import { recomputeStats } from '@/core/player';
import { getManaCost } from '@/core/skills/runtime';
import { arena, fight, makeHero, spawnGroup, startLoop, type Build, type FightResult } from './harness';

const SEEDS = Number(process.env.SEEDS ?? 3);
const PTS = Number(process.env.PTS ?? 5);
const DEFAULT_W: Record<string, string[]> = {
  yediKnight: ['litesaber'],
  bountyHuntur: ['blasturPistol', 'blasturRifle'],
  forseAdept: ['forseStaff'],
};
const STATS: Record<string, [number, number, number, number]> = {
  yediKnight: [2, 1, 2, 0],
  bountyHuntur: [1, 2, 2, 0],
  forseAdept: [0, 0, 3, 2],
};
const ATTACKS = new Set([
  'meleeAttack',
  'missile',
  'multiMissile',
  'nova',
  'area',
  'beam',
  'chain',
  'wall',
  'whirl',
]);

it('skills', () => {
  const out: string[] = [`pts=${PTS} seeds=${SEEDS}  (L = max(10, reqLevel); foes at level L)`];
  const skills = [...DB.skills.values()].filter((s) => s.classId && s.kind !== 'passive');
  const baseline: Record<string, string> = {};
  for (const s of [{ id: 'attack', classId: undefined } as never, ...skills] as typeof skills) {
    for (const cls of s.classId ? [s.classId] : Object.keys(DEFAULT_W)) {
      const L = Math.max(10, s.reqLevel ?? 1);
      const isAttack =
        s.id === 'attack' ||
        ATTACKS.has(s.kind) ||
        (s.kind === 'movement' && (s.weaponDamagePct || s.damage));
      const b: Build = {
        name: s.id,
        classId: cls as never,
        stats: STATS[cls]!,
        weapon: s.weaponReq?.length ? [...s.weaponReq] : DEFAULT_W[cls]!,
        points: [],
        attack: isAttack ? [s.id] : ['attack'],
        buffs: isAttack ? [] : [s.id],
        shield: cls === 'yediKnight',
      };
      const res: Record<string, FightResult[]> = { pack: [], boss: [] };
      let cost = 0;
      for (let seed = 1; seed <= SEEDS; seed++)
        for (const kind of ['pack', 'boss'] as const) {
          const world = arena(seed * 7 + L);
          const loop = startLoop(world);
          const p = makeHero(world, b, L, { quality: 'normal' }, seed);
          if (s.id !== 'attack') {
            p.skills = { [s.id]: PTS };
            for (const q of s.prereqs ?? []) p.skills[q] = 1;
            recomputeStats(p, world.difficulty);
            p.life = p.stats.lifeMax;
            p.mana = p.stats.manaMax;
            cost = getManaCost(p, s.id);
          }
          p.pos = { x: 30, y: 30 };
          const foes = spawnGroup(
            world,
            p.pos,
            kind === 'pack'
              ? [{ defId: 'tuskinRaider', level: L, rank: 'normal', count: 5 }]
              : [{ defId: 'grizzwald', level: L, rank: 'boss', count: 1 }],
            new Rng(seed * 3 + L),
          );
          res[kind]!.push(fight(world, loop, p, b, foes, { maxSec: 120 }));
        }
      const f = (xs: FightResult[]) => {
        const a = (g: (r: FightResult) => number) => xs.reduce((x, r) => x + g(r), 0) / xs.length;
        const to = xs.filter((r) => !r.won).length;
        return `${a((r) => r.seconds)
          .toFixed(1)
          .padStart(6)}s dmg${(a((r) => r.dmgTaken) * 100).toFixed(0).padStart(5)}% dps${a((r) => r.dps)
          .toFixed(0)
          .padStart(4)} mp${a((r) => r.manaPots)
          .toFixed(1)
          .padStart(5)}${to ? ' FAIL' + to : ''}`;
      };
      const line = `${cls.padEnd(12)} ${s.id.padEnd(18)} ${String(s.kind).padEnd(12)} L${String(L).padEnd(3)} cost${cost.toFixed(1).padStart(5)} | pack ${f(res.pack!)} | boss ${f(res.boss!)}`;
      if (s.id === 'attack') baseline[cls] = line;
      out.push(line);
    }
  }
  writeFileSync(`tests/balance/out-skills-p${PTS}.txt`, out.join('\n'));
});
