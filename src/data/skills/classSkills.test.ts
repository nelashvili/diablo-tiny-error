import { describe, expect, it } from 'vitest';
import { DB } from '../db';
import { hasName } from '../names';
import { TIER_LEVEL } from './_build';

describe('class skill trees', () => {
  for (const cls of DB.classes.values()) {
    const skills = [...DB.skills.values()].filter((s) => s.classId === cls.id);

    it(`${cls.id}: 3 trees x 10 skills with unique slots`, () => {
      expect(skills).toHaveLength(30);
      for (const tree of cls.trees) {
        const inTree = skills.filter((s) => s.tree === tree.id);
        expect(inTree, tree.id).toHaveLength(10);
        const slots = new Set(inTree.map((s) => `${s.ui.col},${s.ui.row}`));
        expect(slots.size, `${tree.id} slots`).toBe(10);
      }
    });

    it(`${cls.id}: tiers, prereqs, references and names are consistent`, () => {
      for (const s of skills) {
        expect(s.reqLevel, s.id).toBe(TIER_LEVEL[s.ui.row]);
        for (const p of s.prereqs) {
          const pre = DB.skills.get(p)!;
          expect(pre.classId, `${s.id} <- ${p}`).toBe(cls.id);
          expect(pre.ui.row, `${s.id} <- ${p} tier`).toBeLessThan(s.ui.row);
        }
        if (s.missile) expect(DB.missiles.has(s.missile), `${s.id} missile`).toBe(true);
        if (s.summon) expect(DB.monsters.has(s.summon), `${s.id} summon`).toBe(true);
        for (const syn of s.synergies ?? []) expect(DB.skills.has(syn.from), `${s.id} synergy`).toBe(true);
        expect(hasName(s.name), s.name).toBe(true);
        expect(hasName(s.description), s.description).toBe(true);
      }
    });
  }
});
