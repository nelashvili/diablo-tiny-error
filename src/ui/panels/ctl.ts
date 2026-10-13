/**
 * Panel interaction controller: held item (D2 cursor pick-up or drag), drop resolution,
 * tooltips (hover on mouse, long-press/tap on touch) and item quick actions.
 * One instance per <Panels>.
 */
import { signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { t } from '../../data/names';
import type { ContainerRef } from '../../core/sim/commands';
import type { PlayerEntity } from '../../core/sim/entities';
import type { GridContainer, ItemInstance } from '../../core/items/types';
import type { DefId, EquipSlot } from '../../core/types';
import type { PanelId, UiApi } from '../types';
import type { TipAction } from '../tooltips';
import type { Rect } from '../tooltips/position';
import { cellFromPoint, computeDrop, overlapping, type DropTarget, type Size } from './gridLogic';
import type { PanelEnv } from './services';

export type Holder = { kind: 'grid'; container: ContainerRef } | { kind: 'equip'; slot: EquipSlot };

export interface Held {
  item: ItemInstance;
  from: Holder;
  size: Size;
  /** true = follows a held-down pointer (drag); false = D2 click-to-carry. */
  dragging: boolean;
}

export type HoverTarget =
  | { kind: 'grid'; container: ContainerRef; drop: DropTarget | null; allowed: boolean }
  | { kind: 'equip'; slot: EquipSlot; ok: boolean }
  | { kind: 'outside' }
  | null;

export type TipContent =
  { kind: 'item'; item: ItemInstance; where: Holder } | { kind: 'skill'; skillId: DefId; touch: boolean };

export interface TipState {
  content: TipContent;
  anchor: Rect;
  pinned: boolean;
}

interface Press {
  x: number;
  y: number;
  pointerId: number;
  type: string;
  item: ItemInstance;
  where: Holder;
  el: HTMLElement;
  timer: number;
  longFired: boolean;
}

const DRAG_PX = { mouse: 6, touch: 10 };
const LONG_PRESS_MS = 450;

export const RING_SLOTS: EquipSlot[] = ['ring1', 'ring2'];

export class PanelCtl {
  readonly held = signal<Held | null>(null);
  readonly pointer = signal<{ x: number; y: number }>({ x: -999, y: -999 });
  readonly hover = signal<HoverTarget>(null);
  readonly tip = signal<TipState | null>(null);

  api!: UiApi;
  env!: PanelEnv;
  player: PlayerEntity | null = null;
  open: PanelId[] = [];
  /** Grid containers currently on screen, keyed by ContainerRef. */
  readonly grids = new Map<string, GridContainer>();
  /** Vendor npc id when the shop is open. */
  vendorId: number | null = null;

  private press: Press | null = null;
  private lastPointerType = 'mouse';

  bind(api: UiApi, env: PanelEnv, player: PlayerEntity | null, open: PanelId[]) {
    this.api = api;
    this.env = env;
    this.player = player;
    this.open = open;
  }

  sizeOf = (item: ItemInstance): Size => this.env.services.itemSize(item);

  private sizeByUid(c: GridContainer) {
    return (uid: string): Size => {
      const e = c.items.find((i) => i.item.uid === uid);
      return e ? this.sizeOf(e.item) : { w: 1, h: 1 };
    };
  }

  // ------------------------------------------------------------ slots & validity

  slotsFor(item: ItemInstance): EquipSlot[] {
    const base = this.env.services.itemBase(item.base);
    const slots = base?.slots ?? [];
    if (slots.some((s) => s === 'ring1' || s === 'ring2')) return RING_SLOTS;
    return slots;
  }

  canEquip(item: ItemInstance, slot: EquipSlot): boolean {
    return this.slotsFor(item).includes(slot);
  }

  /** Best slot to auto-equip into (empty ring slot first). */
  bestSlot(item: ItemInstance): EquipSlot | null {
    const slots = this.slotsFor(item);
    if (!slots.length) return null;
    const eq = this.player?.equipment ?? {};
    return slots.find((s) => !eq[s]) ?? slots[0]!;
  }

  isPanelOpen(id: PanelId) {
    return this.open.includes(id);
  }

  // ------------------------------------------------------------ tooltip

  showTip(content: TipContent, el: Element, pinned: boolean) {
    const r = el.getBoundingClientRect();
    this.tip.value = { content, anchor: { x: r.left, y: r.top, w: r.width, h: r.height }, pinned };
  }

  hideTip() {
    if (this.tip.value) this.tip.value = null;
  }

  // ------------------------------------------------------------ pointer handlers for items

  itemHandlers(item: ItemInstance, where: Holder) {
    return {
      onPointerEnter: (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && !this.held.value && !this.tip.value?.pinned)
          this.showTip({ kind: 'item', item, where }, e.currentTarget as Element, false);
      },
      onPointerLeave: (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && !this.tip.value?.pinned) this.hideTip();
      },
      onPointerDown: (e: PointerEvent) => this.onItemDown(e, item, where),
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        if (this.held.value) return;
        this.quickAction(item, where, e.ctrlKey);
      },
    };
  }

  private onItemDown(e: PointerEvent, item: ItemInstance, where: Holder) {
    this.lastPointerType = e.pointerType;
    if (this.held.value) return; // handled by the global click-to-place listener
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.ctrlKey) {
      e.preventDefault();
      this.quickAction(item, where, true);
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const press: Press = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      type: e.pointerType,
      item,
      where,
      el,
      longFired: false,
      timer: 0,
    };
    if (e.pointerType !== 'mouse') {
      press.timer = window.setTimeout(() => {
        press.longFired = true;
        this.showTip({ kind: 'item', item, where }, el, true);
      }, LONG_PRESS_MS);
    }
    this.press = press;
  }

  /** Global listeners; returns a cleanup. */
  attach(): () => void {
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const down = (e: PointerEvent) => this.onGlobalDown(e);
    const cancel = () => this.cancelPress();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('pointerdown', down, { capture: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointerdown', down, { capture: true });
    };
  }

  private cancelPress() {
    if (this.press) window.clearTimeout(this.press.timer);
    this.press = null;
    if (this.held.value?.dragging) this.cancelHeld();
  }

  private onMove(e: PointerEvent) {
    const p = this.press;
    if (p && p.pointerId === e.pointerId && !this.held.value) {
      const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (d > (p.type === 'mouse' ? DRAG_PX.mouse : DRAG_PX.touch) && !p.longFired) {
        window.clearTimeout(p.timer);
        this.pickUp(p.item, p.where, true);
      }
    }
    if (this.held.value) {
      this.pointer.value = { x: e.clientX, y: e.clientY };
      this.hover.value = this.resolveTarget(e.clientX, e.clientY);
    }
  }

  private onUp(e: PointerEvent) {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    window.clearTimeout(p.timer);
    this.press = null;
    const held = this.held.value;
    if (held?.dragging) {
      const target = this.resolveTarget(e.clientX, e.clientY);
      if (!this.dropOn(target, e.pointerType)) this.cancelHeld();
      return;
    }
    if (p.longFired) return;
    if (p.type === 'mouse') {
      this.pickUp(p.item, p.where, false);
      this.pointer.value = { x: e.clientX, y: e.clientY };
      this.hover.value = this.resolveTarget(e.clientX, e.clientY);
    } else {
      // Tap on touch: show the item card with action buttons.
      this.showTip({ kind: 'item', item: p.item, where: p.where }, p.el, true);
    }
  }

  private onGlobalDown(e: PointerEvent) {
    this.lastPointerType = e.pointerType;
    const target = e.target as Element | null;
    if (this.tip.value?.pinned && !target?.closest?.('[data-tooltip]')) {
      // Tapping elsewhere closes a pinned tooltip; tapping the same item re-opens it on up.
      this.hideTip();
    }
    const held = this.held.value;
    if (!held || held.dragging) return;
    if (e.button !== 0) {
      if (e.button === 2) this.cancelHeld();
      return;
    }
    const tgt = this.resolveTarget(e.clientX, e.clientY);
    if (tgt?.kind === 'grid' || tgt?.kind === 'equip' || tgt?.kind === 'outside') {
      e.stopPropagation();
      e.preventDefault();
      this.dropOn(tgt, e.pointerType);
    }
  }

  pickUp(item: ItemInstance, from: Holder, dragging: boolean) {
    this.hideTip();
    this.held.value = { item, from, size: this.sizeOf(item), dragging };
  }

  cancelHeld() {
    this.held.value = null;
    this.hover.value = null;
  }

  // ------------------------------------------------------------ target resolution

  resolveTarget(x: number, y: number): HoverTarget {
    const held = this.held.value;
    if (!held) return null;
    const el = document.elementFromPoint(x, y);
    const zone = el?.closest?.('[data-drop]') as HTMLElement | null;
    if (!zone) {
      if (el?.closest?.('[data-panel]')) return null;
      return { kind: 'outside' };
    }
    if (zone.dataset.drop === 'equip') {
      const slot = zone.dataset.slot as EquipSlot;
      return { kind: 'equip', slot, ok: this.canEquip(held.item, slot) };
    }
    const container = zone.dataset.container as ContainerRef;
    const c = this.grids.get(container);
    if (!c) return null;
    const r = zone.getBoundingClientRect();
    const cell = r.width / c.w;
    const hit = cellFromPoint(x, y, { left: r.left, top: r.top, cell, cols: c.w, rows: c.h });
    if (!hit) return { kind: 'grid', container, drop: null, allowed: false };
    const same = held.from.kind === 'grid' && held.from.container === container;
    const drop = computeDrop(
      c,
      hit.fx,
      hit.fy,
      held.size,
      this.sizeByUid(c),
      same ? held.item.uid : undefined,
    );
    let allowed = drop?.kind === 'place';
    // Selling: any spot on the vendor grid is fine.
    if (container === 'vendor' && !(held.from.kind === 'grid' && held.from.container === 'vendor'))
      allowed = true;
    if (held.from.kind === 'grid' && held.from.container === 'vendor' && container === 'vendor')
      allowed = false;
    return { kind: 'grid', container, drop, allowed };
  }

  /** Execute a drop. Returns false when nothing happened (caller may cancel). */
  dropOn(target: HoverTarget, pointerType: string): boolean {
    const held = this.held.value;
    if (!held || !target) return false;
    const { item, from } = held;
    const d = this.api.dispatch.bind(this.api);
    if (target.kind === 'outside') {
      if (pointerType === 'mouse') {
        d({ type: 'dropItem', uid: item.uid });
        this.cancelHeld();
        return true;
      }
      this.cancelHeld();
      return true;
    }
    if (target.kind === 'equip') {
      if (!target.ok) return false;
      if (!(from.kind === 'equip' && from.slot === target.slot))
        d({ type: 'equip', uid: item.uid, slot: target.slot });
      this.cancelHeld();
      return true;
    }
    if (!target.allowed || !target.drop) return false;
    const to = target.container;
    if (from.kind === 'equip') {
      d({ type: 'unequip', slot: from.slot });
    } else if (from.container === 'vendor' && to !== 'vendor') {
      if (this.vendorId !== null) d({ type: 'buyItem', vendorId: this.vendorId, uid: item.uid });
    } else if (to === 'vendor') {
      if (this.vendorId !== null) d({ type: 'sellItem', vendorId: this.vendorId, uid: item.uid });
    } else {
      const { x, y } = target.drop;
      d({ type: 'moveItem', uid: item.uid, from: from.container, to, x, y });
    }
    this.cancelHeld();
    return true;
  }

  // ------------------------------------------------------------ quick actions

  private freeSpot(container: ContainerRef, item: ItemInstance) {
    const c = this.grids.get(container);
    if (!c) return null;
    const s = this.sizeOf(item);
    const sz = this.sizeByUid(c);
    for (let y = 0; y + s.h <= c.h; y++)
      for (let x = 0; x + s.w <= c.w; x++) if (overlapping(c, x, y, s, sz).length === 0) return { x, y };
    return null;
  }

  private moveTo(item: ItemInstance, from: ContainerRef, to: ContainerRef) {
    const spot = this.freeSpot(to, item);
    this.api.dispatch({ type: 'moveItem', uid: item.uid, from, to, ...(spot ?? {}) });
  }

  /** Available actions for an item in a given place (touch item card, right-click). */
  actionsFor(item: ItemInstance, where: Holder): TipAction[] {
    const out: TipAction[] = [];
    const d = this.api.dispatch.bind(this.api);
    const done = (f: () => void) => () => {
      f();
      this.hideTip();
    };
    const base = this.env.services.itemBase(item.base);
    const vendor = this.vendorId !== null && this.isPanelOpen('vendor');
    const creditz = this.player?.creditz ?? 0;
    if (where.kind === 'equip') {
      out.push({
        label: t('ui.act.unequip'),
        tone: 'primary',
        run: done(() => d({ type: 'unequip', slot: where.slot })),
      });
      return out;
    }
    const c = where.container;
    if (c === 'vendor') {
      const price = this.env.services.price(item, 'buy');
      out.push({
        label: t('ui.act.buy', { price }),
        tone: 'primary',
        disabled: price > creditz,
        run: done(() => d({ type: 'buyItem', vendorId: this.vendorId!, uid: item.uid })),
      });
      return out;
    }
    if (base?.use && c === 'inventory')
      out.push({
        label: t('ui.act.use'),
        tone: 'primary',
        run: done(() => d({ type: 'useItem', uid: item.uid })),
      });
    const slot = this.bestSlot(item);
    if (slot)
      out.push({
        label: t('ui.act.equip'),
        tone: 'primary',
        run: done(() => d({ type: 'equip', uid: item.uid, slot })),
      });
    if (vendor && c === 'inventory') {
      const price = this.env.services.price(item, 'sell');
      out.push({
        label: t('ui.act.sell', { price }),
        run: done(() => d({ type: 'sellItem', vendorId: this.vendorId!, uid: item.uid })),
      });
    }
    if (c === 'inventory' && this.isPanelOpen('stash') && this.grids.has('stash'))
      out.push({ label: t('ui.act.toStash'), run: done(() => this.moveTo(item, 'inventory', 'stash')) });
    if (c === 'inventory' && this.isPanelOpen('cube') && this.grids.has('cube'))
      out.push({ label: t('ui.act.toCube'), run: done(() => this.moveTo(item, 'inventory', 'cube')) });
    if (c === 'stash' || c === 'cube')
      out.push({ label: t('ui.act.toBag'), run: done(() => this.moveTo(item, c, 'inventory')) });
    if (c === 'inventory')
      out.push({
        label: t('ui.act.drop'),
        tone: 'danger',
        run: done(() => d({ type: 'dropItem', uid: item.uid })),
      });
    return out;
  }

  /** Right-click (equip/use/unequip) or Ctrl+click (sell / move to the other open container). */
  quickAction(item: ItemInstance, where: Holder, transfer: boolean) {
    const d = this.api.dispatch.bind(this.api);
    if (where.kind === 'equip') return d({ type: 'unequip', slot: where.slot });
    const c = where.container;
    const vendor = this.vendorId !== null && this.isPanelOpen('vendor');
    if (c === 'vendor') {
      if (this.vendorId !== null) d({ type: 'buyItem', vendorId: this.vendorId, uid: item.uid });
      return;
    }
    if (transfer || c !== 'inventory') {
      if (c === 'inventory' && vendor)
        return d({ type: 'sellItem', vendorId: this.vendorId!, uid: item.uid });
      if (c === 'inventory' && this.grids.has('stash') && this.isPanelOpen('stash'))
        return this.moveTo(item, 'inventory', 'stash');
      if (c === 'inventory' && this.grids.has('cube') && this.isPanelOpen('cube'))
        return this.moveTo(item, 'inventory', 'cube');
      if (c !== 'inventory') return this.moveTo(item, c, 'inventory');
    }
    const base = this.env.services.itemBase(item.base);
    if (base?.use) return d({ type: 'useItem', uid: item.uid });
    const slot = this.bestSlot(item);
    if (slot) d({ type: 'equip', uid: item.uid, slot });
  }

  get touchLike() {
    return this.lastPointerType !== 'mouse';
  }
}

export const CtlContext = createContext<PanelCtl>(null as unknown as PanelCtl);
export const useCtl = () => useContext(CtlContext);
