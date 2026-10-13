/**
 * <TouchControls>: tablet/phone controls overlay (PLAN §7).
 * - Left: floating virtual joystick (or tap-to-move, per settings.movement).
 * - Right: D2R-style skill wheel — big primary attack + 6 assignable skill slots (long-press to
 *   pick), drag a slot to aim, 2 stim buttons and a belt popover.
 * - Tap a monster / NPC / object in the world to interact; long-press a ground item for its label.
 *
 * Mount it inside the UI root ABOVE the canvas and BELOW HUD panels (it sets z-index from
 * `--tc-z`, default 1). Its world layer must cover the same rect as the picking target.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { EntityId, Vec2 } from '../../core/types';
import type { PlayerEntity } from '../../core/sim/entities';
import type { InputContext } from '../input/types';
import type { UiApi } from '../types';
import { DB } from '../../data/db';
import { t } from '../../data/names';
import { getLocalPlayer } from '../input/autoTarget';
import { TouchController, type ButtonId } from './controller';
import { computeWheelLayout, SLOT_COUNT, type WheelLayout } from './layout';
import { countStims, skillButtonState } from './skillState';
import './touch.css';

export interface TouchControlsProps {
  api: UiApi;
  ctx: InputContext;
  /** Optional override for soft auto-aim (nearest hostile within range, preferring dir). */
  findAutoTarget?: (range: number, dir: Vec2) => EntityId | null;
  /** Haptic pulses via navigator.vibrate (default true). */
  haptics?: boolean;
}

type PE = JSX.TargetedPointerEvent<HTMLElement>;

function skillName(id: string): string {
  const def = DB.skills.get(id);
  return t(def?.name ?? `skill.${id}`);
}

function elementColor(id: string | null): string | undefined {
  const el = id ? DB.skills.get(id)?.element : undefined;
  return el ? `var(--dmg-${el})` : undefined;
}

export function TouchControls({ api, ctx, findAutoTarget, haptics }: TouchControlsProps): JSX.Element {
  const ctrl = useMemo(() => new TouchController(api, ctx, { findAutoTarget, haptics }), [api, ctx]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  const layout = useMemo(() => computeWheelLayout(size.w, size.h), [size.w, size.h]);
  ctrl.setViewport(size.w, size.h, layout.stickRadius);

  // Resize tracking.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Frame loop + lifecycle safety (backgrounding releases held inputs; block iOS pinch gestures).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      ctrl.tick(Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onHide = () => {
      if (document.visibilityState === 'hidden') ctrl.reset();
    };
    const block = (e: Event) => e.preventDefault();
    const el = rootRef.current;
    document.addEventListener('visibilitychange', onHide);
    const onBlur = () => ctrl.reset();
    window.addEventListener('blur', onBlur);
    el?.addEventListener('gesturestart', block);
    el?.addEventListener('dblclick', block);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('blur', onBlur);
      el?.removeEventListener('gesturestart', block);
      el?.removeEventListener('dblclick', block);
      ctrl.reset();
    };
  }, [ctrl]);

  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: e.clientX, y: e.clientY };
  };
  const capture = (e: PE) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  };
  const onMove = (e: PE) => ctrl.pointerMove(e, local(e));
  const onUp = (e: PE) => ctrl.pointerUp(e);
  const onCancel = (e: PE) => ctrl.pointerUp(e, true);

  const onWorldDown = (e: PE) => {
    if (ctrl.worldDown(e, local(e))) capture(e);
  };

  const onButtonDown = (id: ButtonId) => (e: PE) => {
    capture(e);
    const r = e.currentTarget.getBoundingClientRect();
    ctrl.buttonDown(e, id, local({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }), local(e));
  };

  // Re-render with the sim frame (cooldowns, mana, belt counts).
  void api.store.frame.value;
  const view = api.store.view.value;
  const player = getLocalPlayer(view);
  const mode = ctrl.movementMode;
  const stick = ctrl.stick.value;
  const pressed = ctrl.pressed.value;
  const R = layout.stickRadius;

  return (
    <div class="tc-root" ref={rootRef} data-testid="touch-controls" aria-label={t('input.controls')}>
      <div
        class="tc-world"
        data-testid="tc-world"
        onPointerDown={onWorldDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      />

      {mode === 'joystick' &&
        (stick ? (
          <>
            <div
              class="tc-stick"
              data-testid="tc-stick"
              style={{
                width: R * 2,
                height: R * 2,
                transform: `translate(${stick.base.x - R}px, ${stick.base.y - R}px)`,
              }}
            />
            <div
              class="tc-knob"
              style={{
                width: R,
                height: R,
                transform: `translate(${stick.knob.x - R / 2}px, ${stick.knob.y - R / 2}px)`,
              }}
            />
          </>
        ) : (
          <div
            class="tc-stick tc-stick-ghost"
            style={{
              width: R * 2,
              height: R * 2,
              left: `calc(env(safe-area-inset-left, 0px) + ${Math.round(R * 0.6)}px)`,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.round(R * 0.6)}px)`,
              top: 'auto',
            }}
          >
            <span class="tc-ghost-label">{t('input.joystick')}</span>
          </div>
        ))}

      <AimOverlay ctrl={ctrl} />
      <ItemLabel ctrl={ctrl} />

      <Wheel
        layout={layout}
        player={player}
        ctx={ctx}
        ctrl={ctrl}
        pressed={pressed}
        onButtonDown={onButtonDown}
        onMove={onMove}
        onUp={onUp}
        onCancel={onCancel}
        capture={capture}
      />

      <Picker ctrl={ctrl} player={player} ctx={ctx} />
    </div>
  );
}

interface WheelProps {
  layout: WheelLayout;
  player: Readonly<PlayerEntity> | null;
  ctx: InputContext;
  ctrl: TouchController;
  pressed: ReadonlySet<string>;
  onButtonDown: (id: ButtonId) => (e: PE) => void;
  onMove: (e: PE) => void;
  onUp: (e: PE) => void;
  onCancel: (e: PE) => void;
  capture: (e: PE) => void;
}

function Wheel(props: WheelProps): JSX.Element {
  const { layout, player, ctx, ctrl, pressed } = props;
  const sel = ctx.getSelectedSkills();
  const place = (p: Vec2, s: number): JSX.CSSProperties => ({
    left: p.x - s / 2,
    top: p.y - s / 2,
    width: s,
    height: s,
    '--size': `${s}px`,
  });
  const baseOf = (it: { base: string }) => DB.items.get(it.base);
  const lifeN = countStims(player?.belt, 'life', baseOf);
  const manaN = countStims(player?.belt, 'mana', baseOf);
  const handlers = { onPointerMove: props.onMove, onPointerUp: props.onUp, onPointerCancel: props.onCancel };

  const skillBtn = (id: ButtonId, skill: string | null, pos: Vec2, size: number, extra: string) => {
    const name = skill ? skillName(skill) : t('input.emptySlot');
    const st = skill ? skillButtonState(player, skill, DB.skills.get(skill), name) : null;
    const cls = [
      'tc-btn',
      extra,
      pressed.has(String(id)) ? 'is-pressed' : '',
      !skill ? 'tc-empty' : '',
      st?.noMana ? 'tc-nomana' : '',
    ].join(' ');
    return (
      <div
        key={String(id)}
        class={cls}
        data-testid={id === 'primary' ? 'tc-primary' : `tc-slot-${id}`}
        data-skill={skill ?? ''}
        role="button"
        aria-label={name}
        style={{ ...place(pos, size), '--el': elementColor(skill) }}
        onPointerDown={props.onButtonDown(id)}
        {...handlers}
      >
        <span class="tc-glyph">{st ? st.glyph : '+'}</span>
        {st && st.cooldownFrac > 0 && <span class="tc-cd" style={{ '--cd': st.cooldownFrac.toFixed(3) }} />}
      </div>
    );
  };

  const stim = (kind: 'life' | 'mana', pos: Vec2, n: number) => (
    <div
      class={`tc-btn tc-stim ${kind} ${pressed.has(`stim-${kind}`) ? 'is-pressed' : ''} ${n ? '' : 'is-empty'}`}
      data-testid={`tc-stim-${kind}`}
      role="button"
      aria-label={t(kind === 'life' ? 'input.stimLife' : 'input.stimMana')}
      style={place(pos, layout.stimSize)}
      onPointerDown={(e) => {
        props.capture(e);
        ctrl.useStim(kind);
        ctrl.pressed.value = new Set([...ctrl.pressed.value, `stim-${kind}`]);
      }}
      onPointerUp={() => releasePressed(ctrl, `stim-${kind}`)}
      onPointerCancel={() => releasePressed(ctrl, `stim-${kind}`)}
    >
      <span class="tc-vial" />
      {n > 0 && <span class="tc-count">{n}</span>}
    </div>
  );

  return (
    <div
      class="tc-wheel"
      style={{
        right: `calc(env(safe-area-inset-right, 0px) + ${layout.margin.right}px)`,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${layout.margin.bottom}px)`,
      }}
    >
      {skillBtn('primary', sel.left || null, { x: 0, y: 0 }, layout.primarySize, 'tc-primary')}
      {layout.slots
        .slice(0, SLOT_COUNT)
        .map((p, i) => skillBtn(i, sel.hotkeys[i] ?? null, p, layout.skillSize, 'tc-skill'))}
      {stim('life', layout.stims.life, lifeN)}
      {stim('mana', layout.stims.mana, manaN)}
      <div
        class={`tc-btn tc-belt ${ctrl.beltOpen.value ? 'is-pressed' : ''}`}
        data-testid="tc-belt"
        role="button"
        aria-label={t('input.belt')}
        style={place(layout.belt, layout.beltSize)}
        onPointerDown={(e) => {
          props.capture(e);
          ctrl.toggleBelt();
        }}
      >
        <span class="tc-belt-icon">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      {ctrl.beltOpen.value && (
        <BeltPopover
          ctrl={ctrl}
          player={player}
          at={{ x: layout.belt.x, y: layout.belt.y - layout.beltSize / 2 - 8 }}
        />
      )}
    </div>
  );
}

function releasePressed(ctrl: TouchController, key: string): void {
  const s = new Set(ctrl.pressed.value);
  s.delete(key);
  ctrl.pressed.value = s;
}

function BeltPopover(props: { ctrl: TouchController; player: Readonly<PlayerEntity> | null; at: Vec2 }) {
  const belt = props.player?.belt;
  const cols = [0, 1, 2, 3];
  return (
    <div class="tc-belt-pop" data-testid="tc-belt-pop" style={{ left: props.at.x, top: props.at.y }}>
      {cols.map((c) => {
        const it = belt?.slots[c] ?? null;
        const base = it ? DB.items.get(it.base) : undefined;
        const kind = base?.use?.kind;
        const cls = kind === 'heal' || kind === 'mana' || kind === 'rejuv' ? kind : 'other';
        let stack = 0;
        if (belt) for (let i = c; i < belt.slots.length; i += belt.cols) if (belt.slots[i]) stack++;
        return (
          <div
            key={c}
            class={`tc-belt-slot ${cls}`}
            data-testid={`tc-belt-slot-${c}`}
            role="button"
            aria-label={
              it ? (base ? t(base.name) : t('input.unknownItem')) : t('input.beltSlot', { n: c + 1 })
            }
            onPointerDown={(e) => {
              e.preventDefault();
              props.ctrl.useBelt(c);
            }}
          >
            <span class="tc-key">{c + 1}</span>
            {it && <span class="tc-vial" />}
            {stack > 1 && <span class="tc-count">{stack}</span>}
          </div>
        );
      })}
    </div>
  );
}

function AimOverlay({ ctrl }: { ctrl: TouchController }) {
  const a = ctrl.aim.value;
  if (!a) return null;
  return (
    <svg class="tc-aim" data-testid="tc-aim">
      <ellipse cx={a.center.x} cy={a.center.y} rx={a.rx} ry={a.ry} />
      <line x1={a.center.x} y1={a.center.y} x2={a.reticle.x} y2={a.reticle.y} />
      <circle cx={a.reticle.x} cy={a.reticle.y} r={14} />
    </svg>
  );
}

function ItemLabel({ ctrl }: { ctrl: TouchController }) {
  const l = ctrl.label.value;
  if (!l) return null;
  return (
    <div
      class="tc-label"
      data-testid="tc-label"
      style={{
        transform: `translate(${l.x}px, ${l.y}px) translate(-50%, -100%)`,
        color: `var(--q-${l.quality})`,
      }}
    >
      {l.text}
    </div>
  );
}

function Picker(props: { ctrl: TouchController; player: Readonly<PlayerEntity> | null; ctx: InputContext }) {
  const p = props.ctrl.picker.value;
  if (!p) return null;
  const current = props.ctx.getSelectedSkills().hotkeys[p.slot] ?? null;
  const learned = props.player
    ? Object.entries(props.player.skills)
        .filter(([, pts]) => pts > 0)
        .map(([id]) => id)
        .filter((id) => DB.skills.get(id)?.kind !== 'passive')
    : [];
  return (
    <div
      class="tc-picker-veil"
      data-testid="tc-picker"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) props.ctrl.closePicker();
      }}
    >
      <div class="tc-picker">
        <h2>{t('input.pickSkill')}</h2>
        {learned.length === 0 ? (
          <div class="tc-picker-empty">{t('input.noSkills')}</div>
        ) : (
          <div class="tc-picker-grid">
            {learned.map((id) => {
              const name = skillName(id);
              return (
                <button
                  key={id}
                  type="button"
                  class={`tc-pick ${id === current ? 'is-current' : ''}`}
                  data-testid={`tc-pick-${id}`}
                  style={{ '--el': elementColor(id) }}
                  onClick={() => props.ctrl.assign(p.slot, id)}
                >
                  <span class="tc-pick-orb">
                    <span class="tc-glyph">{skillButtonState(null, id, undefined, name).glyph}</span>
                  </span>
                  {name}
                </button>
              );
            })}
          </div>
        )}
        <div class="tc-picker-actions">
          {current && (
            <button type="button" data-testid="tc-pick-clear" onClick={() => props.ctrl.assign(p.slot, null)}>
              {t('input.clearSlot')}
            </button>
          )}
          <button type="button" data-testid="tc-pick-cancel" onClick={() => props.ctrl.closePicker()}>
            {t('input.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
