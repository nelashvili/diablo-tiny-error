import { describe, expect, it } from 'vitest';
import { DB } from '../db';
import { hasName } from '../names';

describe('monster data', () => {
  it('Act I roster exists', () => {
    for (const id of [
      'scrapDroyd',
      'jawwa',
      'tuskinRaider',
      'normtrooper',
      'probeDroyd',
      'mossBeast',
      'nightsistah',
      'shadowWraith',
    ])
      expect(DB.monsters.has(id), id).toBe(true);
  });

  it('monster skills, missiles and names resolve', () => {
    for (const m of DB.monsters.values()) {
      expect(m.modelId).toBe(`mon.${m.id}`);
      expect(hasName(m.name), m.name).toBe(true);
      for (const s of m.skills ?? []) expect(DB.skills.has(s.skill), `${m.id}:${s.skill}`).toBe(true);
      if (m.missile) expect(DB.missiles.has(m.missile), `${m.id}:${m.missile}`).toBe(true);
      for (const mi of m.minions ?? []) expect(DB.monsters.has(mi), mi).toBe(true);
    }
    for (const s of DB.skills.values()) {
      if (!s.id.startsWith('m_')) continue;
      expect(hasName(s.name), s.name).toBe(true);
      if (s.missile) expect(DB.missiles.has(s.missile), `${s.id}:${s.missile}`).toBe(true);
    }
  });

  it('bosses reference real monsters and have names, intro lines and per-difficulty data', () => {
    expect(DB.bosses.has('countDooky')).toBe(true);
    for (const b of DB.bosses.values()) {
      expect(DB.monsters.has(b.monster), b.id).toBe(true);
      expect(hasName(b.name), b.name).toBe(true);
      if (b.intro) expect(hasName(b.intro), b.intro).toBe(true);
      expect(b.level.normal).toBeLessThan(b.level.veteran);
      expect(b.level.veteran).toBeLessThan(b.level.legend);
      expect(Object.keys(b.treasure)).toHaveLength(3);
    }
  });
});
