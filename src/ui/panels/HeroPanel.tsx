import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../data/names';
import { DB } from '../../data/db';
import type { SetDef } from '../../data/schema';
import type { PlayerEntity } from '../../core/sim/entities';
import type { Equipment } from '../../core/items/types';
import { createItem } from '../../core/items/create';
import { Rng } from '../../core/rng';
import { PanelFrame, Tabs } from './common';
import { useCtl, type PanelCtl } from './ctl';
import { freesOffHand } from '../../core/items/helpers';
import type { ItemInstance } from '../../core/items/types';
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
  const [showSets, setShowSets] = useState(false);
  /** A set tried on in the preview (its id), or null for what is equipped. */
  const [tryOn, setTryOn] = useState<string | null>(null);
  const tried = useMemo(
    () => (tryOn ? tryOnEquipment(player.equipment, tryOn) : null),
    [tryOn, player.equipment],
  );
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
  // Hovering an item in the bag (or stash, vendor...) tries it on.
  const ctl = useCtl();
  const hovered = hoveredGear(ctl);
  const hoverEq = useMemo(
    () => (hovered ? withItem(tried ?? player.equipment, hovered, ctl) : null),
    [hovered, tried, player.equipment, ctl],
  );
  useEffect(() => preview?.show(player.modelId, hoverEq ?? tried ?? player.equipment));
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
        {hovered && (
          <p class="dte-hero-trying">
            {t('ui.hero.tryingOn', { name: services.describeItem(hovered).name })}
          </p>
        )}
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
        <button
          class={`dte-btn ${showSets ? 'active' : ''}`}
          aria-pressed={showSets}
          onClick={() => setShowSets((s) => !s)}
        >
          {t('ui.hero.sets')}
        </button>
      </div>
      {showSets && (
        <SetList
          player={player}
          found={services.setPiecesFound?.() ?? new Set()}
          tryOn={tryOn}
          onTry={(id) => setTryOn((cur) => (cur === id ? null : id))}
        />
      )}
    </PanelFrame>
  );
}

/** The hero's equipment with every piece of `setId` put on in its slot (the preview's "try on"). */
function tryOnEquipment(eq: Equipment, setId: string): Equipment {
  const set = DB.sets.get(setId);
  const out: Equipment = { ...eq };
  set?.items.forEach((piece, i) => {
    const slot = DB.items.get(piece.base)?.slots[0];
    if (slot) out[slot] = createItem(piece.base, { setItemId: piece.id, ilvl: 99 }, new Rng(i + 1));
  });
  return out;
}

/** Sets tailored for the hero first (by level), then the ones any hero can wear. */
function setsFor(classId: string): { own: SetDef[]; any: SetDef[] } {
  const minLevel = (s: SetDef) => Math.min(...s.items.map((i) => i.reqLevel));
  const all = [...DB.sets.values()].sort((a, b) => minLevel(a) - minLevel(b));
  return { own: all.filter((s) => s.forClass === classId), any: all.filter((s) => !s.forClass) };
}

function SetList({
  player,
  found,
  tryOn,
  onTry,
}: {
  player: PlayerEntity;
  found: ReadonlySet<string>;
  tryOn: string | null;
  onTry: (setId: string) => void;
}) {
  const { own, any } = useMemo(() => setsFor(player.classId), [player.classId]);
  const worn = new Set(Object.values(player.equipment).map((it) => it?.setItemId));
  const row = (s: SetDef) => {
    const n = s.items.filter((i) => found.has(i.id)).length;
    const glow = s.look ? `#${s.look.glow.toString(16).padStart(6, '0')}` : undefined;
    return (
      <li key={s.id} class="dte-hero-set">
        <div class="dte-hero-set-head">
          <span
            class="dte-hero-set-dot"
            style={glow ? { background: glow, boxShadow: `0 0 6px ${glow}` } : undefined}
          />
          <span class="dte-hero-set-name">{t(s.name)}</span>
          <span class="dte-dim">{t('ui.hero.setFound', { n, m: s.items.length })}</span>
          <button class={`dte-btn ${tryOn === s.id ? 'active' : ''}`} onClick={() => onTry(s.id)}>
            {t(tryOn === s.id ? 'ui.hero.tryOff' : 'ui.hero.tryOn')}
          </button>
        </div>
        <ul class="dte-hero-set-pieces">
          {s.items.map((i) => (
            <li key={i.id} class={worn.has(i.id) ? 'worn' : found.has(i.id) ? 'found' : 'missing'}>
              {found.has(i.id) || worn.has(i.id) ? t(i.name) : t('ui.hero.pieceMissing')}
              {worn.has(i.id) && <span class="dte-dim"> ({t('ui.hero.pieceWorn')})</span>}
            </li>
          ))}
        </ul>
      </li>
    );
  };
  return (
    <div class="dte-hero-sets">
      <p class="dte-dim">{t('ui.hero.setsHint')}</p>
      <ul>{own.map(row)}</ul>
      {any.length > 0 && <h4>{t('ui.hero.setsOther')}</h4>}
      <ul>{any.map(row)}</ul>
    </div>
  );
}

/** The carried item under the pointer, if the hero could wear it. */
function hoveredGear(ctl: PanelCtl): ItemInstance | null {
  const c = ctl.tip.value?.content;
  if (c?.kind !== 'item' || c.where.kind !== 'grid') return null;
  return ctl.bestSlot(c.item) ? c.item : null;
}

/** Equipment with `item` put on where it would go (a two-hander also frees the off hand). */
function withItem(eq: Equipment, item: ItemInstance, ctl: PanelCtl): Equipment {
  const slot = ctl.compareSlots(item)[0] ?? ctl.bestSlot(item);
  if (!slot) return eq;
  const out: Equipment = { ...eq, [slot]: item };
  if (slot === 'mainHand' && freesOffHand(item.base, eq.offHand?.base)) delete out.offHand;
  return out;
}
