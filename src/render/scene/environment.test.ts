import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DB } from '../../data/db';
import { GRADES } from '../vfx/post';
import {
  DAY_KEYS,
  DAY_LENGTH,
  EnvironmentClock,
  MOON_RISE,
  START_PHASE,
  dayBlend,
  dayFraction,
  keyLightDir,
  keyLightSwapDip,
  parseTimeParam,
} from './environment';
import { SUN_DIR } from './lighting';

describe('day clock', () => {
  it('starts in the morning and wraps every DAY_LENGTH', () => {
    expect(dayFraction(0)).toBeCloseTo(START_PHASE);
    expect(dayFraction(DAY_LENGTH * 3)).toBeCloseTo(START_PHASE);
    expect(dayBlend(dayFraction(0))).toMatchObject({ a: 'day', b: 'day' });
  });

  it('keys are ordered and cover the whole day', () => {
    expect(DAY_KEYS[0]!.at).toBe(0);
    expect(DAY_KEYS[DAY_KEYS.length - 1]!.at).toBe(1);
    for (let i = 1; i < DAY_KEYS.length; i++)
      expect(DAY_KEYS[i]!.at).toBeGreaterThanOrEqual(DAY_KEYS[i - 1]!.at);
  });

  it('blends between neighbouring phases', () => {
    expect(dayBlend(0.3)).toMatchObject({ a: 'day', b: 'day' });
    expect(dayBlend(0.85)).toMatchObject({ a: 'night', b: 'night' });
    const dusk = dayBlend(0.61);
    expect(dusk).toMatchObject({ a: 'day', b: 'dusk' });
    expect(dusk.t).toBeGreaterThan(0);
    expect(dusk.t).toBeLessThan(1);
    expect(dayBlend(0.97)).toMatchObject({ a: 'night', b: 'dawn' });
  });

  it('dims the key light only around the sun/moon swap', () => {
    expect(keyLightSwapDip(0.3)).toBe(1);
    expect(keyLightSwapDip(MOON_RISE)).toBeCloseTo(0.15);
    expect(keyLightSwapDip(0)).toBeCloseTo(0.15);
  });

  it('key light stays above the horizon and sweeps across the day', () => {
    const a = keyLightDir(0.05, SUN_DIR, new THREE.Vector3());
    const b = keyLightDir(0.5, SUN_DIR, new THREE.Vector3());
    expect(a.y).toBeCloseTo(SUN_DIR.y);
    expect(a.length()).toBeCloseTo(1);
    expect(a.angleTo(b)).toBeGreaterThan(0.3);
  });

  it('parses the debug ?time= value', () => {
    expect(parseTimeParam(null)).toBeNull();
    expect(parseTimeParam('night')).toBeCloseTo(0.85);
    expect(parseTimeParam('0.5')).toBe(0.5);
    expect(parseTimeParam('1.25')).toBe(0.25);
    expect(parseTimeParam('soon')).toBeNull();
  });
});

describe('EnvironmentClock', () => {
  const outdoor = DB.environments.get('mist')!;
  const indoor = DB.environments.get('crypt')!;

  it('indoor levels ignore the clock', () => {
    const c = new EnvironmentClock();
    c.setEnv(indoor, null);
    expect(c.cycles).toBe(false);
    const a = { ...c.eval(0)!.light };
    expect(c.eval(DAY_LENGTH * 0.5)!.light).toEqual(a);
    expect(a.sky).toBe(indoor.day.sky);
  });

  it('outdoor night is dimmer and bluer than day, but the hero light and torches grow', () => {
    const c = new EnvironmentClock();
    c.setEnv(outdoor, null);
    c.pinned = 0.3;
    const day = structuredClone(c.eval(0)!);
    c.pinned = 0.85;
    const night = c.eval(0)!;
    expect(night.light.sunI).toBeLessThan(day.light.sunI);
    expect(night.light.playerLightI).toBeGreaterThan(day.light.playerLightI);
    expect(night.light.mapLights).toBeGreaterThan(day.light.mapLights!);
    expect(night.grade.tint[2]).toBeGreaterThan(night.grade.tint[0]);
    expect(night.grade.sat).toBeLessThan(day.grade.sat);
    // Never pitch black (kids must still see).
    expect(night.light.hemi).toBeGreaterThanOrEqual(0.7);
  });

  it('fog closes in at night and blends smoothly from dusk', () => {
    const c = new EnvironmentClock();
    c.setEnv(outdoor, null);
    c.pinned = 0.3;
    const day = structuredClone(c.eval(0)!.light.fog!);
    c.pinned = 0.85;
    const night = structuredClone(c.eval(0)!.light.fog!);
    expect(night.far).toBeLessThan(day.far);
    c.pinned = 0.71;
    const mid = c.eval(0)!.light.fog!;
    expect(mid.far).toBeLessThan(day.far);
    expect(mid.far).toBeGreaterThan(night.far);
  });

  it('without an EnvDef it defers to the fallback', () => {
    const c = new EnvironmentClock();
    c.setEnv(null, 'endoor.forest');
    expect(c.eval(0)).toBeNull();
  });
});

describe('environment data', () => {
  it('every level environment exists and every grade key is defined', () => {
    for (const l of DB.levels.values()) {
      if (l.ambientLight) expect(DB.environments.has(l.ambientLight), `${l.id} ${l.ambientLight}`).toBe(true);
    }
    for (const e of DB.environments.values()) {
      expect(GRADES[e.grade], e.id).toBeDefined();
      for (const l of [e.day, ...(e.cycle ? Object.values(e.cycle) : [])])
        if (l.fog) expect(l.fog.near, e.id).toBeLessThan(l.fog.far);
    }
  });

  it('towns and outdoor areas cycle; underground areas do not', () => {
    for (const l of DB.levels.values()) {
      const e = l.ambientLight ? DB.environments.get(l.ambientLight) : undefined;
      if (!e) continue;
      expect(!!e.cycle, l.id).toBe(l.gen === 'outdoor' || l.gen === 'town' || l.gen === 'preset');
    }
  });
});
