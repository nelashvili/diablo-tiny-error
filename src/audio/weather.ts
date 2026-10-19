/**
 * Weather ambience, synthesized: rain hiss and wind from one looping noise buffer through filters, and
 * thunder rumbles a moment after each lightning flash. Levels follow the renderer's weather state.
 */

export type WeatherSound = 'clear' | 'rain' | 'storm' | 'snow' | 'ash' | 'embers' | 'spores' | 'sand';

/** Rain and wind levels (0..1) for a weather at an intensity. */
export function weatherMix(kind: WeatherSound, intensity: number): { rain: number; wind: number } {
  const i = Math.min(1, Math.max(0, intensity));
  switch (kind) {
    case 'rain':
      return { rain: 0.55 * i, wind: 0.1 * i };
    case 'storm':
      return { rain: 0.85 * i, wind: 0.45 * i };
    case 'sand':
      return { rain: 0, wind: 0.75 * i };
    case 'snow':
      return { rain: 0, wind: 0.25 * i };
    case 'ash':
      return { rain: 0, wind: 0.15 * i };
    default:
      return { rain: 0, wind: 0 };
  }
}

/** A lightning flash just started (thunder should follow). */
export function thunderEdge(prevFlash: number, flash: number): boolean {
  return prevFlash < 0.3 && flash >= 0.5;
}

export interface WeatherAmbience {
  set(kind: WeatherSound, intensity: number, flash: number): void;
  dispose(): void;
}

/** Loudest each layer gets (before the sfx bus). */
const RAIN_GAIN = 0.22;
const WIND_GAIN = 0.3;
const THUNDER_GAIN = 0.9;

export function createWeatherAmbience(ctx: BaseAudioContext, dest: AudioNode): WeatherAmbience {
  // 3 s of white noise (a small LCG: identical every run).
  const len = Math.floor(ctx.sampleRate * 3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    d[i] = (s >>> 0) / 2147483648 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // Rain: bright hiss with a softer body.
  const rainBand = ctx.createBiquadFilter();
  rainBand.type = 'bandpass';
  rainBand.frequency.value = 2600;
  rainBand.Q.value = 0.5;
  const rainLow = ctx.createBiquadFilter();
  rainLow.type = 'lowpass';
  rainLow.frequency.value = 900;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  src.connect(rainBand).connect(rainGain);
  src.connect(rainLow).connect(rainGain);

  // Wind: low rumble whose filter sweeps slowly, so it gusts.
  const windLow = ctx.createBiquadFilter();
  windLow.type = 'lowpass';
  windLow.frequency.value = 380;
  windLow.Q.value = 2.5;
  const gust = ctx.createOscillator();
  gust.frequency.value = 0.09;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 220;
  gust.connect(gustDepth).connect(windLow.frequency);
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  src.connect(windLow).connect(windGain);

  rainGain.connect(dest);
  windGain.connect(dest);
  src.start();
  gust.start();

  let prevFlash = 0;
  let stopped = false;

  function thunder(): void {
    // Sound travels slower than light: the rumble follows the flash.
    const at = ctx.currentTime + 0.6 + Math.random() * 1.8;
    const n = ctx.createBufferSource();
    n.buffer = buf;
    n.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, at);
    lp.frequency.exponentialRampToValueAtTime(90, at + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(THUNDER_GAIN, at + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, at + 3.2);
    n.connect(lp).connect(g).connect(dest);
    n.start(at, Math.random() * 1.5);
    n.stop(at + 3.4);
  }

  return {
    set(kind, intensity, flash) {
      if (stopped) return;
      const m = weatherMix(kind, intensity);
      rainGain.gain.setTargetAtTime(m.rain * RAIN_GAIN, ctx.currentTime, 0.6);
      windGain.gain.setTargetAtTime(m.wind * WIND_GAIN, ctx.currentTime, 0.8);
      if (thunderEdge(prevFlash, flash)) thunder();
      prevFlash = flash;
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      try {
        src.stop();
        gust.stop();
      } catch {
        /* already stopped */
      }
      rainGain.disconnect();
      windGain.disconnect();
    },
  };
}
