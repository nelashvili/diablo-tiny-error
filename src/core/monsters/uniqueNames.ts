/**
 * Parody unique-monster name generator ("Gristle the Rusty", "Sir Clanks-a-Lot").
 * Names are registered into the shared name table under a deterministic key so `t(nameKey)` works.
 */
import type { Rng } from '../rng';
import { registerNames } from '../../data/names';

const FIRST = [
  'Gristle',
  'Boltz',
  'Clanky',
  'Snarg',
  'Murk',
  'Zorp',
  'Grizzle',
  'Sprocket',
  'Wobble',
  'Krunch',
  'Fizzle',
  'Skrap',
  'Brak',
  'Dentz',
  'Grumblin',
  'Rattlez',
  'Bolt-Brain',
  'Wrenchy',
];
const EPITHETS = [
  'the Rusty',
  'the Unplugged',
  'the Overcooked',
  'the Squeaky',
  'the Loose-Screwed',
  'the Dented',
  'the Mildly Annoyed',
  'the Misspelled',
  'the Slightly Damp',
  'the Grumpy',
];
const TITLES = ['Sir', 'Captain', 'Lord', 'Doctor', 'Admiral', 'Baron'];
const SUFFIXES = ['-a-Lot', 'zilla', '-o-Matic', 'ington'];

export function generateUniqueName(rng: Rng): { key: string; text: string } {
  const first = rng.pick(FIRST);
  let text: string;
  const style = rng.int(0, 2);
  if (style === 0) {
    text = `${first} ${rng.pick(EPITHETS)}`;
  } else if (style === 1) {
    text = `${rng.pick(TITLES)} ${first}${rng.pick(SUFFIXES)}`;
  } else {
    text = `${rng.pick(TITLES)} ${first} ${rng.pick(EPITHETS)}`;
  }
  const key = `uname.${text.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  registerNames({ [key]: text });
  return { key, text };
}
