/**
 * Keyboard map (D2 classic defaults). Keys are `KeyboardEvent.code` so layouts (AZERTY etc.)
 * keep physical positions for 1-4 / F-keys; letter panels use `code` too, like D2R.
 */
import type { PanelId } from '../types';

export type KeyAction =
  | { kind: 'hotkey'; slot: number } // F1..F8: select right-hand skill
  | { kind: 'belt'; index: number } // 1..4
  | { kind: 'panel'; id: PanelId }
  | { kind: 'toggleRun' }
  | { kind: 'swapWeapons' }
  | { kind: 'recall' }
  | { kind: 'showItems' } // hold
  | { kind: 'closePanels' }
  | { kind: 'standStill' } // hold (Shift)
  | { kind: 'move'; dx: number; dy: number }; // hold: WASD / arrows, screen-space direction

export type KeyBindings = Readonly<Record<string, KeyAction>>;

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  F1: { kind: 'hotkey', slot: 0 },
  F2: { kind: 'hotkey', slot: 1 },
  F3: { kind: 'hotkey', slot: 2 },
  F4: { kind: 'hotkey', slot: 3 },
  F5: { kind: 'hotkey', slot: 4 },
  F6: { kind: 'hotkey', slot: 5 },
  F7: { kind: 'hotkey', slot: 6 },
  F8: { kind: 'hotkey', slot: 7 },
  Digit1: { kind: 'belt', index: 0 },
  Digit2: { kind: 'belt', index: 1 },
  Digit3: { kind: 'belt', index: 2 },
  Digit4: { kind: 'belt', index: 3 },
  Numpad1: { kind: 'belt', index: 0 },
  Numpad2: { kind: 'belt', index: 1 },
  Numpad3: { kind: 'belt', index: 2 },
  Numpad4: { kind: 'belt', index: 3 },
  Tab: { kind: 'panel', id: 'map' },
  KeyI: { kind: 'panel', id: 'inventory' },
  KeyB: { kind: 'panel', id: 'inventory' },
  KeyC: { kind: 'panel', id: 'character' },
  KeyK: { kind: 'panel', id: 'skills' },
  KeyT: { kind: 'recall' },
  KeyQ: { kind: 'panel', id: 'quests' },
  KeyO: { kind: 'panel', id: 'options' },
  Escape: { kind: 'panel', id: 'menu' },
  KeyR: { kind: 'toggleRun' },
  KeyX: { kind: 'swapWeapons' },
  // WASD / arrow movement (screen directions: up the screen, left, down, right).
  KeyW: { kind: 'move', dx: 0, dy: -1 },
  KeyA: { kind: 'move', dx: -1, dy: 0 },
  KeyS: { kind: 'move', dx: 0, dy: 1 },
  KeyD: { kind: 'move', dx: 1, dy: 0 },
  ArrowUp: { kind: 'move', dx: 0, dy: -1 },
  ArrowLeft: { kind: 'move', dx: -1, dy: 0 },
  ArrowDown: { kind: 'move', dx: 0, dy: 1 },
  ArrowRight: { kind: 'move', dx: 1, dy: 0 },
  AltLeft: { kind: 'showItems' },
  AltRight: { kind: 'showItems' },
  Space: { kind: 'closePanels' },
  ShiftLeft: { kind: 'standStill' },
  ShiftRight: { kind: 'standStill' },
};

/** Keys whose browser default (F5 reload, Tab focus, Alt menu, Space scroll) must be suppressed. */
export function shouldPreventDefault(action: KeyAction): boolean {
  return action.kind !== 'standStill';
}

export function resolveKey(code: string, bindings: KeyBindings = DEFAULT_KEYBINDINGS): KeyAction | null {
  return bindings[code] ?? null;
}
