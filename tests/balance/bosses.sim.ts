import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DB } from '@/data/db';
import { Rng } from '@/core/rng';
import { arena, fight, HEALS_BUDGET, makeHero, spawnGroup, startLoop, type FightResult } from './harness';
import { BUILDS } from './builds';

const SEEDS = Number(process.env.SEEDS ?? 3);
const GEAR = (process.env.GEAR ?? 'normal') as 'normal' | 'magic';

it('bosses', () => {
  const out: string[] = [`gear=${GEAR} seeds=${SEEDS}`];
  const bosses = [...DB.bosses.values()].sort((a, b) => a.level.normal - b.level.normal);
  for (const boss of bosses) {
    const bl = boss.level.normal;
    for (const L of [
      ...new Set([Math.min(10, bl), Math.min(10, bl + 2), bl === 12 ? 12 : 0].filter(Boolean)),
    ]) {
      for (const b of BUILDS) {
        const rs: FightResult[] = [];
        let bossLife = 0;
        const solo: FightResult[] = [];
        for (let seed = 1; seed <= SEEDS; seed++) {
          for (const withMinions of [true, false]) {
            const world = arena(seed * 31 + L);
            const loop = startLoop(world);
            const p = makeHero(world, b, L, { quality: GEAR }, seed);
            p.pos = { x: 30, y: 30 };
            const rng = new Rng(seed * 13 + bl);
            const n = boss.minions ? Math.round((boss.minions.count.min + boss.minions.count.max) / 2) : 0;
            const foes = spawnGroup(
              world,
              p.pos,
              [
                {
                  defId: boss.monster,
                  level: bl,
                  rank: 'boss',
                  count: 1,
                  mods: boss.mods,
                  bossId: boss.id,
                  dist: 8,
                },
                ...(withMinions && n && boss.minions
                  ? [
                      {
                        defId: boss.minions.monster,
                        level: bl,
                        rank: 'minion' as const,
                        count: n,
                        mods: boss.mods,
                        dist: 8,
                      },
                    ]
                  : []),
              ],
              rng,
            );
            bossLife = foes[0]!.stats.lifeMax;
            const r = fight(world, loop, p, b, foes, { maxSec: 240, heals: HEALS_BUDGET });
            (withMinions ? rs : solo).push(r);
          }
        }
        const f = (xs: FightResult[]) => {
          const s = (g: (r: FightResult) => number) => xs.reduce((a, r) => a + g(r), 0) / xs.length;
          const dead = xs.filter((r) => r.died).length;
          const to = xs.filter((r) => !r.won && !r.died).length;
          return `${s((r) => r.seconds)
            .toFixed(0)
            .padStart(4)}s dmg${(s((r) => r.dmgTaken) * 100).toFixed(0).padStart(5)}% pot${s((r) => r.potions)
            .toFixed(1)
            .padStart(5)} mp${s((r) => r.manaPots)
            .toFixed(1)
            .padStart(
              5,
            )} low${(Math.min(...xs.map((r) => r.minLifePct)) * 100).toFixed(0).padStart(3)}%${dead ? ` DEAD${dead}` : ''}${to ? ` TIMEOUT${to}` : ''}`;
        };
        out.push(
          `${boss.id.padEnd(20)} m${bl} hp${String(bossLife).padStart(4)} ${b.name.padEnd(15)} L${String(L).padEnd(2)} +minions: ${f(rs)} | solo: ${f(solo)}`,
        );
      }
    }
  }
  writeFileSync(
    `tests/balance/out-bosses-${GEAR}${isFinite(HEALS_BUDGET) ? '-heals' + HEALS_BUDGET : ''}.txt`,
    out.join('\n'),
  );
});
