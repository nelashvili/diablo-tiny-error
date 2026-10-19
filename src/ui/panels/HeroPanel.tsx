import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../data/names';
import type { PlayerEntity } from '../../core/sim/entities';
import { PanelFrame, Tabs } from './common';
import { usePanelEnv, type HeroPose } from './services';

const POSES: HeroPose[] = ['idle', 'walk', 'attack', 'cast'];
/** Radians turned per pixel dragged. */
const DRAG_RAD_PER_PX = 0.012;

/** The hero model wearing what is equipped right now, to see how items look on them. */
export function HeroPanel({ player, onClose }: { player: PlayerEntity; onClose?: () => void }) {
  const { services } = usePanelEnv();
  const preview = useMemo(() => services.heroPreview?.() ?? null, [services]);
  const stage = useRef<HTMLDivElement>(null);
  const [pose, setPose] = useState<HeroPose>('idle');
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ id: number; x: number } | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!preview || !el) return;
    el.appendChild(preview.canvas);
    const fit = () => preview.resize(el.clientWidth, el.clientHeight);
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    preview.setActive(true);
    return () => {
      ro?.disconnect();
      preview.setActive(false);
      preview.canvas.remove();
    };
  }, [preview]);

  // Re-dressed every render (the panels re-render each frame while open); a no-op when nothing changed.
  useEffect(() => preview?.show(player.modelId, player.equipment));
  useEffect(() => preview?.setPose(pose), [preview, pose]);
  useEffect(() => preview?.setAutoSpin(spin), [preview, spin]);

  return (
    <PanelFrame id="hero" title={t('ui.panel.hero')} onClose={onClose}>
      <div
        class="dte-hero-stage"
        ref={stage}
        title={t('ui.hero.drag')}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, x: e.clientX };
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          preview?.turn((e.clientX - d.x) * DRAG_RAD_PER_PX);
          d.x = e.clientX;
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {!preview && <p class="dte-dim dte-hero-none">{t('ui.hero.unavailable')}</p>}
      </div>
      <div class="dte-hero-bar">
        <Tabs
          class="hero-poses"
          value={pose}
          onChange={setPose}
          tabs={POSES.map((id) => ({ id, label: t(`ui.hero.pose.${id}`) }))}
        />
        <button
          class={`dte-btn ${spin ? 'active' : ''}`}
          aria-pressed={spin}
          onClick={() => setSpin((s) => !s)}
        >
          {t('ui.hero.spin')}
        </button>
      </div>
    </PanelFrame>
  );
}
