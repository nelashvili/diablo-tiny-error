import type { ItemBaseDef } from '../schema';
import { GEM_COLORS, GEM_GRADES, GEM_GRADE_COST, GEM_GRADE_REQ, gemId } from '../gems/_gemTable';

type Use = NonNullable<ItemBaseDef['use']>;

const consumable = (
  id: string,
  qlvl: number,
  cost: number,
  use: Use,
  extra: Partial<ItemBaseDef> = {},
): ItemBaseDef => ({
  id,
  name: `ib.${id}`,
  category: 'consumable',
  slots: [],
  size: { w: 1, h: 1 },
  qlvl,
  req: {},
  maxSockets: 0,
  cost,
  use,
  modelId: `item.${id}`,
  icon: `icon.${id}`,
  ...extra,
});

function build(): ItemBaseDef[] {
  const out: ItemBaseDef[] = [
    // life stims (D2 healing potion values)
    consumable('baktaStim', 1, 30, { kind: 'heal', amount: 45 }),
    consumable('baktaStimLight', 8, 60, { kind: 'heal', amount: 90 }),
    consumable('baktaStimMedium', 18, 120, { kind: 'heal', amount: 150 }),
    consumable('baktaStimGreater', 32, 250, { kind: 'heal', amount: 270 }),
    consumable('baktaStimSuper', 48, 450, { kind: 'heal', amount: 320 }),
    // mana cells
    consumable('energyCell', 1, 30, { kind: 'mana', amount: 30 }),
    consumable('energyCellLight', 8, 60, { kind: 'mana', amount: 60 }),
    consumable('energyCellMedium', 18, 120, { kind: 'mana', amount: 120 }),
    consumable('energyCellGreater', 32, 250, { kind: 'mana', amount: 225 }),
    consumable('energyCellSuper', 48, 450, { kind: 'mana', amount: 300 }),
    // rejuvenation (amount = percent of life and mana)
    consumable('rejuvStim', 20, 200, { kind: 'rejuv', amount: 35 }),
    consumable('rejuvStimFull', 40, 600, { kind: 'rejuv', amount: 100 }),
    // utility
    consumable('recallBeacon', 1, 100, { kind: 'recall' }, { stackable: 20 }),
    consumable('antidote', 4, 40, { kind: 'antidote', durationSec: 30 }),
    consumable('thaw', 4, 40, { kind: 'thaw', durationSec: 30 }),
    consumable('stamina', 4, 40, { kind: 'stamina', durationSec: 60 }),
  ];
  for (const c of GEM_COLORS) {
    GEM_GRADES.forEach((grade, gi) => {
      const id = gemId(c.key, grade);
      out.push({
        id,
        name: `gem.${id}`,
        category: 'gem',
        slots: [],
        size: { w: 1, h: 1 },
        qlvl: GEM_GRADE_REQ[gi]!,
        req: {},
        maxSockets: 0,
        cost: GEM_GRADE_COST[gi]!,
        stackable: 1,
        modelId: `item.${id}`,
        icon: `icon.${id}`,
      });
    });
  }
  return out;
}

export default build() satisfies ItemBaseDef[];
