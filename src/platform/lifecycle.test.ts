import { describe, expect, it, vi } from 'vitest';
import { SessionTimer, shouldAskToRotate } from './lifecycle';
import { registerServiceWorker } from './pwa';

describe('lifecycle', () => {
  it('asks to rotate only for portrait phones', () => {
    expect(shouldAskToRotate(390, 844)).toBe(true);
    expect(shouldAskToRotate(844, 390)).toBe(false);
    expect(shouldAskToRotate(820, 1180)).toBe(false); // portrait iPad is playable
  });

  it('session timer fires once and can snooze/stop', () => {
    vi.useFakeTimers();
    const onBreak = vi.fn();
    const t = new SessionTimer({ minutes: 45, onBreak });
    t.start();
    expect(t.running).toBe(true);
    vi.advanceTimersByTime(44 * 60_000);
    expect(onBreak).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(onBreak).toHaveBeenCalledTimes(1);
    expect(t.running).toBe(false);
    t.snooze(10);
    t.stop();
    vi.advanceTimersByTime(20 * 60_000);
    expect(onBreak).toHaveBeenCalledTimes(1);
    new SessionTimer({ minutes: 0, onBreak }).start();
    vi.advanceTimersByTime(10 * 3600_000);
    expect(onBreak).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('service worker registration is skipped in dev / without support', async () => {
    expect(await registerServiceWorker({ dev: true })).toBeNull();
    expect(await registerServiceWorker({ dev: false })).toBeNull(); // node: no navigator.serviceWorker
  });
});
