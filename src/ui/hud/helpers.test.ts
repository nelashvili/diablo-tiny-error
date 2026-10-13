import { describe, expect, it } from 'vitest';
import { formatCompact, formatDuration, formatInt, prettifyId, quantize, ratio } from './format';
import { damageColor, damageToken, effectColor, qualityColor, rankColor } from './colors';
import { MAX_LEVEL, xpForLevel, xpProgress } from './xp';
import { FloatPool, floatFrame } from './floatPool';
import { parseColor } from './mapDraw';

describe('format', () => {
  it('formatInt adds thousands separators', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(1000)).toBe('1,000');
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(-4321)).toBe('-4,321');
    expect(formatInt(12.6)).toBe('13');
    expect(formatInt(NaN)).toBe('0');
  });

  it('formatCompact keeps small numbers whole and compacts big ones', () => {
    expect(formatCompact(7)).toBe('7');
    expect(formatCompact(9999)).toBe('9999');
    expect(formatCompact(12345)).toBe('12.3k');
    expect(formatCompact(20000)).toBe('20k');
    expect(formatCompact(1_500_000)).toBe('1.5M');
    expect(formatCompact(-12345)).toBe('-12.3k');
  });

  it('formatDuration', () => {
    expect(formatDuration(Infinity)).toBe('');
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(0.44)).toBe('0.4');
    expect(formatDuration(5.2)).toBe('6s');
    expect(formatDuration(59.5)).toBe('60s');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('ratio and quantize', () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(150, 100)).toBe(1);
    expect(ratio(-5, 100)).toBe(0);
    expect(ratio(5, 0)).toBe(0);
    expect(quantize(0.1234, 100)).toBe(0.12);
  });

  it('prettifyId', () => {
    expect(prettifyId('litesaberStrike')).toBe('Litesaber Strike');
    expect(prettifyId('a1.mossfields')).toBe('Mossfields');
    expect(prettifyId('battle_droyd')).toBe('Battle Droyd');
  });
});

describe('colors', () => {
  it('maps damage types to theme tokens', () => {
    expect(damageColor('plasma')).toBe('var(--dmg-plasma)');
    expect(damageColor('cryo')).toBe('var(--dmg-cryo)');
    expect(damageColor('bogus')).toBe('var(--dmg-physical)');
    expect(damageToken('storm')).toBe('--dmg-storm');
  });

  it('maps qualities and ranks', () => {
    expect(qualityColor('unique')).toBe('var(--q-unique)');
    expect(qualityColor('weird')).toBe('var(--q-normal)');
    expect(rankColor('champion')).toBe('var(--q-magic)');
    expect(rankColor('unique')).toBe('var(--q-unique)');
    expect(rankColor('boss')).toBe('var(--q-unique)');
    expect(rankColor('normal')).toBe('var(--q-normal)');
    expect(rankColor(undefined)).toBe('var(--q-normal)');
  });

  it('maps status effects to elements', () => {
    expect(effectColor('toxin')).toBe('var(--dmg-toxin)');
    expect(effectColor('freeze')).toBe('var(--dmg-cryo)');
    expect(effectColor('burn')).toBe('var(--dmg-plasma)');
    expect(effectColor('slow')).toBe('var(--ui-text-dim)');
  });

  it('parses token colors for canvas use', () => {
    expect(parseColor('#c9a85c')).toEqual([0xc9, 0xa8, 0x5c, 255]);
    expect(parseColor('#fff', 0.5)).toEqual([255, 255, 255, 128]);
    expect(parseColor('rgba(12, 14, 24, 0.5)')).toEqual([12, 14, 24, 128]);
  });
});

describe('xp', () => {
  it('uses the D2 table', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(500);
    expect(xpForLevel(10)).toBe(57715);
    expect(MAX_LEVEL).toBe(75);
  });

  it('computes in-level progress', () => {
    const p = xpProgress(2, 1000);
    expect(p.cur).toBe(500);
    expect(p.span).toBe(1000);
    expect(p.frac).toBe(0.5);
    expect(xpProgress(3, 0).frac).toBe(0);
    expect(xpProgress(75, 1e12)).toEqual({ cur: 0, span: 0, frac: 1, maxed: true });
  });
});

describe('FloatPool', () => {
  const spec = { text: '1', color: 'red', kind: 'dmg' as const, world: { x: 0, y: 0 }, height: 1, life: 1 };

  it('reuses free slots and expires by age', () => {
    const pool = new FloatPool(3);
    const a = pool.spawn(spec);
    pool.spawn(spec);
    expect(pool.activeCount).toBe(2);
    expect(pool.step(0.5)).toBe(true);
    expect(pool.step(0.6)).toBe(false);
    expect(pool.activeCount).toBe(0);
    expect(pool.spawn(spec)).toBe(a);
  });

  it('recycles the oldest slot when full', () => {
    const pool = new FloatPool(2);
    const first = pool.spawn({ ...spec, text: 'a' });
    pool.spawn({ ...spec, text: 'b' });
    const third = pool.spawn({ ...spec, text: 'c' });
    expect(third).toBe(first);
    expect(pool.slots[third]!.text).toBe('c');
    expect(pool.slots[third]!.dirty).toBe(true);
    expect(pool.activeCount).toBe(2);
  });

  it('fans out simultaneous numbers unless dx is given', () => {
    const pool = new FloatPool(4);
    const xs = [pool.spawn(spec), pool.spawn(spec), pool.spawn(spec)].map((i) => pool.slots[i]!.dx);
    expect(new Set(xs).size).toBe(3);
    expect(pool.slots[pool.spawn({ ...spec, dx: 0 })]!.dx).toBe(0);
  });

  it('animation pops, rises and fades', () => {
    const start = floatFrame(0, 'dmg', 0);
    const peak = floatFrame(0.12, 'crit', 0);
    const end = floatFrame(1, 'dmg', 10);
    expect(start.opacity).toBe(1);
    expect(peak.scale).toBeGreaterThan(1.5);
    expect(floatFrame(0.5, 'dmg', 0).scale).toBe(1);
    expect(end.opacity).toBe(0);
    expect(end.y).toBeLessThan(-40);
    expect(end.x).toBeCloseTo(10);
    expect(floatFrame(1, 'crit', 0).y).toBeLessThan(end.y);
  });
});
