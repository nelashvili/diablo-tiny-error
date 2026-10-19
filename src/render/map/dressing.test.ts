import { describe, expect, it } from 'vitest';
import type { TileKind } from '../../core/world/types';
import { depthInto, dressingFor, propVariant, propVariants, tileTint } from './dressing';
import { getModelEntry } from '../assets/catalog';

describe('prop variants', () => {
  it('maps generic mapgen refs to real catalog models', () => {
    for (const ref of ['prop.tree', 'prop.fern', 'prop.stalagmite', 'prop.statue', 'prop.lamp']) {
      for (const id of propVariants(ref)) expect(getModelEntry(id).url, id).not.toBeNull();
    }
  });

  it('picks every variant across the hash range and passes unknown ids through', () => {
    const seen = new Set([0, 0.3, 0.6, 0.99].map((h) => propVariant('prop.tree', h)));
    expect(seen.size).toBe(propVariants('prop.tree').length);
    expect(propVariant('prop.crate', 0.5)).toBe('prop.crate');
  });
});

describe('dressing', () => {
  it('dresses forest walls with trees and leaves temple walls as tiles', () => {
    expect(dressingFor('endoor.forest', 'wall')?.props.some((p) => p.startsWith('prop.tree'))).toBe(true);
    expect(dressingFor('endoor.temple', 'wall')).toBeUndefined();
    for (const id of dressingFor('endoor.forest', 'rock')!.props)
      expect(getModelEntry(id).url).not.toBeNull();
    expect(tileTint('endoor.cave', 'wall')).not.toBe(0xffffff);
    expect(tileTint('endoor.forest', 'wall')).toBe(0xffffff);
  });

  it('measures depth into solid ground', () => {
    const kinds = 'gwww'.split('').map((c) => (c === 'g' ? 'grass' : 'wall')) as TileKind[];
    const d = depthInto(kinds, 4, 1, (k) => k === 'wall');
    expect([...d]).toEqual([0, 1, 2, 3]);
  });
});

describe('ground scatter', () => {
  it('uses real catalog models and only on open ground', async () => {
    const { scatterFor } = await import('./dressing');
    const grass = scatterFor('endoor.forest', 'grass')!;
    for (const id of grass.props) expect(getModelEntry(id).url, id).not.toBeNull();
    expect(scatterFor('endoor.forest', 'wall')).toBeUndefined();
    expect(scatterFor('endoor.forest', 'road')).toBeUndefined();
  });
});
