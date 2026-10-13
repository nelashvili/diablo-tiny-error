/** Device capability detection + adaptive quality. All detectors accept mock environments for tests. */

export type Quality = 'low' | 'medium' | 'high';

export interface NavLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgentData?: { mobile?: boolean; platform?: string };
}

export interface DeviceInfo {
  touch: boolean;
  ios: boolean;
  android: boolean;
  chromebook: boolean;
  /** Phone-sized or UA-mobile device (not tablet). Best effort. */
  phone: boolean;
  /** GB of RAM reported by Chrome (rounded buckets), undefined on Safari/Firefox. */
  deviceMemory: number | undefined;
  cores: number;
  lowMemory: boolean;
  webgl2: boolean;
}

const nav = (): NavLike => (globalThis as { navigator?: NavLike }).navigator ?? {};

export function isIOS(n: NavLike = nav()): boolean {
  const ua = n.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as a Mac with touch.
  return n.platform === 'MacIntel' && (n.maxTouchPoints ?? 0) > 1;
}

export function isAndroid(n: NavLike = nav()): boolean {
  return /Android/i.test(n.userAgent ?? '');
}

export function isChromebook(n: NavLike = nav()): boolean {
  return /\bCrOS\b/.test(n.userAgent ?? '');
}

export function hasTouch(n: NavLike = nav(), win?: { ontouchstart?: unknown }): boolean {
  if ((n.maxTouchPoints ?? 0) > 0) return true;
  return !!win && 'ontouchstart' in win;
}

export function hasWebGL2(createCanvas?: () => { getContext(id: string): unknown }): boolean {
  try {
    const make =
      createCanvas ??
      (() =>
        (globalThis as { document?: Document }).document!.createElement('canvas') as unknown as {
          getContext(id: string): unknown;
        });
    const ctx = make().getContext('webgl2');
    return !!ctx;
  } catch {
    return false;
  }
}

export function detectDevice(
  n: NavLike = nav(),
  opts: {
    win?: { ontouchstart?: unknown; innerWidth?: number; innerHeight?: number };
    webgl2?: boolean;
  } = {},
): DeviceInfo {
  const ios = isIOS(n);
  const android = isAndroid(n);
  const chromebook = isChromebook(n);
  const touch = hasTouch(n, opts.win);
  const mem = n.deviceMemory;
  const cores = n.hardwareConcurrency ?? 4;
  const shortSide = opts.win ? Math.min(opts.win.innerWidth ?? 9999, opts.win.innerHeight ?? 9999) : 9999;
  const phone =
    (ios && /iPhone|iPod/.test(n.userAgent ?? '')) ||
    (android && /Mobile/i.test(n.userAgent ?? '')) ||
    shortSide < 500;
  return {
    touch,
    ios,
    android,
    chromebook,
    phone,
    deviceMemory: mem,
    cores,
    lowMemory: (mem !== undefined && mem <= 2) || cores <= 2,
    webgl2: opts.webgl2 ?? hasWebGL2(),
  };
}

/** Starting quality guess; the QualityGovernor refines it from real frame times. */
export function autoQuality(d: DeviceInfo): Quality {
  if (d.lowMemory || d.phone) return 'low';
  if (d.chromebook)
    return d.deviceMemory !== undefined && d.deviceMemory >= 8 && d.cores >= 6 ? 'medium' : 'low';
  // iOS Safari doesn't expose memory; iPads are generally fine at medium.
  if (d.ios) return 'medium';
  if (d.deviceMemory !== undefined && d.deviceMemory < 8) return 'medium';
  if (d.cores < 6) return 'medium';
  return 'high';
}

const ORDER: Quality[] = ['low', 'medium', 'high'];

export interface GovernorOptions {
  /** Frames per evaluation window. */
  windowFrames?: number;
  /** Average frame time (ms) above which a window counts as slow. */
  slowMs?: number;
  /** Average frame time (ms) below which a window counts as fast. */
  fastMs?: number;
  /** Consecutive slow windows before suggesting a downgrade. */
  downWindows?: number;
  /** Consecutive fast windows before suggesting an upgrade. */
  upWindows?: number;
  /** Highest level the governor may suggest (e.g. the user's cap). */
  max?: Quality;
}

export type QualitySuggestion = { action: 'downgrade' | 'upgrade'; from: Quality; to: Quality };

/**
 * Feed frame times; it suggests a level change with hysteresis: downgrade after a couple of slow
 * windows, upgrade only after many consecutive fast ones, and never upgrade to a level that already
 * failed (it is banned after a downgrade from it).
 */
export class QualityGovernor {
  level: Quality;
  private readonly o: Required<GovernorOptions>;
  private sum = 0;
  private n = 0;
  private slow = 0;
  private fast = 0;
  private banned: Quality | null = null;

  constructor(start: Quality, opts: GovernorOptions = {}) {
    this.level = start;
    this.o = {
      windowFrames: opts.windowFrames ?? 90,
      slowMs: opts.slowMs ?? 1000 / 40,
      fastMs: opts.fastMs ?? 1000 / 55,
      downWindows: opts.downWindows ?? 2,
      upWindows: opts.upWindows ?? 6,
      max: opts.max ?? 'high',
    };
  }

  /** Call once per rendered frame with the frame delta in ms. Returns a suggestion when a change is due. */
  push(frameMs: number): QualitySuggestion | null {
    // Ignore hitches from tab switches / loading, and garbage values.
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 500) return null;
    this.sum += frameMs;
    if (++this.n < this.o.windowFrames) return null;
    const avg = this.sum / this.n;
    this.sum = 0;
    this.n = 0;
    if (avg > this.o.slowMs) {
      this.slow++;
      this.fast = 0;
    } else if (avg < this.o.fastMs) {
      this.fast++;
      this.slow = 0;
    } else {
      this.slow = 0;
      this.fast = 0;
    }
    const i = ORDER.indexOf(this.level);
    if (this.slow >= this.o.downWindows && i > 0) {
      const from = this.level;
      this.level = ORDER[i - 1]!;
      this.banned = from;
      this.slow = 0;
      return { action: 'downgrade', from, to: this.level };
    }
    const next = ORDER[i + 1];
    if (
      this.fast >= this.o.upWindows &&
      next &&
      next !== this.banned &&
      ORDER.indexOf(next) <= ORDER.indexOf(this.o.max)
    ) {
      const from = this.level;
      this.level = next;
      this.fast = 0;
      return { action: 'upgrade', from, to: next };
    }
    return null;
  }

  /** Force a level (e.g. the player picked one in settings). Resets counters. */
  reset(level: Quality): void {
    this.level = level;
    this.sum = 0;
    this.n = 0;
    this.slow = 0;
    this.fast = 0;
    this.banned = null;
  }
}
