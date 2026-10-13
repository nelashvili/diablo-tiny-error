import type { EquipSlot } from '../../core/types';
import type { ArmorClass, ItemBaseDef } from '../schema';
import { ARMOR_LINES, JEWELRY_LINES } from './_armorTable';
import { TIERS, TIER_MUL, camel, tierQlvl, tierReqLevel } from './_build';

const SLOT: Record<ArmorClass, EquipSlot[]> = {
  helm: ['head'],
  chest: ['chest'],
  gloves: ['gloves'],
  belt: ['belt'],
  boots: ['boots'],
  shield: ['offHand'],
  ring: ['ring1', 'ring2'],
  amulet: ['amulet'],
};

const DURABILITY: Partial<Record<ArmorClass, number>> = {
  helm: 14,
  chest: 24,
  gloves: 12,
  belt: 12,
  boots: 12,
  shield: 16,
};

function sockets(cls: ArmorClass, h: number): number {
  if (cls === 'helm') return 2;
  if (cls === 'chest') return 3;
  if (cls === 'shield') return h;
  return 0;
}

function build(): ItemBaseDef[] {
  const out: ItemBaseDef[] = [];
  for (const line of ARMOR_LINES) {
    for (let t = 0; t < 3; t++) {
      const id = camel(line.names[t]!);
      const next = line.names[t + 1];
      const qlvl = tierQlvl(t, line.qlvl);
      const min = Math.round(line.defMin * TIER_MUL.def[t]!);
      const max = Math.max(min + 1, Math.round(line.defMax * TIER_MUL.def[t]!));
      out.push({
        id,
        name: `ib.${id}`,
        category: 'armor',
        armorClass: line.cls,
        tier: TIERS[t]!,
        ...(next ? { upgradesTo: camel(next) } : {}),
        slots: SLOT[line.cls],
        size: line.size,
        qlvl,
        req: { level: tierReqLevel(t, qlvl), strength: Math.round(line.str * TIER_MUL.req[t]!) },
        defense: { min, max },
        ...(line.block ? { block: line.block } : {}),
        durability: Math.round((DURABILITY[line.cls] ?? 12) * TIER_MUL.dur[t]!),
        maxSockets: sockets(line.cls, line.size.h),
        ...(line.classOnly ? { classOnly: line.classOnly } : {}),
        cost: Math.round(line.cost * TIER_MUL.cost[t]!),
        modelId: `item.${id}`,
        icon: `icon.${id}`,
      });
    }
  }
  for (const j of JEWELRY_LINES) {
    out.push({
      id: j.id,
      name: `ib.${j.id}`,
      category: 'jewelry',
      armorClass: j.cls,
      slots: SLOT[j.cls],
      size: { w: 1, h: 1 },
      qlvl: j.qlvl,
      req: {},
      maxSockets: 0,
      cost: j.cost,
      modelId: `item.${j.id}`,
      icon: `icon.${j.id}`,
    });
  }
  return out;
}

export default build() satisfies ItemBaseDef[];
