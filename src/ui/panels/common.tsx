/** Shared panel building blocks: frame chrome, tabs, item visuals, grids and equip slots. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../data/names';
import type { ContainerRef } from '../../core/sim/commands';
import type { GridContainer, ItemInstance } from '../../core/items/types';
import type { EquipSlot } from '../../core/types';
import { useCtl, type Holder } from './ctl';
import { Icon, itemGlyph, SLOT_GLYPH } from './icons';
import { usePanelEnv } from './services';

export function PanelFrame(props: {
  id: string;
  title: string;
  onClose?: () => void;
  wide?: boolean;
  class?: string;
  headerExtra?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class={`dte-panel p-${props.id} ${props.class ?? ''}`} data-panel={props.id}>
      <span class="dte-corner tl" />
      <span class="dte-corner tr" />
      <span class="dte-corner bl" />
      <span class="dte-corner br" />
      <header class="dte-panel-head">
        <h2>{props.title}</h2>
        {props.headerExtra}
        {props.onClose && (
          <button class="dte-close" aria-label={t('ui.close')} onClick={props.onClose}>
            <Icon name="close" size={22} />
          </button>
        )}
      </header>
      <div class="dte-panel-body">{props.children}</div>
    </section>
  );
}

export function Tabs<T extends string | number>(props: {
  tabs: { id: T; label: string; badge?: string | number; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  class?: string;
}) {
  return (
    <div class={`dte-tabs ${props.class ?? ''}`} role="tablist">
      {props.tabs.map((tb) => (
        <button
          key={tb.id}
          role="tab"
          aria-selected={tb.id === props.value}
          class={`dte-tab ${tb.id === props.value ? 'active' : ''}`}
          disabled={tb.disabled}
          onClick={() => props.onChange(tb.id)}
        >
          {tb.label}
          {tb.badge !== undefined && tb.badge !== 0 && <span class="dte-badge">{tb.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** The visual of an item (icon, quality frame, sockets, quantity), sized by its parent. */
export function ItemVisual({ item, compact }: { item: ItemInstance; compact?: boolean }) {
  const { services, colorblind } = useItemEnv();
  const base = services.itemBase(item.base);
  const glyph = itemGlyph(base, item.base);
  const broken = item.durability && item.durability.cur <= 0;
  const low = item.durability && item.durability.cur / Math.max(1, item.durability.max) < 0.2;
  return (
    <div
      class={`dte-item q-${item.quality} ${item.ethereal ? 'eth' : ''} ${broken ? 'broken' : low ? 'low' : ''}`}
    >
      <Icon name={glyph} size="70%" cls="dte-item-icon" />
      {item.sockets > 0 && !compact && (
        <div class="dte-sockets">
          {Array.from({ length: item.sockets }, (_, i) => (
            <span key={i} class={`dte-socket ${item.socketed[i] ? 'filled' : ''}`} />
          ))}
        </div>
      )}
      {(item.quantity ?? 0) > 1 && <span class="dte-qty">{item.quantity}</span>}
      {colorblind && ['magic', 'rare', 'set', 'unique', 'crafted'].includes(item.quality) && (
        <span class="dte-qmark">{t(`ui.quality.${item.quality}`).charAt(0)}</span>
      )}
    </div>
  );
}

function useItemEnv() {
  const env = usePanelEnv();
  const ctl = useCtl();
  const cb = ctl.api?.store.settings.value.colorblind ?? 'none';
  return { services: env.services, colorblind: cb !== 'none' };
}

/** D2 inventory-style grid for any container. Registers itself as a drop zone. */
export function ItemGrid(props: { container: ContainerRef; grid: GridContainer; class?: string }) {
  const ctl = useCtl();
  const { container, grid } = props;
  ctl.grids.set(container, grid);
  useEffect(() => () => void ctl.grids.delete(container), [container]);
  const held = ctl.held.value;
  const hover = ctl.hover.value;
  const hl = hover?.kind === 'grid' && hover.container === container ? hover : null;
  return (
    <div
      class={`dte-grid ${props.class ?? ''}`}
      data-drop="grid"
      data-container={container}
      style={{ '--cols': grid.w, '--rows': grid.h }}
    >
      {hl?.drop && (
        <div
          class={`dte-drop-hl ${hl.allowed ? 'ok' : 'bad'}`}
          style={{
            left: `calc(var(--cell) * ${hl.drop.x})`,
            top: `calc(var(--cell) * ${hl.drop.y})`,
            width: `calc(var(--cell) * ${hl.drop.w})`,
            height: `calc(var(--cell) * ${hl.drop.h})`,
          }}
        />
      )}
      {grid.items.map(({ item, x, y }) => {
        const s = ctl.sizeOf(item);
        const isHeld = held?.item.uid === item.uid;
        const where: Holder = { kind: 'grid', container };
        return (
          <div
            key={item.uid}
            class={`dte-grid-item ${isHeld ? 'held' : ''}`}
            style={{
              left: `calc(var(--cell) * ${x})`,
              top: `calc(var(--cell) * ${y})`,
              width: `calc(var(--cell) * ${s.w})`,
              height: `calc(var(--cell) * ${s.h})`,
            }}
            data-uid={item.uid}
            {...ctl.itemHandlers(item, where)}
          >
            <ItemVisual item={item} />
          </div>
        );
      })}
    </div>
  );
}

/** Equipment slot on the paper doll. */
export function EquipSlotView(props: {
  slot: EquipSlot;
  item?: ItemInstance;
  x: number;
  y: number;
  w: number;
  h: number;
  container?: 'equip' | 'merc';
}) {
  const ctl = useCtl();
  const held = ctl.held.value;
  const hover = ctl.hover.value;
  const isHover = hover?.kind === 'equip' && hover.slot === props.slot;
  const fits = held ? ctl.canEquip(held.item, props.slot) : false;
  const isHeld = !!props.item && held?.item.uid === props.item.uid;
  const where: Holder = { kind: 'equip', slot: props.slot };
  return (
    <div
      class={`dte-slot ${held ? (fits ? 'fits' : 'nofit') : ''} ${isHover ? 'hover' : ''} ${props.item ? 'filled' : ''}`}
      data-drop={props.container === 'merc' ? undefined : 'equip'}
      data-slot={props.slot}
      title={t(`ui.slot.${props.slot}`)}
      style={{
        left: `calc(var(--cell) * ${props.x})`,
        top: `calc(var(--cell) * ${props.y})`,
        width: `calc(var(--cell) * ${props.w})`,
        height: `calc(var(--cell) * ${props.h})`,
      }}
    >
      {props.item && !isHeld ? (
        <div class="dte-slot-item" {...ctl.itemHandlers(props.item, where)}>
          <ItemVisual item={props.item} />
        </div>
      ) : (
        <div class="dte-slot-empty">
          <Icon name={SLOT_GLYPH[props.slot]} size="55%" />
        </div>
      )}
    </div>
  );
}

/** The item that follows the pointer while carried. */
export function HeldGhost() {
  const ctl = useCtl();
  const held = ctl.held.value;
  const p = ctl.pointer.value;
  const ref = useRef<HTMLDivElement>(null);
  if (!held) return null;
  return (
    <div
      ref={ref}
      class="dte-ghost"
      style={{
        width: `calc(var(--cell) * ${held.size.w})`,
        height: `calc(var(--cell) * ${held.size.h})`,
        transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`,
      }}
    >
      <ItemVisual item={held.item} />
    </div>
  );
}

/** Long-press aware button: tap = onTap, hold (or shift-click) = onHold. */
export function HoldButton(props: {
  class?: string;
  label: string;
  onTap: () => void;
  onHold?: () => void;
  disabled?: boolean;
  children: ComponentChildren;
}) {
  const timer = useRef(0);
  const fired = useRef(false);
  return (
    <button
      class={props.class}
      aria-label={props.label}
      disabled={props.disabled}
      onPointerDown={(e) => {
        fired.current = false;
        if (!props.onHold) return;
        if (e.shiftKey) {
          fired.current = true;
          props.onHold();
          return;
        }
        timer.current = window.setTimeout(() => {
          fired.current = true;
          props.onHold?.();
        }, 500);
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!fired.current) props.onTap();
        fired.current = false;
      }}
    >
      {props.children}
    </button>
  );
}

export function Creditz({ amount }: { amount: number }) {
  return (
    <span class="dte-creditz" title={t('ui.inv.creditz')}>
      <Icon name="creditz" size={20} />
      <b>{amount.toLocaleString()}</b>
    </span>
  );
}
