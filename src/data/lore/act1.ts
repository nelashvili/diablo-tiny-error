import type { LoreDef } from '../schema';

const entry = (id: string, unlock?: LoreDef['unlock']): LoreDef => ({
  id,
  act: 1,
  title: `lore.${id}.title`,
  text: `lore.${id}.text`,
  ...(unlock ? { unlock } : {}),
});

/** Act I Holocron entries, in reading order. */
export default [
  entry('kyburHeart'),
  entry('padawonTypo'),
  entry('allowance'),
  entry('endoor'),
  entry('tuskins', { quest: 'a1q1', when: 'started' }),
  entry('jawwas', { quest: 'a1q2', when: 'started' }),
  entry('blackBox', { quest: 'a1q2', when: 'done' }),
  entry('yoduh', { quest: 'a1q3', when: 'started' }),
  entry('theError', { quest: 'a1q3', when: 'done' }),
  entry('syth', { quest: 'a1q4', when: 'started' }),
  entry('countezz', { quest: 'a1q4', when: 'done' }),
  entry('dooky', { quest: 'a1q5', when: 'started' }),
  entry('lastWords', { quest: 'a1q5', when: 'done' }),
] satisfies LoreDef[];
