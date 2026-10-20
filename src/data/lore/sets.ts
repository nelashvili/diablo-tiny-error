import type { LoreDef } from '../schema';
import act12 from '../sets/act12';
import classSets from '../sets/classSets';

/** One Holocron story per set (`lore.set.<id>.title|text`), opened when a first piece is found. */
export default [...act12, ...classSets].map((s): LoreDef => ({
  id: `set.${s.id}`,
  act: 1,
  title: `lore.set.${s.id}.title`,
  text: `lore.set.${s.id}.text`,
  unlock: { set: s.id },
})) satisfies LoreDef[];
