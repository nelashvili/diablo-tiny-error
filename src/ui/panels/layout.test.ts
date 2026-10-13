import { describe, expect, it } from 'vitest';
import { activeTab, arrangePanels, compactTabs, isCompact, topPanel } from './layout';

describe('arrangePanels', () => {
  it('puts panels on D2 sides', () => {
    expect(arrangePanels(['character', 'inventory'])).toEqual({ left: 'character', right: 'inventory' });
    expect(arrangePanels(['stash', 'inventory', 'options'])).toEqual({
      left: 'stash',
      right: 'inventory',
      center: 'options',
    });
  });
  it('most recent panel per side wins and map is ignored', () => {
    expect(arrangePanels(['inventory', 'skills', 'map'])).toEqual({ right: 'skills' });
    expect(arrangePanels(['character', 'quests'])).toEqual({ left: 'quests' });
  });
});

describe('compact mode', () => {
  it('detects phones and narrow screens', () => {
    expect(isCompact(844, 390)).toBe(true);
    expect(isCompact(1024, 768)).toBe(false);
    expect(isCompact(1920, 1080)).toBe(false);
    expect(isCompact(768, 1024)).toBe(true);
  });
  it('tabs include main panels plus contextual ones', () => {
    expect(compactTabs(['vendor', 'map', 'inventory'])).toEqual([
      'inventory',
      'character',
      'skills',
      'quests',
      'vendor',
    ]);
  });
  it('active tab follows pick or last opened', () => {
    expect(activeTab(['inventory', 'character'], null)).toBe('character');
    expect(activeTab(['inventory', 'character'], 'inventory')).toBe('inventory');
    expect(activeTab(['inventory'], 'skills')).toBe('inventory');
    expect(activeTab(['map'], null)).toBeNull();
    expect(activeTab(['vendor', 'inventory'], null)).toBe('vendor');
  });
  it('topPanel skips the HUD map', () => {
    expect(topPanel(['inventory', 'map'])).toBe('inventory');
    expect(topPanel([])).toBeNull();
  });
});
