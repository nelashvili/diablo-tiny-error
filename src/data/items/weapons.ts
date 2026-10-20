import type { ItemBaseDef } from '../schema';
import { TIERS, TIER_MUL, camel, tierQlvl, tierReqLevel } from './_build';
import { WEAPON_CLASSES, WEAPON_LINES } from './_weaponTable';

function build(): ItemBaseDef[] {
  const out: ItemBaseDef[] = [];
  for (const line of WEAPON_LINES) {
    const info = WEAPON_CLASSES[line.cls];
    for (let t = 0; t < 3; t++) {
      const name = line.names[t]!;
      const id = camel(name);
      const next = line.names[t + 1];
      const qlvl = tierQlvl(t, line.qlvl);
      const min = Math.max(1, Math.round(line.min * TIER_MUL.dmg[t]!));
      const max = Math.max(min + 1, Math.round(line.max * TIER_MUL.dmg[t]!));
      out.push({
        id,
        name: `ib.${id}`,
        category: 'weapon',
        weaponClass: line.cls,
        tier: TIERS[t]!,
        ...(next ? { upgradesTo: camel(next) } : {}),
        slots: info.dualWield ? ['mainHand', 'offHand'] : ['mainHand'],
        ...(info.twoHanded ? { twoHanded: true } : {}),
        size: info.size,
        qlvl,
        req: {
          level: tierReqLevel(t, qlvl),
          strength: Math.round(line.str * TIER_MUL.req[t]!),
          dexterity: Math.round(line.dex * TIER_MUL.req[t]!),
        },
        damage: { min, max },
        speed: Math.round(info.speed * line.spd * 100) / 100,
        range: info.range,
        durability: Math.round(info.durability * TIER_MUL.dur[t]!),
        maxSockets: info.maxSockets,
        ...(info.classOnly ? { classOnly: info.classOnly } : {}),
        cost: Math.round(line.cost * TIER_MUL.cost[t]!),
        modelId: `item.${id}`,
        icon: `icon.${id}`,
      });
    }
  }
  return out;
}

export default build() satisfies ItemBaseDef[];
