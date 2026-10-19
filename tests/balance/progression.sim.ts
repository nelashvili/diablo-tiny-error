import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DB } from '@/data/db';
import { Rng } from '@/core/rng';
import {
  arena,
  fight,
  HEALS_BUDGET,
  makeHero,
  spawnGroup,
  startLoop,
  type FightResult,
  type SpawnSpec,
} from './harness';
import { BUILDS } from './builds';

const SEEDS = Number(process.env.SEEDS ?? 3);
const GEAR = (process.env.GEAR ?? 'normal') as 'normal' | 'magic';
const ONLY = process.env.BUILD;

function areaFor(L: number) {
  const lv = [...DB.levels.values()].filter((l) => l.monsters.length);
  const m = Math.min(L, 10);
  return lv.reduce((a, b) =>
    Math.abs(b.monsterLevel.normal - m) < Math.abs(a.monsterLevel.normal - m) ? b : a,
  );
}

function avg(rs: FightResult[]) {
  const n = rs.length;
  const s = (f: (r: FightResult) => number) => rs.reduce((a, r) => a + f(r), 0) / n;
  return {
    ttk: s((r) => r.seconds),
    dmg: s((r) => r.dmgTaken),
    pots: s((r) => r.potions),
    mpots: s((r) => r.manaPots),
    deaths: rs.filter((r) => r.died).length,
    fails: rs.filter((r) => !r.won && !r.died).length,
    dps: s((r) => r.dps),
    low: Math.min(...rs.map((r) => r.minLifePct)),
  };
}
const fmt = (a: ReturnType<typeof avg>) =>
  `${a.ttk.toFixed(1).padStart(5)}s dmg${(a.dmg * 100).toFixed(0).padStart(4)}% pot${a.pots.toFixed(1)} mp${a.mpots.toFixed(1)} dps${a.dps.toFixed(0).padStart(4)} low${(a.low * 100).toFixed(0).padStart(3)}%${a.deaths ? ` DEAD${a.deaths}` : ''}${a.fails ? ` TIMEOUT${a.fails}` : ''}`;

it('progression', () => {
  const out: string[] = [`gear=${GEAR} seeds=${SEEDS}`];
  for (const b of BUILDS) {
    if (ONLY && !b.name.startsWith(ONLY)) continue;
    for (let L = 1; L <= 10; L++) {
      const area = areaFor(L);
      const mlvl = area.monsterLevel.normal;
      const kinds: Record<string, FightResult[]> = {};
      let life = 0;
      let skill = '';
      for (let seed = 1; seed <= SEEDS; seed++) {
        const groups: [string, SpawnSpec[]][] = [];
        for (const id of area.monsters) {
          const d = DB.monsters.get(id)!;
          const n = Math.round((d.pack.min + d.pack.max) / 2);
          groups.push([`pack:${id}`, [{ defId: id, level: mlvl, rank: 'normal', count: n }]]);
        }
        const champ = area.monsters[seed % area.monsters.length]!;
        groups.push(['champions', [{ defId: champ, level: mlvl, rank: 'champion', count: 3 }]]);
        const uq = area.monsters[(seed + 1) % area.monsters.length]!;
        const ud = DB.monsters.get(uq)!;
        groups.push([
          'unique',
          [
            { defId: uq, level: mlvl, rank: 'unique', count: 1 },
            { defId: uq, level: mlvl, rank: 'minion', count: Math.max(2, ud.pack.max - 1) },
          ],
        ]);
        for (const [key, specs] of groups) {
          const world = arena(seed * 1000 + L);
          const loop = startLoop(world);
          const p = makeHero(world, b, L, { quality: GEAR }, seed);
          p.pos = { x: 30, y: 30 };
          life = p.stats.lifeMax;
          skill = `${p.skills[b.attack.find((a) => p.skills[a]) ?? ''] ?? 0}x${b.attack.find((a) => p.skills[a]) ?? 'attack'}`;
          const foes = spawnGroup(world, p.pos, specs, new Rng(seed * 77 + L));
          (kinds[key] ??= []).push(fight(world, loop, p, b, foes, { maxSec: 120, heals: HEALS_BUDGET }));
        }
      }
      out.push(`${b.name} L${L} life${life} [${skill}] @${area.id}(m${mlvl})`);
      for (const [k, rs] of Object.entries(kinds)) out.push(`   ${k.padEnd(22)} ${fmt(avg(rs))}`);
    }
  }
  writeFileSync(
    `tests/balance/out-progression-${GEAR}${ONLY ? '-' + ONLY : ''}${isFinite(HEALS_BUDGET) ? '-heals' + HEALS_BUDGET : ''}.txt`,
    out.join('\n'),
  );
});
