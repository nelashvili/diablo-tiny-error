import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import type { EntityVisual } from '../types';
import { applyDress, dressOf } from './dress';
import { armorLook } from './outfit';
import { wornSpecOf } from './wornSpec';
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
    setWorn: (slot: string, spec: { key: string; shape: string } | null) =>
      calls.push(`worn.${slot}=${spec?.shape ?? '-'}`),
    setAura: (color: number | null) => calls.push(`aura=${color ?? '-'}`),
  } as unknown as EntityVisual;
  return { v, calls };
}

describe('dressOf', () => {
  it('maps weapons to their styled model and armor to its base', () => {
    const d = dressOf({ mainHand: { base: weapon, quality: 'rare' }, head: { base: helm } });
    expect(d.mainHand).toBe(weaponModelId(weapon, 'rare'));
    expect(d.head).toBe(helm);
    expect(d.offHand).toBe('');
    expect(d.worn.boots).toBeNull();
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
    // Gloves are built on the hands: no attachments or palettes change.
    expect(calls).toEqual([`worn.gloves=${armorLook(gloves)!.shape}`]);
  });
});

describe('worn gear', () => {
  it('builds every glove, belt, boot and chest base on the body', () => {
    for (const b of bases) {
      const slot = b.armorClass === 'chest' ? 'chest' : b.armorClass;
      if (slot !== 'chest' && slot !== 'gloves' && slot !== 'belt' && slot !== 'boots') continue;
      const spec = wornSpecOf(slot, { base: b.id });
      expect(spec?.slot, b.id).toBe(slot);
    }
  });

  it('varies per drop, and dresses rare, set and unique pieces up', () => {
    const a = wornSpecOf('boots', { base: 'workBoots', uid: 'workBoots-1' })!;
    const b = wornSpecOf('boots', { base: 'workBoots', uid: 'workBoots-zz9' })!;
    expect(a.vary).not.toBe(b.vary);
    expect(a.key).not.toBe(b.key);
    expect(a.accent).toBe(0);
    expect(wornSpecOf('boots', { base: 'workBoots', quality: 'rare' })!.accent).not.toBe(0);
    const u = wornSpecOf('gloves', { base: 'workGloves', uniqueId: 'jawwasScavengerMitts' })!;
    expect(u.accent).not.toBe(0);
    expect(u.trim).not.toBe(armorLook('workGloves')!.trim);
  });

  it('elite pieces glow, exceptional ones keep the line shape', () => {
    expect(wornSpecOf('boots', { base: 'workPowerboots' })!.glow).not.toBe(0);
    const x = wornSpecOf('boots', { base: 'workGreaves' })!;
    expect([x.tier, x.shape, x.glow]).toEqual([1, 'work', 0]);
  });
});

describe('blade colors', () => {
  it('re-dresses the hand when a crystal goes into the saber', () => {
    const plain = dressOf({ mainHand: { base: 'trainingLitesaber' } });
    const red = dressOf({
      mainHand: { base: 'trainingLitesaber', socketed: [{ base: 'kybur.red.chipped' }] },
    });
    expect(red.mainHand).not.toBe(plain.mainHand);
    const { v, calls } = fakeVisual();
    applyDress(v, red, plain);
    expect(calls).toEqual([`mainHand=${red.mainHand}`]);
  });
});
