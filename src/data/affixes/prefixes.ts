import type { AffixDef } from '../schema';
import { PREFIX_ROWS } from './_affixTable';

export default PREFIX_ROWS.map((r) => r.def) satisfies AffixDef[];
