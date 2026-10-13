/**
 * Content database. Auto-collects every data file via import.meta.glob, so content agents never
 * edit a shared registry: add a file `data/<table>/<anything>.ts` with
 *   `export default [ ... ] satisfies XDef[];`
 * and it is picked up. Duplicate ids throw at startup (caught by tests).
 */
import type {
  AffixDef,
  BossDef,
  ClassDef,
  GemDef,
  ItemBaseDef,
  LevelDef,
  MercDef,
  MissileDef,
  MonsterDef,
  NpcDef,
  QuestDef,
  SetDef,
  SkillDef,
  TreasureClassDef,
  UniqueDef,
} from './schema';
import type { VfxDef } from '../render/types';

type Mod<T> = Record<string, { default: T[] }>;

function table<T extends { id: string }>(name: string, mods: Mod<T>): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const [file, m] of Object.entries(mods)) {
    for (const row of m.default ?? []) {
      if (map.has(row.id)) throw new Error(`[db] duplicate ${name} id "${row.id}" in ${file}`);
      map.set(row.id, row);
    }
  }
  return map;
}

export const DB = {
  classes: table<ClassDef>('class', import.meta.glob('./classes/*.ts', { eager: true })),
  skills: table<SkillDef>('skill', import.meta.glob('./skills/**/*.ts', { eager: true })),
  missiles: table<MissileDef>('missile', import.meta.glob('./missiles/*.ts', { eager: true })),
  items: table<ItemBaseDef>('item', import.meta.glob('./items/*.ts', { eager: true })),
  affixes: table<AffixDef>('affix', import.meta.glob('./affixes/*.ts', { eager: true })),
  uniques: table<UniqueDef>('unique', import.meta.glob('./uniques/*.ts', { eager: true })),
  sets: table<SetDef>('set', import.meta.glob('./sets/*.ts', { eager: true })),
  gems: table<GemDef>('gem', import.meta.glob('./gems/*.ts', { eager: true })),
  treasure: table<TreasureClassDef>('treasure', import.meta.glob('./treasure/*.ts', { eager: true })),
  monsters: table<MonsterDef>('monster', import.meta.glob('./monsters/*.ts', { eager: true })),
  bosses: table<BossDef>('boss', import.meta.glob('./bosses/*.ts', { eager: true })),
  levels: table<LevelDef>('level', import.meta.glob('./levels/*.ts', { eager: true })),
  npcs: table<NpcDef>('npc', import.meta.glob('./npcs/*.ts', { eager: true })),
  quests: table<QuestDef>('quest', import.meta.glob('./quests/*.ts', { eager: true })),
  mercs: table<MercDef>('merc', import.meta.glob('./mercs/*.ts', { eager: true })),
  vfx: table<VfxDef>('vfx', import.meta.glob('./vfx/*.ts', { eager: true })),
};

/** Name files: data/names/*.ts export default Record<string,string>; registered on import. */
import { registerNames } from './names';
for (const m of Object.values(
  import.meta.glob<{ default: Record<string, string> }>('./names/*.ts', { eager: true }),
))
  registerNames(m.default);

export function req<T>(map: ReadonlyMap<string, T>, id: string, what = 'def'): T {
  const v = map.get(id);
  if (!v) throw new Error(`[db] unknown ${what} "${id}"`);
  return v;
}
