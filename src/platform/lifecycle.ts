/** Browser lifecycle helpers. Every installer returns a disposer. */

type Dispose = () => void;

interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export function isStandalone(): boolean {
  const w = globalThis as {
    matchMedia?: (q: string) => MediaQueryList;
    navigator?: { standalone?: boolean };
  };
  return !!(
    w.matchMedia?.('(display-mode: standalone)').matches ||
    w.matchMedia?.('(display-mode: fullscreen)').matches ||
    w.navigator?.standalone
  );
}

export function isFullscreen(doc: Document = document): boolean {
  const d = doc as FsDocument;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export type FullscreenResult = 'entered' | 'exited' | 'unsupported';

/**
 * Toggle fullscreen. iPhone Safari has no element fullscreen API: returns 'unsupported' and the UI
 * should suggest "Add to Home Screen" (the PWA runs fullscreen).
 */
export async function toggleFullscreen(
  el: HTMLElement = document.documentElement,
  doc: Document = document,
): Promise<FullscreenResult> {
  const d = doc as FsDocument;
  const e = el as FsElement;
  try {
    if (isFullscreen(doc)) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
      return 'exited';
    }
    if (e.requestFullscreen) {
      await e.requestFullscreen({ navigationUI: 'hide' });
      return 'entered';
    }
    if (e.webkitRequestFullscreen) {
      await e.webkitRequestFullscreen();
      return 'entered';
    }
  } catch {
    /* denied or unsupported */
  }
  return 'unsupported';
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keep the screen on while playing. Re-acquires after the tab becomes visible again. */
export function keepScreenAwake(): Dispose {
  const nav = (
    globalThis as { navigator?: { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } } }
  ).navigator;
  if (!nav?.wakeLock) return () => {};
  let lock: WakeLockSentinelLike | null = null;
  let disposed = false;
  const acquire = async (): Promise<void> => {
    try {
      lock = await nav.wakeLock!.request('screen');
      if (disposed) void lock.release().catch(() => {});
    } catch {
      lock = null;
    }
  };
  const onVis = (): void => {
    if (document.visibilityState === 'visible' && !disposed) void acquire();
  };
  document.addEventListener('visibilitychange', onVis);
  void acquire();
  return () => {
    disposed = true;
    document.removeEventListener('visibilitychange', onVis);
    void lock?.release().catch(() => {});
  };
}

/** Call `onHidden` when the tab is hidden / app backgrounded, `onVisible` when it returns. */
export function onVisibilityChange(onHidden: () => void, onVisible?: () => void): Dispose {
  const h = (): void => {
    if (document.visibilityState === 'hidden') onHidden();
    else onVisible?.();
  };
  document.addEventListener('visibilitychange', h);
  return () => document.removeEventListener('visibilitychange', h);
}

/** Flush saves when the page is going away. iOS often only fires `pagehide`. */
export function onPageExit(save: () => void): Dispose {
  let done = false;
  const h = (): void => {
    if (done) return;
    done = true;
    try {
      save();
    } finally {
      // allow later saves (e.g. page restored from bfcache)
      setTimeout(() => (done = false), 0);
    }
  };
  window.addEventListener('pagehide', h);
  window.addEventListener('beforeunload', h);
  return () => {
    window.removeEventListener('pagehide', h);
    window.removeEventListener('beforeunload', h);
  };
}

interface AudioCtxLike {
  state: string;
  resume(): Promise<void>;
}

/**
 * iOS keeps AudioContexts suspended until a user gesture. Resumes on the first touchend/click/keydown,
 * then removes itself. `getCtx` is lazy so you can pass howler's `Howler.ctx`.
 */
export function installAudioUnlock(
  getCtx: () => AudioCtxLike | null | undefined,
  onUnlocked?: () => void,
): Dispose {
  const events = ['touchend', 'pointerup', 'click', 'keydown'] as const;
  const remove = (): void => events.forEach((e) => window.removeEventListener(e, handler, true));
  const handler = (): void => {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'running') {
      remove();
      onUnlocked?.();
      return;
    }
    ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') {
          remove();
          onUnlocked?.();
        }
      })
      .catch(() => {});
  };
  events.forEach((e) => window.addEventListener(e, handler, true));
  return remove;
}

/** True when a phone-sized screen is held in portrait: show a "rotate your device" overlay. */
export function shouldAskToRotate(width: number, height: number): boolean {
  return height > width && width < 700;
}

export function watchOrientation(cb: (askToRotate: boolean) => void): Dispose {
  const h = (): void => cb(shouldAskToRotate(window.innerWidth, window.innerHeight));
  window.addEventListener('resize', h);
  window.addEventListener('orientationchange', h);
  h();
  return () => {
    window.removeEventListener('resize', h);
    window.removeEventListener('orientationchange', h);
  };
}

/** Best-effort landscape lock (works in installed PWAs on Android/Chromebook; ignored elsewhere). */
export async function lockLandscape(): Promise<boolean> {
  const o = (screen as unknown as { orientation?: { lock?: (t: string) => Promise<void> } }).orientation;
  try {
    await o?.lock?.('landscape');
    return !!o?.lock;
  } catch {
    return false;
  }
}

const CONTROLS = 'button, a, input, select, textarea, label, [role="button"], [role="radio"], [role="tab"]';

function isControl(t: EventTarget | null): boolean {
  const el = t as { closest?: (sel: string) => unknown } | null;
  return !!el?.closest?.(CONTROLS);
}

/** Stop pinch-zoom and double-tap zoom (iOS ignores user-scalable=no). */
export function preventZoomGestures(target: Document = document): Dispose {
  const prevent = (e: Event): void => e.preventDefault();
  let lastTouchEnd = 0;
  const onTouchEnd = (e: TouchEvent): void => {
    const now = e.timeStamp;
    // Never on controls: cancelling a touchend also cancels its click, which ate quick second
    // taps on buttons (Start after picking a class, dialogue options, menus).
    if (now - lastTouchEnd < 350 && !isControl(e.target)) e.preventDefault();
    lastTouchEnd = now;
  };
  const onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length > 1) e.preventDefault();
  };
  const opts = { passive: false } as const;
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) target.addEventListener(g, prevent, opts);
  target.addEventListener('touchend', onTouchEnd, opts);
  target.addEventListener('touchmove', onTouchMove, opts);
  target.addEventListener('contextmenu', prevent);
  return () => {
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) target.removeEventListener(g, prevent);
    target.removeEventListener('touchend', onTouchEnd);
    target.removeEventListener('touchmove', onTouchMove);
    target.removeEventListener('contextmenu', prevent);
  };
}

export interface SessionTimerOptions {
  minutes: number;
  onBreak: () => void;
  /** Injectable for tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
}

/**
 * "Time for a break!" reminder. 0 minutes = off. Call `snooze(min)` to be reminded again later,
 * `stop()` on exit. Fires once per start()/snooze().
 */
export class SessionTimer {
  private id: unknown = null;
  private readonly set: (fn: () => void, ms: number) => unknown;
  private readonly clear: (id: unknown) => void;

  constructor(private readonly o: SessionTimerOptions) {
    this.set = o.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clear = o.clearTimeoutFn ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  start(minutes = this.o.minutes): void {
    this.stop();
    if (!(minutes > 0)) return;
    this.id = this.set(() => {
      this.id = null;
      this.o.onBreak();
    }, minutes * 60_000);
  }

  snooze(minutes = 10): void {
    this.start(minutes);
  }

  stop(): void {
    if (this.id !== null) this.clear(this.id);
    this.id = null;
  }

  get running(): boolean {
    return this.id !== null;
  }
}
