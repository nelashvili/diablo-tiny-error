import type { AffixDef } from '../schema';
import { SUFFIX_ROWS } from './_affixTable';

export default SUFFIX_ROWS.map((r) => r.def) satisfies AffixDef[];
