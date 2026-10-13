import { describe, expect, it } from 'vitest';
import { DB } from './db';
import { hasName } from './names';

describe('DB', () => {
  it('loads classes with 3 trees each', () => {
    expect(DB.classes.size).toBe(3);
    for (const c of DB.classes.values()) {
      expect(c.trees).toHaveLength(3);
      for (const tr of c.trees) expect(hasName(tr.name)).toBe(true);
    }
  });

  it('every skill references a valid class tree and existing prereqs', () => {
    for (const s of DB.skills.values()) {
      const cls = s.classId ? DB.classes.get(s.classId) : undefined;
      if (cls) expect(cls.trees.map((t) => t.id)).toContain(s.tree);
      for (const p of s.prereqs) expect(DB.skills.has(p), `${s.id} prereq ${p}`).toBe(true);
    }
  });
});
