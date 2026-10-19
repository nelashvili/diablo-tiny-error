import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core/sim/events';
import { cuesForEvent, elementForSkill, itemDropIds, planCues, soundForSkill } from './eventMap';
import { PROCEDURAL_IDS } from './synth';

const pos = { x: 1, y: 2 };
type Dmg = Extract<GameEvent, { type: 'damage' }>;
const dmg = (dtype: Dmg['dtype'], crit = false): Dmg => ({
  type: 'damage',
  targetId: 1,
  amount: 5,
  dtype,
  crit,
  pos,
});

describe('cuesForEvent', () => {
  it('every cue has a procedural last id', () => {
    const events: GameEvent[] = [
      dmg('physical'),
      dmg('plasma'),
      dmg('cryo'),
      dmg('storm'),
      dmg('toxin'),
      dmg('magic'),
      { type: 'death', id: 1, pos, droyd: true, defId: 'x' },
      { type: 'death', id: 1, pos, droyd: false, defId: 'x' },
      { type: 'skillCast', casterId: 1, skillId: 'weirdThing' },
      { type: 'levelUp', id: 1, level: 2 },
      { type: 'itemDropped', id: 1, quality: 'unique', pos },
      { type: 'itemDropped', id: 1, quality: 'weird', pos },
      { type: 'itemPickedUp', playerId: 1, baseId: 'a' },
      { type: 'itemPickedUp', playerId: 1, baseId: 'a', creditz: 10 },
      { type: 'bossIntro', id: 1 },
      { type: 'dialogue', npcId: 1, lineKey: 'x' },
      { type: 'shrineUsed', id: 1, shrine: 's' },
      { type: 'waypointActivated', levelId: 'a1' },
    ];
    for (const e of events) {
      const cues = cuesForEvent(e);
      expect(cues.length, e.type).toBeGreaterThan(0);
      for (const c of cues) expect(PROCEDURAL_IDS, JSON.stringify(c)).toContain(c.ids[c.ids.length - 1]);
    }
  });
  it('droyd vs organic death', () => {
    expect(cuesForEvent({ type: 'death', id: 1, pos, droyd: true, defId: 'x' })[0]?.ids.at(-1)).toBe(
      'droydDeath',
    );
    expect(cuesForEvent({ type: 'death', id: 1, pos, droyd: false, defId: 'x' })[0]?.ids.at(-1)).toBe(
      'smoke',
    );
  });
  it('zero damage is silent; crit is louder', () => {
    expect(cuesForEvent({ ...dmg('physical'), amount: 0 })).toEqual([]);
    const a = cuesForEvent(dmg('physical'))[0]?.volume ?? 0;
    const b = cuesForEvent(dmg('physical', true))[0]?.volume ?? 0;
    expect(b).toBeGreaterThan(a);
  });
  it('item drop by quality', () => {
    expect(itemDropIds('unique')).toEqual(['itemDrop.unique']);
    expect(itemDropIds('crafted')).toEqual(['itemDrop.crafted', 'itemDrop.rare']);
  });
});

describe('skill sound guess', () => {
  it('maps by keyword', () => {
    expect(elementForSkill('litesaberStrike')).toBe('saber');
    expect(elementForSkill('cryoNova')).toBe('cryo');
    expect(elementForSkill('stormBolt')).toBe('storm');
    expect(elementForSkill('toxinCloud')).toBe('toxin');
    expect(elementForSkill('plasmaBurst')).toBe('plasma');
    expect(elementForSkill('mystery')).toBe('magic');
    expect(soundForSkill('blasturShot')).toBe('blasturClassic');
  });
});

describe('planCues', () => {
  it('caps crowds and softens volume', () => {
    const events = Array.from({ length: 50 }, () => dmg('physical'));
    const cues = planCues(events);
    expect(cues.length).toBe(4);
    expect(cues[0]?.volume ?? 1).toBeLessThan(0.7);
  });
  it('single events keep full volume', () => {
    const cues = planCues([{ type: 'levelUp', id: 1, level: 2 }]);
    expect(cues[0]?.volume).toBe(1);
  });
});

describe('basic attack sounds', () => {
  const cast = { type: 'skillCast', casterId: 7, skillId: 'attack' } as const;
  it('follow the weapon the caster wields', () => {
    expect(cuesForEvent(cast, { basicAttackSound: () => 'blastur' })[0]?.ids).toEqual(['blasturClassic']);
    expect(cuesForEvent(cast, { basicAttackSound: () => 'saber' })[0]?.ids).toEqual(['saberVwoom']);
    expect(cuesForEvent(cast, { basicAttackSound: () => 'blasturHeavy' })[0]?.ids).toEqual(['blasturHeavy']);
    for (const swing of ['swingLight', 'swingMedium', 'swingHeavy', 'swingVibro', 'swingShock'] as const) {
      expect(cuesForEvent(cast, { basicAttackSound: () => swing })[0]?.ids).toEqual([swing]);
      expect(PROCEDURAL_IDS).toContain(swing);
    }
  });
  it('weapon hits clank on droyds and crits add a crunch', () => {
    const hit = (crit: boolean) =>
      ({ type: 'damage', targetId: 3, sourceId: 2, amount: 5, dtype: 'physical', crit, pos }) as const;
    const droyd = { isDroyd: (id: number) => id === 3 };
    expect(cuesForEvent(hit(false), droyd).map((c) => c.ids)).toEqual([['hitMetal']]);
    expect(cuesForEvent(hit(true), droyd).map((c) => c.ids)).toEqual([['hitMetal'], ['hitCrit']]);
    expect(cuesForEvent(hit(true)).map((c) => c.ids.at(-1))).toEqual(['hit', 'hitCrit']);
    expect(cuesForEvent({ ...hit(true), dtype: 'plasma' }, droyd)).toHaveLength(1);
  });
  it('stay silent without a weapon sound instead of playing a spell chime', () => {
    expect(cuesForEvent(cast)).toEqual([]);
    expect(cuesForEvent(cast, { basicAttackSound: () => null })).toEqual([]);
  });
  it('prefer recorded hit takes before the synth', () => {
    const hit = cuesForEvent({
      type: 'damage',
      targetId: 1,
      sourceId: 2,
      amount: 5,
      dtype: 'physical',
      crit: false,
      pos: { x: 0, y: 0 },
    } as never);
    expect(hit[0]?.ids).toEqual(['hit.physical', 'hit']);
  });
});

describe('lightsaber sounds', () => {
  const hit = (sourceId: number) =>
    ({
      type: 'damage',
      targetId: 1,
      sourceId,
      amount: 5,
      dtype: 'physical',
      crit: false,
      pos: { x: 0, y: 0 },
    }) as const;
  it('saber hits sizzle instead of thumping', () => {
    expect(cuesForEvent(hit(7), { hitsWithSaber: (id) => id === 7 })[0]?.ids).toEqual(['saberHit']);
    expect(cuesForEvent(hit(8), { hitsWithSaber: (id) => id === 7 })[0]?.ids).toEqual([
      'hit.physical',
      'hit',
    ]);
  });
  it('saber recipes exist', () => {
    for (const id of ['saberHum', 'saberVwoom', 'saberHit', 'saberIgnite', 'blasturClassic'])
      expect(PROCEDURAL_IDS).toContain(id);
  });
});

describe('enemy attack sounds', () => {
  const cast = (casterId: number, skillId: string): GameEvent =>
    ({ type: 'skillCast', casterId, skillId, targetPos: { x: 0, y: 0 } }) as GameEvent;
  const ctx = {
    hostileAttackSound: (id: number, skillId: string) =>
      id >= 100 ? (skillId === 'm_claw' ? null : ('blastur' as const)) : undefined,
  };

  it('enemy melee is silent; the impact covers it', () => {
    expect(cuesForEvent(cast(100, 'm_claw'), ctx)).toEqual([]);
  });

  it('enemy shots are quieter and pitched up', () => {
    const [c] = cuesForEvent(cast(100, 'm_blastur'), ctx);
    expect(c?.ids.at(-1)).toBe('blasturClassic');
    expect(c?.volume).toBeLessThan(0.5);
    expect(c?.rate).toBeGreaterThan(1);
  });

  it('caps enemy attacks per frame across every sound', () => {
    const evs = [1, 2, 3, 4, 5].map((i) => cast(100 + i, 'm_blastur'));
    expect(planCues(evs, 4, ctx)).toHaveLength(2);
  });

  it('heroes are unaffected', () => {
    expect(cuesForEvent(cast(1, 'attack'), { ...ctx, basicAttackSound: () => 'blastur' })[0]?.volume).toBe(
      0.8,
    );
  });
});
