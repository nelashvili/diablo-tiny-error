import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import {
  WEATHER_SLOT,
  applyWeather,
  lightningAt,
  parseWeatherParam,
  slotWeather,
  weatherAt,
} from './weatherState';

describe('weather schedule', () => {
  const swamp = DB.environments.get('fog')!;
  const crypt = DB.environments.get('crypt')!;

  it('indoors is always clear, even when pinned', () => {
    expect(weatherAt(crypt, 100, 'rain')).toMatchObject({ kind: 'clear', intensity: 0 });
  });

  it('is deterministic and only rolls kinds from the table', () => {
    const kinds = new Set(swamp.weather!.map((w) => w.kind));
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
});
