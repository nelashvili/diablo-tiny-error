import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import {
  WEATHER_SLOT,
  applyWeather,
  stepWetness,
  lightningAt,
  parseWeatherParam,
  SKY_KINDS,
  skyWeather,
  slotWeather,
  weatherAt,
} from './weatherState';

describe('weather schedule', () => {
  const swamp = DB.environments.get('fog')!;
  const crypt = DB.environments.get('crypt')!;

  it('indoors is always clear, even when pinned', () => {
    expect(weatherAt(crypt, 100, 'rain')).toMatchObject({ kind: 'clear', intensity: 0 });
  });

  it('rain and storms are shared by every outdoor area; indoors stays dry', () => {
    const outdoor = [...DB.environments.values()].filter((e) => e.weather?.length);
    expect(outdoor.length).toBeGreaterThan(1);
    let wet = 0;
    for (let s = 0; s < 200; s++) {
      const sky = skyWeather(s);
      if (sky !== 'clear') wet++;
      for (const e of outdoor) {
        const k = slotWeather(e, s);
        if (sky !== 'clear') expect(k).toBe(sky);
        else expect(SKY_KINDS).not.toContain(k);
      }
      expect(slotWeather(crypt, s)).toBe('clear');
    }
    expect(wet).toBeGreaterThan(20);
    expect(wet).toBeLessThan(120);
    // Same intensity everywhere too, so the rain doesn't jump at a level change.
    for (let t = 0; t < WEATHER_SLOT * 10; t += 11) {
      const a = weatherAt(outdoor[0]!, t);
      for (const e of outdoor) {
        const b = weatherAt(e, t);
        if (SKY_KINDS.includes(a.kind) || SKY_KINDS.includes(b.kind)) expect(b).toEqual(a);
      }
    }
  });

  it('env tables only list local dry-spell weather', () => {
    for (const e of DB.environments.values())
      for (const w of e.weather ?? []) expect(SKY_KINDS, e.id).not.toContain(w.kind);
  });

  it('is deterministic and only rolls kinds from the table or the sky', () => {
    const kinds = new Set([...swamp.weather!.map((w) => w.kind), ...SKY_KINDS]);
    for (let s = 0; s < 50; s++) {
      expect(kinds.has(slotWeather(swamp, s))).toBe(true);
      expect(slotWeather(swamp, s)).toBe(slotWeather(swamp, s));
    }
  });

  it('ramps in at a change and stays within 0..1', () => {
    for (let t = 0; t < WEATHER_SLOT * 20; t += 7) {
      const w = weatherAt(swamp, t);
      expect(w.intensity).toBeGreaterThanOrEqual(0);
      expect(w.intensity).toBeLessThanOrEqual(1);
      if (w.kind === 'clear') expect(w.intensity).toBe(0);
    }
  });

  it('pinned weather is full strength; storms flash sometimes', () => {
    expect(weatherAt(swamp, 5, 'snow')).toMatchObject({ kind: 'snow', intensity: 1 });
    let flashes = 0;
    for (let t = 0; t < 120; t += 0.05) if (lightningAt(42, t) > 0.5) flashes++;
    expect(flashes).toBeGreaterThan(0);
    expect(parseWeatherParam('rain')).toBe('rain');
    expect(parseWeatherParam('lava')).toBeNull();
  });

  it('rain dims the light and pulls the fog in', () => {
    const light = { ...swamp.day, fog: { ...swamp.day.fog! } };
    const grade = {
      tint: [1, 1, 1] as [number, number, number],
      lift: [0, 0, 0] as [number, number, number],
      sat: 1,
      contrast: 1,
      vignette: 0,
    };
    applyWeather(light, grade, { kind: 'rain', intensity: 1, flash: 0 });
    expect(light.sunI).toBeLessThan(swamp.day.sunI);
    expect(light.fog.far).toBeLessThan(swamp.day.fog!.far);
    expect(grade.sat).toBeLessThan(1);
  });

  it('"Reduce flashes" softens lightning', () => {
    const grade = () => ({
      tint: [1, 1, 1] as [number, number, number],
      lift: [0, 0, 0] as [number, number, number],
      sat: 1,
      contrast: 1,
      vignette: 0,
    });
    const full = { ...swamp.day, fog: { ...swamp.day.fog! } };
    const soft = { ...swamp.day, fog: { ...swamp.day.fog! } };
    applyWeather(full, grade(), { kind: 'storm', intensity: 1, flash: 1 });
    applyWeather(soft, grade(), { kind: 'storm', intensity: 1, flash: 1 }, 0.15);
    const calm = { ...swamp.day, fog: { ...swamp.day.fog! } };
    applyWeather(calm, grade(), { kind: 'storm', intensity: 1, flash: 0 });
    expect(full.hemi - calm.hemi).toBeGreaterThan(5 * (soft.hemi - calm.hemi));
  });

  it('ground soaks in under rain and dries slowly afterwards', () => {
    let wet = 0;
    for (let i = 0; i < 60 * 10; i++) wet = stepWetness(wet, { kind: 'storm', intensity: 1, flash: 0 }, 0.1);
    expect(wet).toBeGreaterThan(0.9);
    const soaked = wet;
    for (let i = 0; i < 20 * 10; i++) wet = stepWetness(wet, { kind: 'clear', intensity: 0, flash: 0 }, 0.1);
    expect(wet).toBeLessThan(soaked);
    expect(wet).toBeGreaterThan(0.5); // still damp 20 s later
  });
});
