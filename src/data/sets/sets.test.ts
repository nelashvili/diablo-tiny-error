import { describe, expect, it } from 'vitest';
import { DB } from '../db';
import { hasName } from '../names';

const sets = [...DB.sets.values()];

describe('sets', () => {
  it('build every piece on a real base its hero can wear, at or above the base level', () => {
    for (const s of sets)
      for (const it of s.items) {
        const b = DB.items.get(it.base);
        expect(b, `${s.id}/${it.id}`).toBeDefined();
        if (b?.classOnly) expect(b.classOnly, it.id).toBe(s.forClass);
        expect(it.reqLevel, it.id).toBeGreaterThanOrEqual(b?.req.level ?? 0);
      }
  });

  it('give each class an early, mid and late set', () => {
    for (const c of ['yediKnight', 'bountyHuntur', 'forseAdept']) {
      const levels = sets
        .filter((s) => s.forClass === c)
        .map((s) => Math.min(...s.items.map((i) => i.reqLevel)))
        .sort((a, b) => a - b);
      expect(levels.length, c).toBe(3);
      expect(levels[0]!, c).toBeLessThanOrEqual(10);
      expect(levels[1]!, c).toBeGreaterThanOrEqual(18);
      expect(levels[2]!, c).toBeGreaterThanOrEqual(40);
    }
  });

  it('reward the full set, and dress every piece in the set colors', () => {
    for (const s of sets) {
      expect(s.bonuses[s.items.length], s.id).toBeDefined();
      expect(s.look, s.id).toBeDefined();
      expect(new Set(s.items.map((i) => DB.items.get(i.base)?.slots[0])).size, `${s.id} slots`).toBe(
        s.items.length,
      );
    }
  });

  it('name every set and piece, with flavor text and a Holocron story', () => {
    for (const s of sets) {
      expect(hasName(s.name), s.name).toBe(true);
      expect(hasName(`lore.set.${s.id}.title`), s.id).toBe(true);
      expect(hasName(`lore.set.${s.id}.text`), s.id).toBe(true);
      for (const it of s.items) {
        expect(hasName(it.name), it.name).toBe(true);
        expect(hasName(`flavor.setitem.${it.id}`), it.id).toBe(true);
      }
    }
  });
});

describe('item histories', () => {
  it('every armor base and unique has a flavor line', () => {
    const missing = [
      ...[...DB.items.values()]
        .filter((b) => b.category === 'armor')
        .map((b) => b.flavor ?? `(none) ${b.id}`),
      ...[...DB.uniques.values()].map((u) => `flavor.uniq.${u.id}`),
    ].filter((k) => !hasName(k));
    expect(missing).toEqual([]);
  });
});
