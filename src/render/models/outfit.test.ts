import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { armorLook, outfitPartOf, outfitRules } from './outfit';

const WORN = new Set(['helm', 'chest', 'gloves', 'boots']);

describe('armor outfits', () => {
  it('every worn armor base has a look', () => {
    const missing = [...DB.items.values()]
      .filter((b) => b.armorClass && WORN.has(b.armorClass) && !armorLook(b.id))
      .map((b) => b.id);
    expect(missing).toEqual([]);
  });

  it('tiers step up: exceptional differs from normal, elite adds gold and a glow', () => {
    const n = armorLook('battlePlate')!;
    const x = armorLook('battleHyperplate')!;
    const e = armorLook('battleUltraplate')!;
    expect(x.primary).not.toBe(n.primary);
    expect(n.glow).toBe(0);
    expect(e.glow).not.toBe(0);
    expect(e.trim).toBe(e.glow);
  });

  it('maps KayKit mesh parts to body parts (capes untouched)', () => {
    expect(outfitPartOf('Knight_Helmet')).toBe('head');
    expect(outfitPartOf('Rogue_Head_Hooded')).toBe('head');
    expect(outfitPartOf('Mage_Body')).toBe('body');
    expect(outfitPartOf('Rogue_ArmLeft')).toBe('arms');
    expect(outfitPartOf('Knight_LegRight')).toBe('legs');
    expect(outfitPartOf('Knight_Cape')).toBeNull();
  });

  it('elite gauntlets turn gold; heads spare black eyes', () => {
    const e = armorLook('platedPowergloves')!;
    expect(outfitRules(e, 'arms')[1]!.color).toBe(e.trim);
    const head = outfitRules(armorLook('trooperHelm')!, 'head');
    expect(head[2]!.minVal).toBeGreaterThanOrEqual(0.12);
  });
});

describe('headgear styles', () => {
  it('every helm is worn as a helmet or a hood', async () => {
    const { headgearStyle } = await import('./outfit');
    const helms = [...DB.items.values()].filter((b) => b.armorClass === 'helm');
    expect(helms.length).toBeGreaterThan(0);
    for (const h of helms) expect(['trooper', 'mando', 'hood', 'circlet']).toContain(headgearStyle(h.id));
    expect(headgearStyle('trooperHelm')).toBe('trooper');
    expect(headgearStyle('yediHood')).toBe('hood');
    expect(headgearStyle('battleVisor')).toBe('mando');
  });
});

describe('item looks', () => {
  it('gives every item base a real shape (no generic boxes)', async () => {
    const { itemLook } = await import('./itemLook');
    const generic = [...DB.items.values()].filter((b) => itemLook(b.id).kind === 'generic').map((b) => b.id);
    expect(generic).toEqual([]);
  });
});
