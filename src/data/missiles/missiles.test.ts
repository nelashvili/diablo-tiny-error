import { describe, expect, it } from 'vitest';
import { DB } from '../db';

describe('missiles', () => {
  it('every missile has a defined vfx', () => {
    const missing = [...DB.missiles.values()]
      .map((m) => ({ id: m.id, vfx: m.vfx ?? `vfx.${m.id}` }))
      .filter((m) => !DB.vfx.has(m.vfx));
    expect(missing).toEqual([]);
  });

  it('every skill vfx is defined', () => {
    const missing = [...DB.skills.values()]
      .filter((s) => s.vfx !== undefined && !DB.vfx.has(s.vfx))
      .map((s) => `${s.id}: ${s.vfx}`);
    expect(missing).toEqual([]);
  });
});
