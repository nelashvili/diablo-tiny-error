/** Service worker registration. Skipped in dev so HMR is never served stale. */

export interface PwaOptions {
  /** Called when a new version has been installed and will activate on next launch. */
  onUpdate?: () => void;
  /** Override for tests. */
  dev?: boolean;
}

export async function registerServiceWorker(
  opts: PwaOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  const dev = opts.dev ?? import.meta.env?.DEV ?? false;
  if (dev) return null;
  const sw = (globalThis as { navigator?: Navigator }).navigator?.serviceWorker;
  if (!sw) return null;
  try {
    const reg = await sw.register('/sw.js', { scope: '/' });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && sw.controller) opts.onUpdate?.();
      });
    });
    return reg;
  } catch {
    return null;
  }
}
