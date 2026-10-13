/** Tiny generative ambient pad per mood, used when no music files exist. */

export type Mood = 'town' | 'wild' | 'dungeon' | 'boss';
export const MOODS: readonly Mood[] = ['town', 'wild', 'dungeon', 'boss'];

export interface MoodSpec {
  root: number; // Hz
  intervals: number[]; // semitones above root
  cutoff: number; // low-pass Hz
  lfoRate: number; // Hz, slow filter/volume motion
  level: number; // 0..1
  wave: OscillatorType;
}

export const MOOD_SPECS: Record<Mood, MoodSpec> = {
  town: { root: 110, intervals: [0, 7, 12, 16], cutoff: 1400, lfoRate: 0.12, level: 0.5, wave: 'triangle' },
  wild: { root: 98, intervals: [0, 7, 14, 19], cutoff: 1000, lfoRate: 0.08, level: 0.5, wave: 'sine' },
  dungeon: { root: 55, intervals: [0, 1, 7, 13], cutoff: 500, lfoRate: 0.05, level: 0.6, wave: 'sawtooth' },
  boss: { root: 49, intervals: [0, 6, 7, 12], cutoff: 900, lfoRate: 0.3, level: 0.7, wave: 'sawtooth' },
};

/** Choose a mood from a free-form track id ("town", "music.a1.dungeon", "boss.dooky"). */
export function moodFor(trackId: string): Mood {
  const s = trackId.toLowerCase();
  if (/boss|dooky|fight|battle/.test(s)) return 'boss';
  if (/dungeon|cave|crypt|ruin|tomb|sewer|mine|vault|bunker/.test(s)) return 'dungeon';
  if (/town|camp|outpost|village|city|port|hub|safe/.test(s)) return 'town';
  return 'wild';
}

export const semitone = (root: number, n: number) => root * Math.pow(2, n / 12);

/** A running drone. `stop` fades out then disconnects. */
export interface PadHandle {
  setLevel(v: number, ctx: AudioContext, fade: number): void;
  stop(ctx: AudioContext, fade: number): void;
}

export function startPad(ctx: AudioContext, dest: AudioNode, mood: Mood, fadeIn = 2.5): PadHandle {
  const spec = MOOD_SPECS[mood];
  const out = ctx.createGain();
  out.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = spec.cutoff;
  filter.Q.value = 0.7;
  filter.connect(out);
  out.connect(dest);
  const nodes: (OscillatorNode | GainNode)[] = [];

  spec.intervals.forEach((n, i) => {
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = spec.wave;
      o.frequency.value = semitone(spec.root, n);
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.12 / (1 + i * 0.35);
      o.connect(g);
      g.connect(filter);
      o.start();
      nodes.push(o, g);
    }
  });

  // Slow LFO modulates the filter and breathing level.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = spec.lfoRate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = spec.cutoff * 0.35;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  nodes.push(lfo, lfoGain);

  const t = ctx.currentTime;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(spec.level, t + fadeIn);

  return {
    setLevel(v, c, fade) {
      out.gain.cancelScheduledValues(c.currentTime);
      out.gain.setValueAtTime(out.gain.value, c.currentTime);
      out.gain.linearRampToValueAtTime(spec.level * v, c.currentTime + fade);
    },
    stop(c, fade) {
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(
        () => {
          for (const n of nodes) {
            try {
              if ('stop' in n) n.stop();
              n.disconnect();
            } catch {
              /* already stopped */
            }
          }
          out.disconnect();
        },
        fade * 1000 + 100,
      );
    },
  };
}
