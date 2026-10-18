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
    expect(soundForSkill('blasturShot')).toBe('blastur');
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
    expect(cuesForEvent(cast, { basicAttackSound: () => 'blastur' })[0]?.ids).toEqual([
      'sfx.blasturShot',
      'blastur',
    ]);
    expect(cuesForEvent(cast, { basicAttackSound: () => 'saber' })[0]?.ids).toEqual([
      'sfx.saberSwing',
      'saberSwing',
    ]);
    expect(cuesForEvent(cast, { basicAttackSound: () => 'swing' })[0]?.rate).toBeLessThan(1);
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
