import { PREFIX_ROWS, SUFFIX_ROWS } from '../affixes/_affixTable';

const out: Record<string, string> = {};
for (const r of [...PREFIX_ROWS, ...SUFFIX_ROWS]) out[r.def.name] = r.text;

export default out;
