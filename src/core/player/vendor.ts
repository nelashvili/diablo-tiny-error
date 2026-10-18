/**
 * Town vendors (D2 style): stock rolled from the NPC's roles and the hero's level, buy / sell /
 * repair. Healers never run out of stims; everything sold to a vendor can be bought back.
 */
import { DB } from '../../data/db';
import type { ItemBaseDef, NpcDef } from '../../data/schema';
import { createItem } from '../items/create';
import { emptyGrid, placeItem, removeItem } from '../items/grid';
import { itemValue } from '../items/helpers';
import { isGear } from '../items/lookup';
import type { GridContainer, ItemInstance, ItemUid } from '../items/types';
import type { ItemQuality } from '../types';
import type { Rng } from '../rng';
import type { NpcEntity, PlayerEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import { giveItem, locateItem, takeItem } from './inventory';

export const VENDOR_GRID = { w: 10, h: 10 } as const;
/** How far (tiles) the hero may stand from the vendor to trade. */
export const TRADE_RANGE = 8;

const toast = (world: SimWorld, textKey: string): void => world.emit({ type: 'toast', textKey });

export function npcDefOf(npc: NpcEntity): NpcDef | undefined {
  return DB.npcs.get(npc.defId);
}

export function isVendor(npc: NpcEntity): boolean {
  return npcDefOf(npc)?.roles.includes('vendor') === true;
}

const isHealer = (npc: NpcEntity): boolean => npcDefOf(npc)?.roles.includes('healer') === true;
const isSmith = (npc: NpcEntity): boolean => npcDefOf(npc)?.roles.includes('smith') === true;

/** Consumables a healer always carries (D2: Akara's potions and scrolls). */
function consumables(): ItemBaseDef[] {
  return [...DB.items.values()].filter((b) => b.category === 'consumable' && b.use);
}

/** Gear bases a vendor may roll for a hero of `level`. */
function gearBases(level: number): ItemBaseDef[] {
  const cap = Math.max(6, level + 4);
  return [...DB.items.values()].filter((b) => isGear(b) && b.qlvl <= cap);
}

function rollQuality(rng: Rng, magicChance: number): ItemQuality {
  return rng.chance(magicChance) ? 'magic' : 'normal';
}

/**
 * Restock the vendor for a hero of `level` (D2 refreshes stock on every town visit).
 * Healers: every consumable. Smiths: weapons and armor. Others: a mix of gear and stims.
 */
export function restockVendor(npc: NpcEntity, level: number, rng: Rng): GridContainer {
  const grid = emptyGrid(VENDOR_GRID.w, VENDOR_GRID.h);
  const ilvl = Math.max(1, level);
  const put = (baseId: string, quality: ItemQuality = 'normal') => {
    const it = createItem(baseId, { ilvl, quality }, rng);
    placeItem(grid, it);
  };
  if (isHealer(npc)) {
    for (const b of consumables()) put(b.id);
    for (const b of consumables()) if (b.use?.kind === 'heal' || b.use?.kind === 'mana') put(b.id);
  }
  const gear = gearBases(level);
  if (gear.length) {
    const n = isSmith(npc) ? 16 : isHealer(npc) ? 4 : 10;
    const magic = isSmith(npc) ? 0.2 : 0.35;
    // Bigger items first so the grid packs well.
    const picks = Array.from({ length: n }, () => rng.pick(gear));
    picks.sort((a, b) => b.size.w * b.size.h - a.size.w * a.size.h);
    for (const b of picks) put(b.id, rollQuality(rng, magic));
  }
  if (!isHealer(npc) && !isSmith(npc)) for (const b of consumables().slice(0, 4)) put(b.id);
  npc.stock = grid;
  return grid;
}

function inRange(p: PlayerEntity, npc: NpcEntity): boolean {
  return Math.hypot(p.pos.x - npc.pos.x, p.pos.y - npc.pos.y) <= TRADE_RANGE;
}

function vendorFor(world: SimWorld, p: PlayerEntity, vendorId: number): NpcEntity | null {
  const npc = world.get(vendorId);
  if (!npc || npc.kind !== 'npc' || !isVendor(npc) || !npc.stock) return null;
  return inRange(p, npc) ? npc : null;
}

const creditz = (world: SimWorld, p: PlayerEntity): void =>
  world.emit({ type: 'creditzChanged', playerId: p.id, creditz: p.creditz });

export function buyItem(world: SimWorld, p: PlayerEntity, vendorId: number, uid: ItemUid, rng: Rng): boolean {
  const npc = vendorFor(world, p, vendorId);
  const entry = npc?.stock?.items.find((e) => e.item.uid === uid);
  if (!npc || !entry) return false;
  const price = itemValue(entry.item, 'buy');
  if (p.creditz < price) return (toast(world, 'toast.notEnoughCreditz'), false);
  const item = entry.item;
  removeItem(npc.stock!, uid);
  if (!giveItem(p, item)) {
    placeItem(npc.stock!, item, entry.x, entry.y);
    return (toast(world, 'toast.inventoryFull'), false);
  }
  p.creditz -= price;
  // Healers never run out of consumables: put a fresh one where it was.
  if (isHealer(npc) && DB.items.get(item.base)?.category === 'consumable')
    placeItem(npc.stock!, createItem(item.base, { ilvl: item.ilvl }, rng), entry.x, entry.y);
  creditz(world, p);
  world.emit({ type: 'inventoryChanged', playerId: p.id });
  return true;
}

export function sellItem(world: SimWorld, p: PlayerEntity, vendorId: number, uid: ItemUid): boolean {
  const npc = vendorFor(world, p, vendorId);
  if (!npc) return false;
  const f = locateItem(p, uid);
  if (!f || f.loc.where === 'equipment') return false;
  const item = takeItem(p, uid);
  if (!item) return false;
  p.creditz += itemValue(item, 'sell');
  placeItem(npc.stock!, item); // buy-back while it fits; otherwise it is gone
  creditz(world, p);
  world.emit({ type: 'inventoryChanged', playerId: p.id });
  return true;
}

function damaged(p: PlayerEntity): ItemInstance[] {
  const all = [...Object.values(p.equipment), ...p.inventory.items.map((e) => e.item)];
  return all.filter((i): i is ItemInstance => !!i?.durability && i.durability.cur < i.durability.max);
}

/** Cost to repair every damaged item the hero carries (D2: proportional to missing durability). */
export function repairCost(p: PlayerEntity): number {
  let cost = 0;
  for (const i of damaged(p)) {
    const missing = 1 - i.durability!.cur / Math.max(1, i.durability!.max);
    cost += Math.ceil(itemValue(i, 'buy') * 0.5 * missing);
  }
  return cost;
}

export function repairAll(world: SimWorld, p: PlayerEntity, vendorId: number): boolean {
  const npc = vendorFor(world, p, vendorId);
  if (!npc || !isSmith(npc)) return false;
  const cost = repairCost(p);
  if (cost <= 0) return false;
  if (p.creditz < cost) return (toast(world, 'toast.notEnoughCreditz'), false);
  p.creditz -= cost;
  for (const i of damaged(p)) i.durability!.cur = i.durability!.max;
  p.statsDirty = true;
  creditz(world, p);
  world.emit({ type: 'inventoryChanged', playerId: p.id });
  return true;
}
