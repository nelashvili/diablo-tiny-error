/** Corner minimap + the Tab big-map overlay (the HUD owns the 'map' panel). */
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../data/names';
import { useHud } from './context';
import { drawMap, readPalette, type MapPalette } from './mapDraw';
import { fitScale } from './minimapMath';
import { levelName } from './lookup';

/** Redraw at most this often (ms): the map doesn't need 60 fps. */
const REDRAW_MS = 66;

function useMapCanvas(canvasRef: { current: HTMLCanvasElement | null }, mode: 'mini' | 'big'): void {
  const { api } = useHud();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let pal: MapPalette | null = null;
    let lastDraw = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const draw = () => {
      timer = null;
      lastDraw = performance.now();
      const view = api.store.view.peek();
      if (!view?.level) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(rect.width));
      const H = Math.max(1, Math.round(rect.height));
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      pal ??= readPalette(canvas);
      const p = view.localPlayerId != null ? view.get(view.localPlayerId) : undefined;
      const map = view.level.map;
      if (mode === 'mini') {
        const scale = Math.max(8, W / 11);
        drawMap(ctx, view, pal, {
          width: W,
          height: H,
          dpr,
          center: p?.pos ?? { x: map.width / 2, y: map.height / 2 },
          scale,
          monsterRadius: 24,
          markerScale: Math.min(1.2, W / 180),
          guideTo: api.store.story?.peek().guideTo ?? null,
        });
      } else {
        const scale = fitScale(map.width, map.height, W * 0.9, H * 0.8);
        drawMap(ctx, view, pal, {
          width: W,
          height: H,
          dpr,
          center: { x: map.width / 2, y: map.height / 2 },
          scale,
          monsterRadius: 30,
          markerScale: 1.4,
          guideTo: api.store.story?.peek().guideTo ?? null,
        });
      }
    };

    const schedule = () => {
      if (timer) return;
      const wait = Math.max(0, REDRAW_MS - (performance.now() - lastDraw));
      timer = setTimeout(draw, wait);
    };
    const unsub = api.store.frame.subscribe(schedule);
    const unsubView = api.store.view.subscribe(schedule);
    window.addEventListener('resize', schedule);
    return () => {
      unsub();
      unsubView();
      window.removeEventListener('resize', schedule);
      if (timer) clearTimeout(timer);
    };
  }, [api, mode]);
}

export function Minimap(): JSX.Element | null {
  const { model } = useHud();
  const ref = useRef<HTMLCanvasElement>(null);
  useMapCanvas(ref, 'mini');
  const key = model.levelKey.value;
  const id = key.split('#')[0];
  return (
    <div class={`hud-minimap hud-panel${key ? '' : ' is-empty'}`}>
      <canvas ref={ref} class="hud-minimap__canvas" aria-hidden="true" />
      <div class="hud-minimap__name">{levelName(id)}</div>
    </div>
  );
}

export function BigMap(): JSX.Element {
  const { model, api } = useHud();
  const ref = useRef<HTMLCanvasElement>(null);
  useMapCanvas(ref, 'big');
  const id = model.levelKey.value.split('#')[0];
  return (
    <div class="hud-bigmap" role="dialog" aria-label={t('hud.map.title')}>
      <canvas ref={ref} class="hud-bigmap__canvas" aria-hidden="true" />
      <div class="hud-bigmap__head hud-panel">
        <span class="hud-bigmap__title">{levelName(id)}</span>
        <button
          type="button"
          class="hud-bigmap__close"
          aria-label={t('hud.map.close')}
          title={t('hud.map.close')}
          onClick={() => api.togglePanel('map')}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M6 6 L18 18 M18 6 L6 18"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div class="hud-bigmap__legend hud-panel">
        <span class="lg lg--you">{t('hud.map.legend.you')}</span>
        <span class="lg lg--wp">{t('hud.map.legend.waypoint')}</span>
        <span class="lg lg--exit">{t('hud.map.legend.exit')}</span>
        <span class="lg lg--enemy">{t('hud.map.legend.enemy')}</span>
      </div>
    </div>
  );
}
