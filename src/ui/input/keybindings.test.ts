import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS, resolveKey, shouldPreventDefault } from './keybindings';

describe('keybindings', () => {
  it('maps the D2 classic keys', () => {
    expect(resolveKey('F1')).toEqual({ kind: 'hotkey', slot: 0 });
    expect(resolveKey('F8')).toEqual({ kind: 'hotkey', slot: 7 });
    expect(resolveKey('Digit1')).toEqual({ kind: 'belt', index: 0 });
    expect(resolveKey('Digit4')).toEqual({ kind: 'belt', index: 3 });
    expect(resolveKey('Tab')).toEqual({ kind: 'panel', id: 'map' });
    expect(resolveKey('KeyI')).toEqual({ kind: 'panel', id: 'inventory' });
    expect(resolveKey('KeyC')).toEqual({ kind: 'panel', id: 'character' });
    expect(resolveKey('KeyS')).toEqual({ kind: 'panel', id: 'skills' });
    expect(resolveKey('KeyQ')).toEqual({ kind: 'panel', id: 'quests' });
    expect(resolveKey('Escape')).toEqual({ kind: 'panel', id: 'menu' });
    expect(resolveKey('KeyR')).toEqual({ kind: 'toggleRun' });
    expect(resolveKey('KeyW')).toEqual({ kind: 'swapWeapons' });
    expect(resolveKey('KeyT')).toEqual({ kind: 'recall' });
    expect(resolveKey('AltLeft')).toEqual({ kind: 'showItems' });
    expect(resolveKey('Space')).toEqual({ kind: 'closePanels' });
    expect(resolveKey('ShiftLeft')).toEqual({ kind: 'standStill' });
    expect(resolveKey('KeyZ')).toBeNull();
  });
  it('supports custom maps', () => {
    expect(resolveKey('KeyM', { KeyM: { kind: 'panel', id: 'map' } })).toEqual({ kind: 'panel', id: 'map' });
  });
  it('suppresses browser defaults except for Shift', () => {
    for (const a of Object.values(DEFAULT_KEYBINDINGS))
      expect(shouldPreventDefault(a)).toBe(a.kind !== 'standStill');
  });
});
