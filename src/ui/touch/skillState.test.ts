import { describe, expect, it } from 'vitest';
import type { PlayerEntity } from '../../core/sim/entities';
import type { Belt, ItemInstance } from '../../core/items/types';
import type { ItemBaseDef, SkillDef } from '../../data/schema';
import { countStims, findStimColumn, skillButtonState, skillGlyph } from './skillState';

const item = (base: string, quantity?: number) => ({ uid: base, base, quantity }) as unknown as ItemInstance;
const bases: Record<string, ItemBaseDef> = {
  h: { use: { kind: 'heal' } } as ItemBaseDef,
  m: { use: { kind: 'mana' } } as ItemBaseDef,
  r: { use: { kind: 'rejuv' } } as ItemBaseDef,
};
const baseOf = (it: ItemInstance) => bases[it.base];

describe('belt stims', () => {
  const belt: Belt = {
    rows: 2,
    cols: 4,
    slots: [null, item('r'), null, item('m'), null, null, item('h'), null],
  };
  it('finds the column of the first pure match, then rejuv', () => {
    expect(findStimColumn(belt, 'mana', baseOf)).toBe(3);
    expect(findStimColumn(belt, 'life', baseOf)).toBe(2); // second row, column 2
    const onlyRejuv: Belt = { rows: 1, cols: 4, slots: [null, item('r'), null, null] };
    expect(findStimColumn(onlyRejuv, 'life', baseOf)).toBe(1);
    expect(findStimColumn(undefined, 'life', baseOf)).toBeNull();
    expect(findStimColumn({ rows: 1, cols: 4, slots: [null, null, null, null] }, 'mana', baseOf)).toBeNull();
  });
  it('counts stims including rejuv and stacks', () => {
    expect(countStims(belt, 'life', baseOf)).toBe(2);
    expect(countStims({ rows: 1, cols: 4, slots: [item('m', 3), null, null, null] }, 'mana', baseOf)).toBe(3);
  });
});

describe('skillButtonState', () => {
  const def = { manaCost: 10, cooldownSec: 4, element: 'plasma' } as unknown as SkillDef;
  it('reports cooldown fraction and mana availability', () => {
    const p = { mana: 5, cooldowns: { a: 1 } } as unknown as PlayerEntity;
    expect(skillButtonState(p, 'a', def, 'Plasma Bolt')).toEqual({
      cooldownFrac: 0.25,
      noMana: true,
      glyph: 'PB',
      element: 'plasma',
    });
    const ready = skillButtonState({ mana: 50, cooldowns: {} } as unknown as PlayerEntity, 'a', def, 'Zap');
    expect(ready.cooldownFrac).toBe(0);
    expect(ready.noMana).toBe(false);
    expect(skillButtonState(null, 'a', undefined, 'Zap')).toMatchObject({ cooldownFrac: 0, noMana: false });
  });
  it('makes 2-letter glyphs', () => {
    expect(skillGlyph('Saber Slash')).toBe('SS');
    expect(skillGlyph('Forse-Leap')).toBe('FL');
    expect(skillGlyph('zap')).toBe('Za');
  });
});
