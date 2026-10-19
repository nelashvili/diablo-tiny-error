import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import type { EntityVisual } from '../types';
import { applyDress, dressOf } from './dress';
import { weaponModelId } from './weaponStyle';

const bases = [...DB.items.values()];
const helm = bases.find((b) => b.armorClass === 'helm')!.id;
const gloves = bases.find((b) => b.armorClass === 'gloves')!.id;
const weapon = bases.find((b) => b.weaponClass)!.id;

function fakeVisual() {
  const calls: string[] = [];
  const v = {
    setAttachment: (slot: string, id: string | null) => calls.push(`${slot}=${id}`),
    setOutfit: (part: string, look: { key: string } | null) =>
      calls.push(`outfit.${part}=${look?.key ?? '-'}`),
  } as unknown as EntityVisual;
  return { v, calls };
}

describe('dressOf', () => {
  it('maps weapons to their styled model and armor to its base', () => {
    const d = dressOf({ mainHand: { base: weapon, quality: 'rare' }, head: { base: helm } });
    expect(d.mainHand).toBe(weaponModelId(weapon, 'rare'));
    expect(d.head).toBe(helm);
    expect(d.offHand).toBe('');
    expect(d.boots).toBe('');
  });

  it('empties the main hand while a saber is thrown', () => {
    expect(dressOf({ mainHand: { base: weapon } }, true).mainHand).toBe('');
  });
});

describe('applyDress', () => {
  it('applies everything the first time', () => {
    const { v, calls } = fakeVisual();
    applyDress(v, dressOf({ head: { base: helm } }), null);
    expect(calls).toContain(`head=item.${helm}`);
    expect(calls).toContain('mainHand=null');
    expect(calls.filter((c) => c.startsWith('outfit.'))).toHaveLength(4);
  });

  it('touches only what changed', () => {
    const { v, calls } = fakeVisual();
    const before = dressOf({ head: { base: helm } });
    applyDress(v, before, before);
    expect(calls).toEqual([]);
    applyDress(v, dressOf({ head: { base: helm }, gloves: { base: gloves } }), before);
    // Gloves only recolor the arms: no attachments change, the outfit is refreshed.
    expect(calls.some((c) => !c.startsWith('outfit.'))).toBe(false);
    expect(calls.some((c) => c.startsWith('outfit.arms='))).toBe(true);
  });
});
