import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DB } from '@/data/db';
import { Rng } from '@/core/rng';
import { arena, fight, makeHero, spawnGroup, startLoop, type FightResult } from './harness';
import { BUILDS } from './builds';

/** Champion packs of every Act I monster, per build, at a few levels. */
it('champs', () => {
  const out: string[] = [];
  const mons = [...DB.monsters.values()].filter((m) => m.flags.canBeChampion);
  for (const L of [5, 10])
    for (const m of mons) {
      const cells: string[] = [];
      for (const b of BUILDS) {
        const rs: FightResult[] = [];
        for (let seed = 1; seed <= 4; seed++) {
          const world = arena(seed * 91 + L);
          const loop = startLoop(world);
          const p = makeHero(world, b, L, { quality: 'normal' }, seed);
          p.pos = { x: 30, y: 30 };
          const foes = spawnGroup(
            world,
            p.pos,
            [{ defId: m.id, level: L, rank: 'champion', count: 3 }],
            new Rng(seed * 5 + L),
          );
          rs.push(fight(world, loop, p, b, foes, { maxSec: 120 }));
        }
        const dm = rs.reduce((a, r) => a + r.dmgTaken, 0) / rs.length;
        const tt = rs.reduce((a, r) => a + r.seconds, 0) / rs.length;
        cells.push(
          `${b.name.split('.')[1]!.slice(0, 6)} ${tt.toFixed(0).padStart(3)}s${(dm * 100).toFixed(0).padStart(5)}%`,
        );
      }
      out.push(`L${L} ${m.id.padEnd(13)} ${cells.join(' | ')}`);
    }
  writeFileSync('tests/balance/out-champs.txt', out.join('\n'));
});
