import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/sim/commands';
import type { InputContext } from '../input/types';
import type { UiApi } from '../types';
import { TouchController } from './controller';

function setup(movement: 'joystick' | 'tapToMove' = 'joystick') {
  const out: Command[] = [];
  const player = { id: 1, kind: 'player', pos: { x: 0, y: 0 } };
  const view = { localPlayerId: 1, get: (id: number) => (id === 1 ? player : undefined) };
  const api = {
    store: {
      view: signal(view),
      settings: signal({ movement }),
      worldToScreen: () => ({ x: 400, y: 200 }),
    },
  } as unknown as UiApi;
  const ctx: InputContext = {
    dispatch: (c) => out.push(c),
    pick: () => null,
    screenToWorld: (x, y) => ({ x: x / 10, y: y / 10 }),
    getSelectedSkills: () => ({ left: 'attack', right: 'attack', hotkeys: [] }),
    togglePanel: () => {},
    isOverUi: () => false,
  };
  const c = new TouchController(api, ctx, { haptics: false, now: () => 0 });
  c.setViewport(800, 400, 64);
  return { c, out };
}

const at = (x: number, y: number, pointerId = 1) =>
  [
    { pointerId, clientX: x, clientY: y },
    { x, y },
  ] as const;

describe('TouchController movement', () => {
  it('dragging the left side drives the joystick', () => {
    const { c, out } = setup();
    expect(c.worldDown(...at(100, 300))).toBe(true);
    c.pointerMove(...at(160, 300));
    expect(c.stickActive).toBe(true);
    expect(out.some((o) => o.type === 'moveDir')).toBe(true);
    c.pointerUp(at(160, 300)[0]);
    expect(out.at(-1)?.type).toBe('stop');
  });

  it('in joystick mode, tapping empty ground on the right walks there', () => {
    const { c, out } = setup();
    c.worldDown(...at(600, 150));
    c.pointerUp(at(600, 150)[0]);
    expect(out).toEqual([{ type: 'moveTo', pos: { x: 60, y: 15 } }]);
  });

  it('a drag on the right is not a tap', () => {
    const { c, out } = setup();
    c.worldDown(...at(600, 150));
    c.pointerMove(...at(660, 150));
    c.pointerUp(at(660, 150)[0]);
    expect(out).toEqual([]);
  });

  it('tap-to-move mode walks on touch down', () => {
    const { c, out } = setup('tapToMove');
    c.worldDown(...at(100, 300));
    expect(out).toEqual([{ type: 'moveTo', pos: { x: 10, y: 30 } }]);
  });
});
