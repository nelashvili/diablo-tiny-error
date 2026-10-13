import { describe, expect, it } from 'vitest';
import { createMockApi } from './dev/mock';
import { HudModel, MaxTracker } from './model';
import { FxModel, levelUpLines, type Scheduler } from './fx';
import { consumableKind, pickableSkills, skillInfo } from './lookup';

describe('MaxTracker', () => {
  it('turns remaining time into a fraction of the largest seen', () => {
    const m = new MaxTracker();
    expect(m.frac('a', 10)).toBe(1);
    expect(m.frac('a', 5)).toBe(0.5);
    expect(m.frac('a', 0)).toBe(0);
    expect(m.frac('a', 2)).toBe(1); // restarted
    expect(m.frac('b', 3, 6)).toBe(0.5); // nominal duration known
    expect(m.frac('c', Infinity)).toBe(1);
  });
});

describe('HudModel', () => {
  it('derives deduplicated signals from the view', () => {
    const mock = createMockApi({ scripted: false });
    const model = new HudModel(mock.api.store);
    model.sync(mock.view, 14);
    expect(model.hasPlayer.value).toBe(true);
    expect(model.life.value).toBe(168);
    expect(model.lifeMax.value).toBe(240);
    expect(model.level.value).toBe(7);
    expect(model.skillPoints.value).toBe(2);
    expect(model.belt.value[0]).toMatchObject({ base: 'baktaStim', count: 3, kind: 'heal' });
    expect(model.belt.value[2]).toMatchObject({ kind: 'mana', count: 2 });
    expect(model.target.value).toMatchObject({
      id: 14,
      rank: 'unique',
      mods: ['extraFast', 'plasmaEnchanted'],
    });
    expect(model.status.value.map((s) => s.id)).toEqual(['toxin', 'frostArmor']);

    // Same frame again -> arrays keep identity (no re-render).
    const belt = model.belt.value;
    const status = model.status.value;
    model.sync(mock.view, 14);
    expect(model.belt.value).toBe(belt);
    expect(model.status.value).toBe(status);

    // Cooldowns produce sweep fractions.
    mock.player.cooldowns.starfall = 2;
    model.sync(mock.view, 14);
    expect(model.cooldowns.value.starfall).toBe(1);
    mock.player.cooldowns.starfall = 1;
    model.sync(mock.view, 14);
    expect(model.cooldowns.value.starfall).toBe(0.5);

    // No hover -> falls back to the player's target; nothing -> null.
    model.sync(mock.view, null);
    expect(model.target.value).toBeNull();
    mock.player.targetId = 13;
    model.sync(mock.view, null);
    expect(model.target.value?.rank).toBe('champion');
  });
});

describe('FxModel', () => {
  const sched = (): Scheduler & { run(): void } => {
    const q: (() => void)[] = [];
    return {
      setTimeout: (fn) => q.push(fn),
      clearTimeout: () => {},
      run: () => q.splice(0).forEach((f) => f()),
    };
  };

  it('spawns floats, banners, toasts and quality-colored pickups', () => {
    const mock = createMockApi({ scripted: false });
    const s = sched();
    const fx = new FxModel(s);
    let woke = 0;
    fx.onSpawn = () => woke++;
    fx.handle([{ type: 'inventoryChanged', playerId: 1 }], mock.view);
    mock.player.inventory.items.push({
      item: {
        uid: 'zz',
        base: 'trainingLitesaber',
        quality: 'set',
        ilvl: 1,
        affixes: [],
        mods: [],
        sockets: 0,
        socketed: [],
        identified: true,
      },
      x: 0,
      y: 0,
    });
    fx.handle(
      [
        { type: 'damage', targetId: 10, amount: 12, dtype: 'plasma', crit: false, pos: { x: 1, y: 1 } },
        { type: 'damage', targetId: 1, amount: 5, dtype: 'physical', crit: false, pos: { x: 1, y: 1 } },
        { type: 'damage', targetId: 10, amount: 40, dtype: 'cryo', crit: true, pos: { x: 1, y: 1 } },
        { type: 'xpGained', id: 1, amount: 20 },
        { type: 'xpGained', id: 1, amount: 25 },
        { type: 'levelUp', id: 1, level: 8 },
        { type: 'toast', textKey: 'hud.waypoint' },
        { type: 'itemPickedUp', playerId: 1, baseId: 'trainingLitesaber' },
      ],
      mock.view,
    );
    const texts = fx.pool.slots.filter((x) => x.active).map((x) => [x.text, x.kind, x.color]);
    expect(texts).toContainEqual(['12', 'dmg', 'var(--dmg-plasma)']);
    expect(texts).toContainEqual(['-5', 'hurt', 'var(--ui-life)']);
    expect(texts).toContainEqual(['40!', 'crit', 'var(--dmg-cryo)']);
    expect(texts).toContainEqual(['+45 XP', 'xp', 'var(--ui-xp)']);
    expect(woke).toBe(1);
    expect(fx.banner.value).toMatchObject({ kind: 'levelUp', title: 'Level 8!' });
    expect(fx.banner.value?.lines).toEqual(['+5 stat points', '+1 skill point']);
    expect(fx.toasts.value.map((x) => x.text)).toEqual(['Holo-Beacon activated!']);
    expect(fx.pickups.value[0]).toMatchObject({ color: 'var(--q-set)' });

    // Boss intro outranks level-up; level-up can't replace boss.
    fx.handle([{ type: 'bossIntro', id: 15 }], mock.view);
    expect(fx.banner.value).toMatchObject({ kind: 'boss', title: 'Count Dooky' });
    fx.handle([{ type: 'levelUp', id: 1, level: 9 }], mock.view);
    expect(fx.banner.value?.kind).toBe('boss');

    s.run();
    expect(fx.toasts.value).toEqual([]);
    expect(fx.pickups.value).toEqual([]);
    expect(fx.banner.value).toBeNull();
  });

  it('level-up lines pluralize for multiple levels', () => {
    expect(levelUpLines(2)).toEqual(['+10 stat points', '+2 skill points']);
  });
});

describe('lookup fallbacks', () => {
  it('guesses names, elements and consumables without data', () => {
    expect(skillInfo('chainLightning')).toMatchObject({
      name: 'Chain Lightning',
      element: 'storm',
      glyph: 'bolt',
    });
    expect(skillInfo('frozenOrb').element).toBe('cryo');
    expect(skillInfo('battleOrders').glyph).toBe('roar');
    expect(consumableKind('baktaStim')).toBe('heal');
    expect(consumableKind('energyCell')).toBe('mana');
    expect(consumableKind('rejuvStim')).toBe('rejuv');
    expect(consumableKind('mystery')).toBe('other');
  });

  it('picker excludes non-left-clickable skills for the left hand', () => {
    const mock = createMockApi({ scripted: false });
    const left = pickableSkills(mock.player, 'left');
    const right = pickableSkills(mock.player, 'right');
    expect(left).not.toContain('frostArmor');
    expect(right).toContain('frostArmor');
    expect(right).toContain('plasmaBolt');
  });
});
