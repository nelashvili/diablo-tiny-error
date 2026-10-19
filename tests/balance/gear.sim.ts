/** Equipment progression report: what bases exist per qlvl for each class and what actually drops by area level. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { DB } from '@/data/db';
import { rollDrops } from '@/core/loot';
import { Rng } from '@/core/rng';
import { CLASS_WEAPONS } from '@/data/items/_classAffinity';
import type { ClassId } from '@/core/types';

const CLASSES: ClassId[] = ['yediKnight', 'bountyHuntur', 'forseAdept'];

it('gear report', () => {
  const out: string[] = [];
  const bases = [...DB.items.values()].filter(
    (b) => (b.category === 'weapon' || b.category === 'armor') && b.qlvl <= 14,
  );
  bases.sort((a, b) => a.qlvl - b.qlvl);
  for (const c of CLASSES) {
    out.push(`\n=== ${c} weapons (qlvl<=14)`);
    for (const b of bases.filter(
      (x) => x.category === 'weapon' && x.weaponClass && CLASS_WEAPONS[c].includes(x.weaponClass),
    ))
      out.push(
        `q${b.qlvl} ${b.id} ${b.weaponClass} dmg ${b.damage?.min}-${b.damage?.max} spd ${b.speed} req ${JSON.stringify(b.req)}${b.classOnly ? ' only:' + b.classOnly : ''}`,
      );
  }
  out.push(`\n=== armor (qlvl<=14)`);
  for (const b of bases.filter((x) => x.category === 'armor'))
    out.push(
      `q${b.qlvl} ${b.id} [${b.slots.join(',')}] def ${b.defense?.min ?? JSON.stringify(b.defense)}-${b.defense?.max ?? ''} req ${JSON.stringify(b.req)}${b.classOnly ? ' only:' + b.classOnly : ''}`,
    );

  // Drop sim: per area level, 2000 normal kills + 100 champion kills per class.
  for (const c of CLASSES) {
    out.push(`\n=== drops for ${c}`);
    for (let ml = 1; ml <= 10; ml++) {
      const rng = new Rng(ml * 31 + c.length);
      const gear: Record<string, number> = {};
      const qual: Record<string, number> = {};
      let n = 0,
        qsum = 0,
        newest = 0;
      for (let k = 0; k < 3000; k++) {
        const r = rollDrops(
          {
            treasureClass: 'tc.a1.normal',
            monsterLevel: ml,
            magicFind: 0,
            goldFind: 0,
            players: 1,
            rank: k % 20 === 0 ? 'champion' : 'normal',
            classId: c,
          },
          rng,
        );
        for (const it of r.items) {
          const b = DB.items.get(it.base)!;
          if (b.category !== 'weapon' && b.category !== 'armor') continue;
          n++;
          qsum += b.qlvl;
          newest = Math.max(newest, b.qlvl);
          gear[b.qlvl] = (gear[b.qlvl] ?? 0) + 1;
          qual[it.quality] = (qual[it.quality] ?? 0) + 1;
        }
      }
      out.push(
        `ml${ml}: ${n} gear/3000 kills, avg qlvl ${(qsum / n).toFixed(1)}, max ${newest}, qlvl hist ${JSON.stringify(gear)}, quality ${JSON.stringify(qual)}`,
      );
    }
  }
  writeFileSync('tests/balance/out-gear.txt', out.join('\n'));
});
