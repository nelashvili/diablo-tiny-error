/**
 * Audio system: Howler for catalog files, Web Audio for procedural SFX and ambient pads.
 * Playback prefers catalog files and falls back to procedural synthesis.
 */
import { Howl, Howler } from 'howler';
import type { AudioSystem } from './types';
import type { GameEvent } from '../core/sim/events';
import { moodFor, startPad, type PadHandle } from './ambient';
import { planCues, type Cue, type CueContext } from './eventMap';
import { finalGain, pickTake, positional, SfxThrottle, VoiceLimiter, type Volumes } from './mixer';
import { PROCEDURAL_IDS, PROCEDURAL_TAKES, ProceduralSfx, RECIPES } from './synth';
import { VOICE_DUCK, VOICE_GAP, voiceUrl } from './voice';

export interface CatalogEntry {
  urls: string[];
  volume?: number;
  loop?: boolean;
  /** Random playback-rate range for this take. */
  rate?: [number, number];
  /** Other catalog ids that sound alike; one is picked at random per play. */
  variants?: string[];
}
export type AudioCatalog = Record<string, CatalogEntry>;

export interface AudioSystemOptions {
  catalog?: AudioCatalog;
  /** Max concurrent voices of one id (default 4) and overall (default 24). */
  maxPerId?: number;
  maxVoices?: number;
  /** Random variation applied to every sfx (fractions). */
  pitchVariation?: number;
  volumeVariation?: number;
  /** Music crossfade seconds. */
  crossfade?: number;
}

export interface Vec2Like {
  x: number;
  y: number;
}

export interface LoopHandle {
  /** 0..1 swing intensity → pitch shift (hum rises while swinging). */
  setIntensity(v: number): void;
  stop(): void;
}

export interface FullAudioSystem extends AudioSystem {
  setListener(pos: Vec2Like): void;
  playSfxAt(id: string, pos: Vec2Like, opts?: { volume?: number; rate?: number }): void;
  /** Start a continuous loop (e.g. 'saberHum'); returns a handle or null if unavailable. */
  startLoop(id: string, opts?: { volume?: number }): LoopHandle | null;
  /** Speak recorded lines in order (unrecorded ones are skipped), replacing any current speech. */
  speak(lineKeys: readonly string[]): void;
  /** Ids available procedurally. */
  listProcedural(): string[];
  /** Whether a catalog file exists for the id. */
  hasFile(id: string): boolean;
  getVolumes(): Volumes;
  dispose(): void;
}

type Ctx = AudioContext;
interface WinWithWebkit {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export function createAudioSystem(opts: AudioSystemOptions = {}): FullAudioSystem {
  const catalog = opts.catalog ?? {};
  const pitchVar = opts.pitchVariation ?? 0.06;
  const volVar = opts.volumeVariation ?? 0.1;
  const crossfade = opts.crossfade ?? 2;
  const limiter = new VoiceLimiter(opts.maxPerId ?? 4, opts.maxVoices ?? 24, {
    saberHum: 2,
    footstep: 2,
    hit: 5,
  });
  const throttle = new SfxThrottle(0.04, 4, { hit: 0.05, footstep: 0.15, dialogue: 0.1 }, { hit: 5 });

  let volumes: Volumes = { master: 0.8, music: 0.6, sfx: 0.9, voice: 0.9 };
  /** Music gain multiplier: below 1 while a voice line plays. */
  let duck = 1;
  let listener: Vec2Like | null = null;
  let unlocked = false;
  let disposed = false;

  // ---- Web Audio graph (lazy) ----
  let ctx: Ctx | null = null;
  let masterGain: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let proc: ProceduralSfx | null = null;

  function ensureCtx(): Ctx | null {
    if (ctx) return ctx;
    if (typeof window === 'undefined') return null;
    const w = window as unknown as WinWithWebkit;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    masterGain = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(masterGain);
    musicBus.connect(masterGain);
    masterGain.connect(ctx.destination);
    proc = new ProceduralSfx(ctx);
    applyVolumes();
    return ctx;
  }

  function applyVolumes(): void {
    const g = {
      master: finalGain(1, 'sfx', { ...volumes, sfx: 1 }),
      sfx: finalGain(1, 'sfx', { ...volumes, master: 1 }),
      music: finalGain(1, 'music', { ...volumes, master: 1 }) * duck,
    };
    if (masterGain) masterGain.gain.value = g.master;
    if (sfxBus) sfxBus.gain.value = g.sfx;
    if (musicBus) musicBus.gain.value = g.music;
    // Howler master is applied globally; file sfx/music get their bus gain per sound.
    try {
      Howler.volume(g.master);
    } catch {
      /* no audio env */
    }
    if (currentMusicHowl) {
      currentMusicHowl.volume(musicFileVolume(currentMusicBase));
    }
  }

  // ---- File sounds (Howler, lazy) ----
  const howls = new Map<string, Howl>();
  function howlFor(id: string): Howl | null {
    const entry = catalog[id];
    if (!entry || entry.urls.length === 0) return null;
    let h = howls.get(id);
    if (!h) {
      h = new Howl({ src: entry.urls, volume: entry.volume ?? 1, loop: entry.loop ?? false, preload: true });
      howls.set(id, h);
    }
    return h;
  }
  const sfxFileVolume = (base: number) => finalGain(base, 'sfx', { ...volumes, master: 1 });
  const musicFileVolume = (base: number) => finalGain(base, 'music', { ...volumes, master: 1 }) * duck;
  const voiceFileVolume = () => finalGain(1, 'voice', { ...volumes, master: 1 });

  const rand = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;

  // ---- SFX ----
  function playResolved(ids: string[], o: { volume?: number; rate?: number; pos?: Vec2Like } = {}): void {
    if (disposed) return;
    const fileId = ids.find((i) => catalog[i] !== undefined && catalog[i].urls.length > 0);
    const procId = fileId ? undefined : ids.find((i) => RECIPES[i] !== undefined);
    const id = fileId ?? procId;
    if (!id) return;

    let gain = o.volume ?? 1;
    let pan = 0;
    if (o.pos && listener) {
      const p = positional(listener, o.pos);
      if (p.gain <= 0.001) return;
      gain *= p.gain;
      pan = p.pan;
    }

    const handle = limiter.acquire(id);
    if (!handle) return;

    const variation = procId ? (getRecipePitchVar(procId) ?? pitchVar) : pitchVar;
    let rate = (o.rate ?? 1) * rand(variation);
    const vol = gain * (1 - Math.random() * volVar);

    if (fileId) {
      // Alternate between the clip's recorded takes, each at its own pitch range.
      const take = pickTake(fileId, catalog, Math.random(), Math.random());
      rate *= take.rate;
      const h = howlFor(take.id);
      if (!h) {
        limiter.release(handle);
        return;
      }
      const base = catalog[take.id]?.volume ?? 1;
      const sid = h.play();
      h.volume(sfxFileVolume(base * vol), sid);
      h.rate(rate, sid);
      if (pan) h.stereo(pan, sid);
      h.once('end', () => limiter.release(handle), sid);
      // Safety: if 'end' never fires (looped / failed load), release after 10 s.
      setTimeout(() => limiter.release(handle), 10000);
      return;
    }

    const c = ensureCtx();
    if (!c || !sfxBus || !proc || !procId) {
      limiter.release(handle);
      return;
    }
    if (c.state !== 'running') {
      // Not unlocked yet: dropping is better than queueing a burst of late sounds.
      limiter.release(handle);
      return;
    }
    const ab = proc.get(procId, Math.floor(Math.random() * PROCEDURAL_TAKES));
    if (!ab) {
      limiter.release(handle);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = ab;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol * (getRecipeGain(procId) ?? 1);
    let tail: AudioNode = g;
    src.connect(g);
    if (pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(sfxBus);
    src.onended = () => {
      limiter.release(handle);
      src.disconnect();
      tail.disconnect();
      if (tail !== g) g.disconnect();
    };
    src.start();
  }

  function getRecipePitchVar(id: string): number | undefined {
    return RECIPES[id]?.pitchVar;
  }
  function getRecipeGain(id: string): number | undefined {
    return RECIPES[id]?.gain;
  }

  // ---- Music ----
  let currentMusicId: string | null = null;
  let currentMusicHowl: Howl | null = null;
  let currentMusicBase = 1;
  let currentPad: PadHandle | null = null;
  let pendingTrack: string | null | undefined;

  function fadeOutCurrent(): void {
    if (currentMusicHowl) {
      const h = currentMusicHowl;
      h.fade(h.volume(), 0, crossfade * 1000);
      setTimeout(() => h.stop(), crossfade * 1000 + 100);
      currentMusicHowl = null;
    }
    if (currentPad && ctx) {
      currentPad.stop(ctx, crossfade);
      currentPad = null;
    }
  }

  function playMusic(trackId: string | null): void {
    if (disposed) return;
    if (trackId === currentMusicId && (currentMusicHowl || currentPad)) return;
    if (trackId === currentMusicId && trackId === null) return;
    currentMusicId = trackId;
    fadeOutCurrent();
    if (trackId === null) {
      pendingTrack = undefined;
      return;
    }
    const key = catalog[trackId] ? trackId : catalog[`music.${trackId}`] ? `music.${trackId}` : null;
    if (key) {
      const h = howlFor(key);
      if (!h) return;
      h.loop(catalog[key]?.loop ?? true);
      currentMusicBase = catalog[key]?.volume ?? 1;
      currentMusicHowl = h;
      h.volume(0);
      h.play();
      h.fade(0, musicFileVolume(currentMusicBase), crossfade * 1000);
      return;
    }
    // Generative fallback; requires a running context (wait for unlock otherwise).
    const c = ensureCtx();
    if (!c || !musicBus || c.state !== 'running') {
      pendingTrack = trackId;
      return;
    }
    currentPad = startPad(c, musicBus, moodFor(trackId), crossfade + 0.5);
  }

  // ---- Voice ----
  let speech: Howl | null = null;
  /** Bumped by every new speech so a stale line's 'end' cannot start the next one. */
  let speechToken = 0;
  let gapTimer: ReturnType<typeof setTimeout> | undefined;

  function setDuck(on: boolean): void {
    const next = on ? VOICE_DUCK : 1;
    if (next === duck) return;
    duck = next;
    if (currentMusicHowl)
      currentMusicHowl.fade(currentMusicHowl.volume(), musicFileVolume(currentMusicBase), 400);
    if (musicBus && ctx)
      musicBus.gain.setTargetAtTime(
        finalGain(1, 'music', { ...volumes, master: 1 }) * duck,
        ctx.currentTime,
        0.15,
      );
  }

  function stopSpeech(): void {
    speechToken++;
    clearTimeout(gapTimer);
    if (speech) {
      speech.unload();
      speech = null;
    }
  }

  function speak(lineKeys: readonly string[]): void {
    if (disposed) return;
    stopSpeech();
    const urls = lineKeys.map((k) => voiceUrl(k)).filter((u): u is string => u !== null);
    const token = speechToken;
    const next = (i: number): void => {
      if (token !== speechToken) return;
      const url = urls[i];
      if (!url) {
        speech = null;
        setDuck(false);
        return;
      }
      const h = new Howl({ src: [url], format: ['m4a'], volume: voiceFileVolume() });
      speech = h;
      const done = () => {
        h.unload();
        if (token !== speechToken) return;
        speech = null;
        gapTimer = setTimeout(() => next(i + 1), VOICE_GAP * 1000);
      };
      h.once('end', done);
      h.once('loaderror', done);
      h.once('playerror', done);
      h.play();
    };
    setDuck(urls.length > 0);
    next(0);
  }

  // ---- Unlock ----
  function unlock(): void {
    if (disposed) return;
    const c = ensureCtx();
    if (c) {
      void c.resume().then(
        () => {
          if (c.state === 'running' && !unlocked) {
            unlocked = true;
            // iOS: play a silent buffer inside the gesture to fully unlock.
            try {
              const b = c.createBuffer(1, 1, 22050);
              const s = c.createBufferSource();
              s.buffer = b;
              s.connect(c.destination);
              s.start(0);
            } catch {
              /* ignore */
            }
          }
          if (pendingTrack !== undefined) {
            const t = pendingTrack;
            pendingTrack = undefined;
            currentMusicId = null;
            playMusic(t);
          }
        },
        () => undefined,
      );
    }
    try {
      const hc = Howler.ctx;
      if (hc && hc.state !== 'running') void hc.resume();
    } catch {
      /* ignore */
    }
  }

  const gestureEvents = ['pointerdown', 'touchend', 'keydown', 'click'] as const;
  const onGesture = () => {
    unlock();
    if (ctx && ctx.state === 'running') removeGestureListeners();
  };
  function removeGestureListeners(): void {
    if (typeof document === 'undefined') return;
    for (const e of gestureEvents) document.removeEventListener(e, onGesture, true);
  }
  if (typeof document !== 'undefined') {
    for (const e of gestureEvents) document.addEventListener(e, onGesture, true);
    // iOS may suspend when backgrounded; resume on return.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    });
  }

  // ---- Public API ----
  const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  function playCue(c: Cue): void {
    const key = c.ids[c.ids.length - 1] ?? '';
    if (!throttle.allow(key, nowSec())) return;
    playResolved(c.ids, { volume: c.volume, rate: c.rate, pos: c.pos });
  }

  return {
    unlock,
    playMusic,
    playSfx(id, o) {
      playResolved([id], o);
    },
    playSfxAt(id, pos, o) {
      playResolved([id], { ...o, pos });
    },
    handleEvents(events: readonly GameEvent[], cueCtx?: CueContext) {
      if (disposed || events.length === 0) return;
      throttle.beginBatch();
      for (const c of planCues(events, 4, cueCtx)) playCue(c);
    },
    setVolumes(v) {
      volumes = { master: v.master, music: v.music, sfx: v.sfx, voice: v.voice ?? volumes.voice };
      applyVolumes();
      speech?.volume(voiceFileVolume());
    },
    getVolumes: () => ({ ...volumes }),
    setListener(pos) {
      listener = pos;
    },
    startLoop(id, o) {
      const volume = o?.volume ?? 1;
      const fileKey = catalog[id] ? id : null;
      if (fileKey) {
        const h = howlFor(fileKey);
        if (!h) return null;
        h.loop(true);
        const sid = h.play();
        h.volume(sfxFileVolume((catalog[fileKey]?.volume ?? 1) * volume), sid);
        return {
          setIntensity: (v) => void h.rate(1 + 0.25 * v, sid),
          stop: () => h.stop(sid),
        };
      }
      const c = ensureCtx();
      if (!c || !sfxBus || !proc || !proc.has(id)) return null;
      const ab = proc.get(id);
      if (!ab) return null;
      const src = c.createBufferSource();
      src.buffer = ab;
      src.loop = true;
      const g = c.createGain();
      g.gain.value = volume * (getRecipeGain(id) ?? 1);
      src.connect(g);
      g.connect(sfxBus);
      src.start();
      return {
        setIntensity(v) {
          src.playbackRate.setTargetAtTime(1 + 0.3 * v, c.currentTime, 0.05);
        },
        stop() {
          try {
            g.gain.setTargetAtTime(0, c.currentTime, 0.04);
            src.stop(c.currentTime + 0.2);
          } catch {
            /* already stopped */
          }
        },
      };
    },
    speak,
    listProcedural: () => [...PROCEDURAL_IDS],
    hasFile: (id) => catalog[id] !== undefined,
    dispose() {
      disposed = true;
      removeGestureListeners();
      stopSpeech();
      fadeOutCurrent();
      howls.forEach((h) => h.unload());
      howls.clear();
      void ctx?.close().catch(() => undefined);
    },
  };
}
