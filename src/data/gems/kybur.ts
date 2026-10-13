import type { Modifier } from '../../core/stats/types';
import type { GemDef } from '../schema';
import { GEM_COLORS, GEM_GRADES, gemId } from './_gemTable';

function build(): GemDef[] {
  const out: GemDef[] = [];
  for (const c of GEM_COLORS) {
    GEM_GRADES.forEach((grade, gi) => {
      const mods = (rows: (typeof c)['weapon']): Modifier[] =>
        rows.map(([stat, vals]) => ({ stat, op: 'flat' as const, value: vals[gi]! }));
      out.push({
        id: gemId(c.key, grade),
        name: `gem.${gemId(c.key, grade)}`,
        weapon: mods(c.weapon),
        armor: mods(c.armor),
        shield: mods(c.shield),
      });
    });
  }
  return out;
}

export default build() satisfies GemDef[];
