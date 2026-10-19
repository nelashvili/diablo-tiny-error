import { describe, expect, it } from 'vitest';
import { thunderEdge, weatherMix } from './weather';

describe('weather ambience', () => {
  it('rain hisses, storms add wind, sand is all wind, clear is silent', () => {
    expect(weatherMix('rain', 1).rain).toBeGreaterThan(weatherMix('rain', 1).wind);
    expect(weatherMix('storm', 1).rain).toBeGreaterThan(weatherMix('rain', 1).rain);
    expect(weatherMix('storm', 1).wind).toBeGreaterThan(0);
    expect(weatherMix('sand', 1)).toMatchObject({ rain: 0 });
    expect(weatherMix('sand', 1).wind).toBeGreaterThan(0);
    expect(weatherMix('clear', 1)).toEqual({ rain: 0, wind: 0 });
    expect(weatherMix('embers', 1)).toEqual({ rain: 0, wind: 0 });
  });

  it('scales with intensity and clamps it', () => {
    expect(weatherMix('rain', 0)).toEqual({ rain: 0, wind: 0 });
    expect(weatherMix('rain', 0.5).rain).toBeCloseTo(weatherMix('rain', 1).rain / 2);
    expect(weatherMix('rain', 3)).toEqual(weatherMix('rain', 1));
  });

  it('thunder follows only the start of a flash', () => {
    expect(thunderEdge(0, 0.8)).toBe(true);
    expect(thunderEdge(0.7, 0.9)).toBe(false); // same flash, still bright
    expect(thunderEdge(0.2, 0.3)).toBe(false); // too faint
  });
});
