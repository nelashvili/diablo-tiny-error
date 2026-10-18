/**
 * Player inventory operations behind the item commands: equip/unequip, belt, cursor, drop,
 * consumables. All emit `inventoryChanged` (and toasts on failure) so the UI can react.
 */
import { DB } from '../../data/db';
import type { ItemBaseDef } from '../../data/schema';
import { autoSort, emptyGrid, placeItem, removeItem } from '../items/grid';
import type { ItemInstance, ItemUid } from '../items/types';
import { addHealOverTime, removeEffects } from '../sim/systems/effects';
import { healActor } from '../sim/systems/damage';
import { isBeltItemBase } from '../sim/systems/util';
import type { GroundItemEntity, PlayerEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import type { EquipSlot } from '../types';

/** Personal stash page size (matches the save format). */
export const STASH_GRID = { w: 10, h: 10 } as const;

const cursors = new WeakMap<PlayerEntity, ItemInstance>();

export const getCursorItem = (p: PlayerEntity): ItemInstance | undefined => cursors.get(p);

const toast = (world: SimWorld, textKey: string): void => world.emit({ type: 'toast', textKey });
const changed = (world: SimWorld, p: PlayerEntity): void =>
  world.emit({ type: 'inventoryChanged', playerId: p.id });

export type ItemLocation =
  | { where: 'inventory' }
  | { where: 'stash' }
  | { where: 'belt'; index: number }
  | { where: 'equipment'; slot: EquipSlot }
  | { where: 'cursor' };

export function locateItem(p: PlayerEntity, uid: ItemUid): { item: ItemInstance; loc: ItemLocation } | null {
  const inv = p.inventory.items.find((e) => e.item.uid === uid);
  if (inv) return { item: inv.item, loc: { where: 'inventory' } };
  const st = p.stash?.items.find((e) => e.item.uid === uid);
  if (st) return { item: st.item, loc: { where: 'stash' } };
  const bi = p.belt.slots.findIndex((s) => s?.uid === uid);
  if (bi >= 0) return { item: p.belt.slots[bi] as ItemInstance, loc: { where: 'belt', index: bi } };
  for (const [slot, item] of Object.entries(p.equipment) as [EquipSlot, ItemInstance | undefined][])
    if (item?.uid === uid) return { item, loc: { where: 'equipment', slot } };
  const c = cursors.get(p);
  if (c?.uid === uid) return { item: c, loc: { where: 'cursor' } };
  return null;
}

function detach(p: PlayerEntity, uid: ItemUid): ItemInstance | null {
  const f = locateItem(p, uid);
  if (!f) return null;
  switch (f.loc.where) {
    case 'inventory':
      return removeItem(p.inventory, uid);
    case 'stash':
      return removeItem(p.stash!, uid);
    case 'belt':
      p.belt.slots[f.loc.index] = null;
      return f.item;
    case 'equipment':
      delete p.equipment[f.loc.slot];
      p.statsDirty = true;
      return f.item;
    case 'cursor':
      cursors.delete(p);
      return f.item;
  }
}

/** Remove an item from wherever the player holds it (sold, consumed...). */
export function takeItem(p: PlayerEntity, uid: ItemUid): ItemInstance | null {
  const f = locateItem(p, uid);
  const item = detach(p, uid);
  if (item && f?.loc.where === 'belt') shiftBeltColumn(p, f.loc.index % 4);
  return item;
}

/** D2 belt: after the bottom-row item of a column is used, the column shifts down. */
function shiftBeltColumn(p: PlayerEntity, col: number): void {
  const slots = p.belt.slots;
  for (let r = 0; r < p.belt.rows; r++) {
    const here = r * 4 + col;
    if (slots[here] !== null) continue;
    slots[here] = slots[here + 4] ?? null;
    if (here + 4 < slots.length) slots[here + 4] = null;
  }
}

function beltFreeIndex(p: PlayerEntity): number {
  return p.belt.slots.findIndex((s) => s === null);
}

/** Put an item into the belt (stims) or inventory. Returns false if there is no room. */
export function giveItem(p: PlayerEntity, item: ItemInstance, preferBelt = true): boolean {
  if (preferBelt && isBeltItemBase(item.base)) {
    const i = beltFreeIndex(p);
    if (i >= 0) {
      p.belt.slots[i] = item;
      return true;
    }
  }
  return placeItem(p.inventory, item);
}

function requirementsMet(p: PlayerEntity, base: ItemBaseDef): boolean {
  const r = base.req;
  return (
    p.level >= (r.level ?? 0) &&
    p.stats.strength >= (r.strength ?? 0) &&
    p.stats.dexterity >= (r.dexterity ?? 0)
  );
}

export function equipItem(world: SimWorld, p: PlayerEntity, uid: ItemUid, slot: EquipSlot): boolean {
  const f = locateItem(p, uid);
  if (!f || f.loc.where === 'equipment') return false;
  const base = DB.items.get(f.item.base);
  if (!base || !base.slots.includes(slot)) return (toast(world, 'toast.cannotEquip'), false);
  if (!requirementsMet(p, base)) return (toast(world, 'toast.requirementsNotMet'), false);
  const main = p.equipment.mainHand ? DB.items.get(p.equipment.mainHand.base) : undefined;
  if (slot === 'offHand' && main?.twoHanded) return (toast(world, 'toast.twoHanded'), false);

  const item = detach(p, uid);
  if (!item) return false;
  const displaced: ItemInstance[] = [];
  const old = p.equipment[slot];
  if (old) displaced.push(old);
  if (base.twoHanded && slot === 'mainHand' && p.equipment.offHand) displaced.push(p.equipment.offHand);

  // Make room: displaced items go to the inventory.
  const placed: ItemInstance[] = [];
  for (const d of displaced) {
    if (placeItem(p.inventory, d)) placed.push(d);
    else {
      for (const q of placed) removeItem(p.inventory, q.uid);
      // restore the picked item where it came from (inventory/cursor/belt)
      if (f.loc.where === 'cursor') cursors.set(p, item);
      else if (f.loc.where === 'belt') p.belt.slots[f.loc.index] = item;
      else placeItem(p.inventory, item);
      toast(world, 'toast.inventoryFull');
      return false;
    }
  }
  if (old) delete p.equipment[slot];
  if (base.twoHanded && slot === 'mainHand') delete p.equipment.offHand;
  p.equipment[slot] = item;
  p.statsDirty = true;
  changed(world, p);
  return true;
}

export function unequipItem(world: SimWorld, p: PlayerEntity, slot: EquipSlot): boolean {
  const item = p.equipment[slot];
  if (!item) return false;
  if (!placeItem(p.inventory, item)) return (toast(world, 'toast.inventoryFull'), false);
  delete p.equipment[slot];
  p.statsDirty = true;
  changed(world, p);
  return true;
}

export function swapWeapons(world: SimWorld, p: PlayerEntity): boolean {
  if (!p.swap) return false;
  const cur = { mainHand: p.equipment.mainHand, offHand: p.equipment.offHand };
  delete p.equipment.mainHand;
  delete p.equipment.offHand;
  if (p.swap.mainHand) p.equipment.mainHand = p.swap.mainHand;
  if (p.swap.offHand) p.equipment.offHand = p.swap.offHand;
  p.swap = {};
  if (cur.mainHand) p.swap.mainHand = cur.mainHand;
  if (cur.offHand) p.swap.offHand = cur.offHand;
  p.statsDirty = true;
  changed(world, p);
  return true;
}

export function dropItem(world: SimWorld, p: PlayerEntity, uid: ItemUid): GroundItemEntity | null {
  const item = detach(p, uid);
  if (!item) return null;
  const e = spawnGroundItem(world, item, {
    x: p.pos.x + Math.cos(p.facing) * 0.8,
    y: p.pos.y + Math.sin(p.facing) * 0.8,
  });
  changed(world, p);
  return e;
}

export function spawnGroundItem(
  world: SimWorld,
  item: ItemInstance,
  pos: { x: number; y: number },
  creditz?: number,
): GroundItemEntity {
  const e: GroundItemEntity = {
    id: world.allocId(),
    kind: 'groundItem',
    pos: { x: pos.x, y: pos.y },
    facing: 0,
    radius: 0.3,
    alive: true,
    item,
    droppedAtTick: world.tick,
    ...(creditz !== undefined ? { creditz } : {}),
  };
  world.add(e);
  world.emit({ type: 'itemDropped', id: e.id, quality: item.quality, pos: { x: pos.x, y: pos.y } });
  return e;
}

/** Pick a ground item up into belt/inventory (creditz go to the purse). */
export function pickupGroundItem(world: SimWorld, p: PlayerEntity, g: GroundItemEntity): boolean {
  if (!g.alive) return false;
  if (g.creditz !== undefined) {
    p.creditz += g.creditz;
    g.alive = false;
    world.emit({ type: 'itemPickedUp', playerId: p.id, baseId: 'creditz', creditz: g.creditz });
    world.emit({ type: 'creditzChanged', playerId: p.id, creditz: p.creditz });
    return true;
  }
  if (!giveItem(p, g.item)) return (toast(world, 'toast.inventoryFull'), false);
  g.alive = false;
  world.emit({
    type: 'itemPickedUp',
    playerId: p.id,
    baseId: g.item.base,
    uid: g.item.uid,
    quality: g.item.quality,
  });
  changed(world, p);
  return true;
}

function consume(world: SimWorld, p: PlayerEntity, item: ItemInstance): void {
  if (item.quantity && item.quantity > 1) item.quantity -= 1;
  else {
    const f = locateItem(p, item.uid);
    detach(p, item.uid);
    if (f?.loc.where === 'belt') shiftBeltColumn(p, f.loc.index % 4);
  }
  changed(world, p);
}

/** Hook for recall scrolls etc.; set by the world module. */
export const itemUseHooks: { recall?: (world: SimWorld, p: PlayerEntity) => void } = {};

export function useItem(world: SimWorld, p: PlayerEntity, uid: ItemUid): boolean {
  const f = locateItem(p, uid);
  if (!f) return false;
  const base = DB.items.get(f.item.base);
  const use = base?.use;
  if (!base || !use || base.category !== 'consumable') return false;
  const dur = use.durationSec ?? 0;
  const amt = use.amount ?? 0;
  switch (use.kind) {
    case 'heal':
      if (dur > 0) addHealOverTime(p, 'life', amt, dur);
      else healActor(world, p, amt);
      break;
    case 'mana':
      if (dur > 0) addHealOverTime(p, 'mana', amt, dur);
      else p.mana = Math.min(p.stats.manaMax, p.mana + amt);
      break;
    case 'rejuv': {
      const life = (p.stats.lifeMax * amt) / 100;
      const mana = (p.stats.manaMax * amt) / 100;
      if (dur > 0) {
        addHealOverTime(p, 'life', life, dur);
        addHealOverTime(p, 'mana', mana, dur);
      } else {
        healActor(world, p, life);
        p.mana = Math.min(p.stats.manaMax, p.mana + mana);
      }
      break;
    }
    case 'stamina':
      p.stamina = Math.min(p.stats.staminaMax, p.stamina + amt);
      break;
    case 'antidote':
      removeEffects(p, ['toxin']);
      break;
    case 'thaw':
      removeEffects(p, ['chill', 'freeze']);
      break;
    case 'recall':
      if (!itemUseHooks.recall) return (toast(world, 'toast.notAvailable'), false);
      itemUseHooks.recall(world, p);
      break;
    case 'identify':
      break;
  }
  consume(world, p, f.item);
  return true;
}

export function useBeltSlot(world: SimWorld, p: PlayerEntity, index: number): boolean {
  // `index` is the belt column 0-3; its bottom-row (row 0) item is consumed.
  const it = p.belt.slots[index];
  return it ? useItem(world, p, it.uid) : false;
}

export type MoveContainer = 'inventory' | 'stash' | 'belt' | 'ground' | 'cursor';

/** Move an item between inventory / stash / belt / cursor / ground. False if unsupported or no room. */
export function moveItem(
  world: SimWorld,
  p: PlayerEntity,
  uid: ItemUid,
  to: MoveContainer,
  x?: number,
  y?: number,
): boolean {
  const f = locateItem(p, uid);
  if (!f) return false;
  if (to === 'ground') return dropItem(world, p, uid) !== null;
  if (to === 'cursor') {
    if (cursors.has(p) && f.loc.where !== 'cursor') return false;
    const it = detach(p, uid);
    if (!it) return false;
    cursors.set(p, it);
    changed(world, p);
    return true;
  }
  const item = detach(p, uid);
  if (!item) return false;
  let ok = false;
  if (to === 'belt') {
    const i = x !== undefined && p.belt.slots[x] === null ? x : beltFreeIndex(p);
    if (i >= 0 && isBeltItemBase(item.base)) {
      p.belt.slots[i] = item;
      ok = true;
    }
  } else if (to === 'stash') {
    p.stash ??= emptyGrid(STASH_GRID.w, STASH_GRID.h);
    ok = placeItem(p.stash, item, x, y);
  } else ok = placeItem(p.inventory, item, x, y);
  if (!ok) {
    // restore
    if (f.loc.where === 'cursor') cursors.set(p, item);
    else if (f.loc.where === 'belt') p.belt.slots[f.loc.index] = item;
    else if (f.loc.where === 'equipment') p.equipment[f.loc.slot] = item;
    else if (f.loc.where === 'stash') placeItem(p.stash!, item);
    else placeItem(p.inventory, item);
    toast(world, 'toast.inventoryFull');
    return false;
  }
  changed(world, p);
  return true;
}

export function sortInventory(
  world: SimWorld,
  p: PlayerEntity,
  container: 'inventory' | 'stash' = 'inventory',
): void {
  if (container === 'stash') {
    if (p.stash) autoSort(p.stash);
  } else autoSort(p.inventory);
  changed(world, p);
}
