// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { Command } from '../../core/sim/commands';
import type { InputContext } from './types';
import { createInputManager, detectTouch, type InputManager } from './manager';

let mgr: InputManager | null = null;
afterEach(() => {
  mgr?.detach();
  mgr = null;
});

function setup(entityAt?: { x: number; y: number; id: number }, hostile = true) {
  const out: Command[] = [];
  const panels: string[] = [];
  const labels: boolean[] = [];
  let closed = 0;
  const target = document.createElement('div');
  document.body.appendChild(target);
  const ctx: InputContext = {
    dispatch: (c) => out.push(c),
    pick: (x, y) => (entityAt && Math.hypot(x - entityAt.x, y - entityAt.y) < 10 ? entityAt.id : null),
    screenToWorld: (x, y) => ({ x: x / 10, y: y / 10 }),
    getSelectedSkills: () => ({ left: 'slash', right: 'bolt', hotkeys: ['nova', null] }),
    togglePanel: (id) => panels.push(id),
    isOverUi: (x) => x > 1000,
  };
  mgr = createInputManager(target, ctx, {
    gamepad: false,
    getView: () =>
      ({
        get: (id: number) =>
          id === entityAt?.id
            ? { kind: hostile ? 'monster' : 'npc', alive: true, team: 'monsters', life: 1, mode: 'idle' }
            : undefined,
      }) as never,
    onShowItemLabels: (s) => labels.push(s),
    closeAllPanels: () => closed++,
  });
  const ptr = (type: string, x: number, y: number, button = 0, shiftKey = false) =>
    (type === 'pointerdown' ? target : window).dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        button,
        shiftKey,
        pointerType: 'mouse',
        bubbles: true,
      }),
    );
  const key = (type: string, code: string) =>
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  return { out, panels, labels, ptr, key, closed: () => closed, mgr: mgr! };
}

describe('MouseKeyboardDevice', () => {
  it('left click ground -> moveTo, holding keeps updating toward the cursor', () => {
    const { out, ptr, mgr } = setup();
    ptr('pointerdown', 100, 50);
    expect(out).toEqual([{ type: 'moveTo', pos: { x: 10, y: 5 } }]);
    ptr('pointermove', 200, 50);
    mgr.update(0.05);
    expect(out).toHaveLength(1);
    mgr.update(0.05);
    expect(out[1]).toEqual({ type: 'moveTo', pos: { x: 20, y: 5 } });
    ptr('pointerup', 200, 50);
    mgr.update(1);
    expect(out).toHaveLength(2);
  });

  it('left click monster -> interact, then hold attacks with the left skill', () => {
    const { out, ptr, mgr } = setup({ x: 50, y: 50, id: 4 });
    ptr('pointerdown', 50, 50);
    expect(out[0]).toEqual({ type: 'interact', targetId: 4 });
    mgr.update(0.1);
    expect(out[1]).toEqual({ type: 'useSkill', skillId: 'slash', targetId: 4 });
  });

  it('left click npc does not repeat', () => {
    const { out, ptr, mgr } = setup({ x: 50, y: 50, id: 4 }, false);
    ptr('pointerdown', 50, 50);
    mgr.update(0.5);
    expect(out).toEqual([{ type: 'interact', targetId: 4 }]);
  });

  it('shift+left = stand still with left skill; right click = right skill with hold repeat', () => {
    const { out, ptr, mgr } = setup();
    ptr('pointerdown', 30, 40, 0, true);
    expect(out[0]).toEqual({
      type: 'useSkill',
      skillId: 'slash',
      targetPos: { x: 3, y: 4 },
      standStill: true,
    });
    ptr('pointerup', 30, 40, 0);
    ptr('pointerdown', 10, 10, 2);
    expect(out[1]).toEqual({ type: 'useSkill', skillId: 'bolt', targetPos: { x: 1, y: 1 } });
    mgr.update(0.1);
    expect(out).toHaveLength(3);
  });

  it('ignores clicks over UI and blocks the context menu', () => {
    const { out, ptr } = setup();
    ptr('pointerdown', 1200, 10);
    expect(out).toEqual([]);
    const ev = new Event('contextmenu', { cancelable: true });
    mgr!.mouseKeyboard!['target']!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('keyboard: hotkeys, belt, panels, run, swap, recall, alt labels, space', () => {
    const { out, panels, labels, key, closed } = setup();
    key('keydown', 'F1');
    key('keydown', 'F2'); // empty slot: nothing
    key('keydown', 'Digit3');
    key('keydown', 'KeyI');
    key('keydown', 'Tab');
    key('keydown', 'Escape');
    key('keydown', 'KeyR');
    key('keydown', 'KeyX');
    key('keydown', 'KeyT');
    key('keydown', 'AltLeft');
    key('keyup', 'AltLeft');
    key('keydown', 'Space');
    expect(out).toEqual([
      { type: 'selectSkill', hand: 'right', skillId: 'nova' },
      { type: 'useBeltSlot', index: 2 },
      { type: 'setRunning', running: false },
      { type: 'swapWeapons' },
      { type: 'castRecall' },
    ]);
    expect(panels).toEqual(['inventory', 'map', 'menu']);
    expect(labels).toEqual([true, false]);
    expect(closed()).toBe(1);
  });
});

describe('WASD movement', () => {
  it('walks in the held screen direction, combines diagonals and stops on release', () => {
    const { out, key } = setup();
    key('keydown', 'KeyD');
    key('keydown', 'KeyD'); // auto-repeat: no duplicate
    key('keydown', 'KeyW');
    key('keyup', 'KeyD');
    key('keyup', 'KeyW');
    const dirs = out
      .filter((c) => c.type === 'moveDir')
      .map((c) => (c as { dir: { x: number; y: number } }).dir);
    expect(dirs).toHaveLength(3);
    expect(dirs[0]!.x).toBeCloseTo(1); // right
    expect(dirs[1]!.x).toBeCloseTo(Math.SQRT1_2); // up-right
    expect(dirs[1]!.y).toBeCloseTo(-Math.SQRT1_2);
    expect(dirs[2]!.y).toBeCloseTo(-1); // up
    expect(out[out.length - 1]).toEqual({ type: 'stop' });
  });
});

describe('detectTouch', () => {
  it('uses maxTouchPoints / coarse pointer', () => {
    const mk = (points: number, coarse: boolean) =>
      ({ navigator: { maxTouchPoints: points }, matchMedia: () => ({ matches: coarse }) }) as never;
    expect(detectTouch(mk(5, false))).toBe(true);
    expect(detectTouch(mk(0, true))).toBe(true);
    expect(detectTouch(mk(0, false))).toBe(false);
  });
});
