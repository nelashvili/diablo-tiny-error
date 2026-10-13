import type { ItemInstance } from '../items/types';
import type { CharacterSave } from './types';

/** Walk any value and return the path of the first non-finite number, or null. */
export function findNonFinite(value: unknown, path = '$', depth = 0): string | null {
  if (depth > 64) return `${path} (too deep)`;
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = findNonFinite(value[i], `${path}[${i}]`, depth + 1);
      if (r) return r;
    }
  } else if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
    for (const [k, v] of Object.entries(value)) {
      const r = findNonFinite(v, `${path}.${k}`, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Every item (including socketed gems) of a character save. */
export function collectItems(c: CharacterSave): ItemInstance[] {
  const out: ItemInstance[] = [];
  const add = (it: ItemInstance | null | undefined): void => {
    if (!it) return;
    out.push(it);
    for (const s of it.socketed ?? []) add(s);
  };
  for (const it of Object.values(c.equipment ?? {})) add(it);
  for (const it of Object.values(c.swap ?? {})) add(it);
  for (const g of [c.inventory, c.cube, c.stash]) for (const e of g?.items ?? []) add(e.item);
  for (const it of c.belt?.slots ?? []) add(it);
  if (c.merc) for (const it of Object.values(c.merc.equipment ?? {})) add(it);
  return out;
}

/** Return a list of sanity problems (empty = fine). */
export function sanityCheckCharacter(c: CharacterSave): string[] {
  const problems: string[] = [];
  const bad = findNonFinite(c);
  if (bad) problems.push(`non-finite number at ${bad}`);
  const seen = new Set<string>();
  for (const it of collectItems(c)) {
    if (typeof it.uid !== 'string' || !it.uid) problems.push('item without uid');
    else if (seen.has(it.uid)) problems.push(`duplicate item uid ${it.uid}`);
    else seen.add(it.uid);
  }
  if (c.level < 1 || c.level > 99) problems.push(`level out of range: ${c.level}`);
  return problems;
}

export function sanityCheckAccount(a: unknown): string[] {
  const bad = findNonFinite(a);
  return bad ? [`non-finite number at ${bad}`] : [];
}
