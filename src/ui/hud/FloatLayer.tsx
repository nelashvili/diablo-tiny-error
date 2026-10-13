/**
 * Floating combat text layer. One absolutely-positioned element per pool slot, created once.
 * A requestAnimationFrame loop runs only while floats are alive and writes transforms
 * directly (no Preact re-render per frame). Anchors re-project every frame so numbers stick
 * to the world while the camera moves.
 */
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useHud } from './context';
import { floatFrame } from './floatPool';

export function FloatLayer(): JSX.Element {
  const { fx, api } = useHud();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const pool = fx.pool;
    const els: HTMLDivElement[] = pool.slots.map(() => {
      const d = document.createElement('div');
      d.className = 'hud-float';
      d.style.display = 'none';
      host.appendChild(d);
      return d;
    });
    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const alive = pool.step(dt);
      for (let i = 0; i < pool.slots.length; i++) {
        const s = pool.slots[i]!;
        const el = els[i]!;
        if (!s.active) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        if (s.dirty) {
          s.dirty = false;
          el.textContent = s.text;
          el.className = `hud-float hud-float--${s.kind}`;
          el.style.color = s.color;
        }
        const anchor = api.store.worldToScreen(s.world, s.height);
        if (!anchor) {
          el.style.display = 'none';
          continue;
        }
        const f = floatFrame(s.age / s.life, s.kind, s.dx);
        el.style.display = '';
        el.style.opacity = f.opacity.toFixed(3);
        el.style.transform = `translate3d(${(anchor.x + f.x).toFixed(1)}px, ${(anchor.y + f.y).toFixed(1)}px, 0) translate(-50%, -50%) scale(${f.scale.toFixed(3)})`;
      }
      if (alive) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        last = 0;
      }
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    fx.onSpawn = wake;
    wake();
    return () => {
      fx.onSpawn = null;
      if (raf) cancelAnimationFrame(raf);
      for (const el of els) el.remove();
    };
  }, [fx, api]);

  return <div class="hud-floats" ref={root} aria-hidden="true" />;
}
