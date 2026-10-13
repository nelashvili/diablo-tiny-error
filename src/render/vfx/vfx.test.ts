import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import type { VfxPrimitive } from '../types';
import type { GameEvent } from '../../core/sim/events';
import type { WorldView } from '../../core/sim/world';
import { ParticleSet, SlotPool, P_STRIDE } from './pool';
import { mapEvents, impactId, type EffectSink, type SpawnOpts } from './mapping';
import { styleOf } from './styles';
import { GRADES, gradeFor } from './post';

const PRIMITIVES: VfxPrimitive[] = [
  'bolt',
  'beam',
  'nova',
  'aoeZone',
  'aura',
  'buffGlow',
  'saberTrail',
  'impact',
  'dissolveSmoke',
  'dissolveSparks',
  'levelUp',
  'lootBeam',
  'portal',
];

describe('SlotPool', () => {
  it('allocates unique slots, reports exhaustion and recycles', () => {
    const p = new SlotPool(4);
    const got = [p.alloc(), p.alloc(), p.alloc(), p.alloc()];
    expect(new Set(got).size).toBe(4);
    expect(p.alloc()).toBe(-1);
    expect(p.liveCount).toBe(4);
    p.release(got[2] as number);
    expect(p.isLive(got[2] as number)).toBe(false);
    expect(p.alloc()).toBe(got[2]);
    p.release(99);
    p.release(got[0] as number);
    p.release(got[0] as number); // double release is a no-op
    expect(p.liveCount).toBe(3);
  });
});

describe('ParticleSet', () => {
  const mk = (n: number) => ({
    pos: new Float32Array(n * 4),
    col: new Float32Array(n * 4),
    misc: new Float32Array(n * 2),
  });
  const emit = (s: ParticleSet, life: number, vy = 0, shape = 0) =>
    s.emit(0, 1, 0, 0, vy, 0, life, 1, 0, 0xff0000, 0x0000ff, 1, 0, 0, 0, shape, 0, 0);

  it('drops emits beyond capacity / quality limit', () => {
    const s = new ParticleSet(3);
    expect(emit(s, 1)).toBe(true);
    expect(emit(s, 1)).toBe(true);
    s.limit = 2;
    expect(emit(s, 1)).toBe(false);
    s.limit = 3;
    expect(emit(s, 1)).toBe(true);
    expect(emit(s, 1)).toBe(false);
    expect(s.count).toBe(3);
  });

  it('kills expired particles with swap-remove and keeps survivors', () => {
    const s = new ParticleSet(8);
    const o = mk(8);
    emit(s, 0.1, 1);
    emit(s, 1, 2);
    emit(s, 0.1, 3);
    emit(s, 1, 4);
    expect(s.update(0.2, o.pos, o.col, o.misc)).toBe(2);
    // survivors have vy 2 and 4 -> y = 1 + vy*0.2
    const ys = [o.pos[1], o.pos[5]].map((v) => Math.round((v as number) * 100) / 100).sort();
    expect(ys).toEqual([1.4, 1.8]);
    expect(s.update(2, o.pos, o.col, o.misc)).toBe(0);
  });

  it('recycles capacity after particles die', () => {
    const s = new ParticleSet(2);
    const o = mk(2);
    for (let r = 0; r < 5; r++) {
      expect(emit(s, 0.05)).toBe(true);
      expect(emit(s, 0.05)).toBe(true);
      expect(emit(s, 0.05)).toBe(false);
      s.update(0.1, o.pos, o.col, o.misc);
      expect(s.count).toBe(0);
    }
  });

  it('interpolates color/size/alpha and bounces scrap on the ground', () => {
    const s = new ParticleSet(2);
    const o = mk(2);
    s.emit(0, 1, 0, 0, 0, 0, 1, 2, 0, 0xff0000, 0x0000ff, 1, 0, 0, 0, 0, 0, 0);
    s.update(0.5, o.pos, o.col, o.misc);
    expect(o.pos[3]).toBeCloseTo(1);
    expect(o.col[0]).toBeCloseTo(0.5);
    expect(o.col[2]).toBeCloseTo(0.5);
    expect(o.col[3]).toBeCloseTo(0.5);
    const s2 = new ParticleSet(1);
    s2.emit(0, 0.1, 0, 0, -5, 0, 5, 1, 1, 0xffffff, 0xffffff, 1, 1, 0, 0, 1, 0, 3);
    s2.update(0.1, o.pos, o.col, o.misc);
    expect(o.pos[1]).toBeGreaterThan(0.029);
    expect(s2.data[4]).toBeGreaterThan(0); // vy reversed
  });

  it('has a stable stride', () => {
    expect(new ParticleSet(5).data.length).toBe(5 * P_STRIDE);
  });
});

describe('VfxDef library', () => {
  const all = [...DB.vfx.values()];
  it('is non-empty with unique vfx.* ids and valid primitives', () => {
    expect(all.length).toBeGreaterThan(40);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const d of all) {
      expect(d.id.startsWith('vfx.')).toBe(true);
      expect(PRIMITIVES).toContain(d.primitive);
      expect(Number.isInteger(d.color) && d.color >= 0 && d.color <= 0xffffff).toBe(true);
      if (d.color2 !== undefined) expect(d.color2).toBeLessThanOrEqual(0xffffff);
      for (const v of [d.size, d.durationSec, d.particles])
        if (v !== undefined) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
  it('covers every primitive and every id the event mapping uses', () => {
    for (const p of PRIMITIVES) expect(all.some((d) => d.primitive === p)).toBe(true);
    for (const dt of ['physical', 'plasma', 'cryo', 'storm', 'toxin', 'magic'] as const)
      expect(DB.vfx.has(impactId(dt))).toBe(true);
    for (const id of [
      'vfx.death.smoke',
      'vfx.death.sparks',
      'vfx.levelup',
      'vfx.loot.set',
      'vfx.loot.unique',
      'vfx.loot.rare',
    ])
      expect(DB.vfx.has(id)).toBe(true);
  });
  it('style table only references real ids', () => {
    for (const id of [
      'vfx.bolt.blastur',
      'vfx.beam.forse',
      'vfx.zone.blizzard',
      'vfx.teleport',
      'vfx.leapLanding',
    ]) {
      expect(DB.vfx.has(id)).toBe(true);
      expect(styleOf(id)).not.toBe('default');
    }
  });
});

describe('event mapping', () => {
  const calls: string[] = [];
  const opts: (SpawnOpts | undefined)[] = [];
  const sink: EffectSink = {
    spawn: (id, _p, o) => {
      calls.push(`spawn:${id}`);
      opts.push(o);
    },
    startLoot: (e, id) => calls.push(`loot:${e}:${id}`),
    stopLoot: (e) => calls.push(`stop:${e}`),
    clearLoot: () => calls.push('clear'),
  };
  const view = {
    get: (id: number) => (id === 7 ? { id: 7, kind: 'player', pos: { x: 3, y: 4 } } : undefined),
  } as unknown as WorldView;
  const run = (events: GameEvent[]) => {
    calls.length = 0;
    opts.length = 0;
    mapEvents(events, view, sink);
  };
  const pos = { x: 1, y: 2 };

  it('maps damage by type and scales crits', () => {
    run([
      { type: 'damage', targetId: 1, amount: 5, dtype: 'cryo', crit: false, pos },
      { type: 'damage', targetId: 1, amount: 5, dtype: 'storm', crit: true, pos },
    ]);
    expect(calls).toEqual(['spawn:vfx.impact.cryo', 'spawn:vfx.impact.storm']);
    expect((opts[1]?.radius ?? 0) > (opts[0]?.radius ?? 0)).toBe(true);
  });
  it('maps deaths to smoke or sparks by droyd flag', () => {
    run([
      { type: 'death', id: 1, pos, droyd: false, defId: 'a' },
      { type: 'death', id: 2, pos, droyd: true, defId: 'b' },
    ]);
    expect(calls).toEqual(['spawn:vfx.death.smoke', 'spawn:vfx.death.sparks']);
  });
  it('maps skillImpact, levelUp (needs entity), missileHit', () => {
    run([
      { type: 'skillImpact', skillId: 's', pos, vfx: 'vfx.nova.cryo', radius: 3 },
      { type: 'levelUp', id: 7, level: 2 },
      { type: 'levelUp', id: 8, level: 2 },
      { type: 'missileHit', missileId: 99, pos },
    ]);
    expect(calls).toEqual(['spawn:vfx.nova.cryo', 'spawn:vfx.levelup', 'spawn:vfx.impact.physical']);
    expect(opts[0]?.radius).toBe(3);
  });
  it('maps loot beams for set/unique, sparkle for rare, none for normal, stops on removal', () => {
    run([
      { type: 'itemDropped', id: 10, quality: 'set', pos },
      { type: 'itemDropped', id: 11, quality: 'unique', pos },
      { type: 'itemDropped', id: 12, quality: 'rare', pos },
      { type: 'itemDropped', id: 13, quality: 'normal', pos },
      { type: 'removed', id: 10 },
      { type: 'levelEntered', levelId: 'x', firstVisit: true },
    ]);
    expect(calls).toEqual([
      'loot:10:vfx.loot.set',
      'loot:11:vfx.loot.unique',
      'spawn:vfx.loot.rare',
      'stop:10',
      'clear',
    ]);
  });
});

describe('post grades', () => {
  it('has grades for each act key and falls back to neutral', () => {
    for (const k of ['endoor', 'tatoonie', 'kashyyyyyk', 'deafStar', 'town']) expect(GRADES[k]).toBeDefined();
    expect(gradeFor('nope')).toBe(GRADES['neutral']);
    expect(gradeFor(null)).toBe(GRADES['neutral']);
  });
});
