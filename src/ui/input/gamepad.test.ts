import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/sim/commands';
import type { Entity } from '../../core/sim/entities';
import type { WorldView } from '../../core/sim/world';
import type { InputContext } from './types';
import { GamepadDevice, PAD } from './gamepad';

function pad(axes: number[], pressed: number[] = []) {
  return {
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      touched: false,
      value: pressed.includes(i) ? 1 : 0,
    })),
  };
}

function setup(entities: Entity[] = []) {
  const out: Command[] = [];
  const panels: string[] = [];
  const ctx: InputContext = {
    dispatch: (c) => out.push(c),
    pick: () => null,
    // top-down identity projection
    screenToWorld: (x, y) => ({ x, y }),
    getSelectedSkills: () => ({ left: 'slash', right: 'bolt', hotkeys: ['nova', null, 'leap'] }),
    togglePanel: (id) => panels.push(id),
    isOverUi: () => false,
  };
  const player = {
    id: 1,
    kind: 'player',
    pos: { x: 0, y: 0 },
    facing: 0,
    radius: 0.4,
    alive: true,
  } as unknown as Entity;
  const map = new Map<number, Entity>([[1, player], ...entities.map((e) => [e.id, e] as [number, Entity])]);
  const view = {
    localPlayerId: 1,
    get: (id: number) => map.get(id),
    all: () => map.values(),
  } as unknown as WorldView;
  let current = pad([0, 0]);
  const dev = new GamepadDevice({
    getView: () => view,
    getGamepads: () => [null, current],
    getScreenCenter: () => ({ x: 0, y: 0 }),
  });
  dev.attach({} as HTMLElement, ctx);
  return { out, panels, dev, set: (p: ReturnType<typeof pad>) => (current = p) };
}

const monster = {
  id: 7,
  kind: 'monster',
  pos: { x: 3, y: 0 },
  radius: 0.5,
  alive: true,
  team: 'monsters',
  life: 5,
  mode: 'idle',
} as unknown as Entity;

describe('GamepadDevice', () => {
  it('left stick -> moveDir with deadzone, release -> stop', () => {
    const { out, dev, set } = setup();
    set(pad([0.1, 0.1]));
    dev.update(0.016);
    expect(out).toEqual([]);
    set(pad([0, -1]));
    dev.update(0.016);
    expect(out[0]).toMatchObject({ type: 'moveDir' });
    const d = (out[0] as { dir: { x: number; y: number } }).dir;
    expect(d.y).toBeCloseTo(-1);
    set(pad([0, 0]));
    dev.update(0.016);
    expect(out.at(-1)).toEqual({ type: 'stop' });
  });

  it('A attacks the auto-target and repeats while held', () => {
    const { out, dev, set } = setup([monster]);
    set(pad([0, 0], [PAD.A]));
    dev.update(0.016);
    expect(out).toEqual([{ type: 'useSkill', skillId: 'slash', targetId: 7 }]);
    for (let i = 0; i < 15; i++) dev.update(0.016); // 0.24 s
    expect(out.length).toBe(2);
    set(pad([0, 0]));
    dev.update(0.5);
    expect(out.length).toBe(2);
  });

  it('A with nothing hostile interacts with a nearby npc', () => {
    const npc = { id: 9, kind: 'npc', pos: { x: 1, y: 0 }, radius: 0.5, alive: true } as unknown as Entity;
    const { out, dev, set } = setup([npc]);
    set(pad([0, 0], [PAD.A]));
    dev.update(0.016);
    expect(out).toEqual([{ type: 'interact', targetId: 9 }]);
  });

  it('skill slots, belt, menus, toggles', () => {
    const { out, panels, dev, set } = setup();
    set(pad([0, 0], [PAD.X, PAD.UP, PAD.LEFT, PAD.START, PAD.SELECT, PAD.L3, PAD.R3, PAD.Y]));
    dev.update(0.016);
    expect(out).toContainEqual(expect.objectContaining({ type: 'useSkill', skillId: 'nova' }));
    expect(out.filter((c) => c.type === 'useSkill')).toHaveLength(1); // Y slot is empty
    expect(out).toContainEqual({ type: 'useBeltSlot', index: 0 });
    expect(out).toContainEqual({ type: 'useBeltSlot', index: 3 });
    expect(out).toContainEqual({ type: 'setRunning', running: false });
    expect(out).toContainEqual({ type: 'swapWeapons' });
    expect(panels).toEqual(['menu', 'map']);
    const n = out.length;
    dev.update(0.016); // still held: no re-trigger of edge buttons
    expect(out.length).toBe(n);
  });
});
