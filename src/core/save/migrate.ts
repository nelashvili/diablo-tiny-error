/**
 * Versioned migrations + repair. Never throws: callers get `{ok:false}` for unusable data.
 *
 * To add a version: bump SAVE_VERSION in types.ts (lead), then append a step to the *_MIGRATIONS
 * arrays where index i upgrades version i -> i+1.
 */
import type { Difficulty } from '../types';
import { DIFFICULTIES } from '../types';
import type { AccountSave, CharacterSave, DifficultyProgress, Settings } from './types';
import { SAVE_VERSION } from './types';
import { defaultAccount, defaultSettings, emptyBelt, emptyGrid, newCharacterSave } from './defaults';
import { sanityCheckAccount, sanityCheckCharacter } from './validate';
import { INVENTORY_SIZE } from '../items/grid';

export type MigrateResult<T> =
  { ok: true; value: T; migratedFrom: number; repairs: string[] } | { ok: false; error: string };

type Raw = Record<string, unknown>;
type Step = (raw: Raw) => Raw;

/** index i: version i -> i+1. v0 was the pre-release prototype shape (flat `gold`, `class`, `stats`). */
const CHARACTER_MIGRATIONS: Step[] = [
  (r) => {
    const o: Raw = { ...r };
    if (o['classId'] === undefined && o['class'] !== undefined) o['classId'] = o['class'];
    if (o['creditz'] === undefined && o['gold'] !== undefined) o['creditz'] = o['gold'];
    if (o['allocated'] === undefined && o['stats'] !== undefined) o['allocated'] = o['stats'];
    if (o['inventory'] === undefined && Array.isArray(o['items'])) {
      o['inventory'] = { w: 10, h: 4, items: o['items'] };
    }
    delete o['class'];
    delete o['gold'];
    delete o['stats'];
    delete o['items'];
    o['version'] = 1;
    return o;
  },
  // v2: the classic Forse powers replaced some D2 copies. Renamed skills keep their points;
  // removed skills refund theirs, and skill-bar slots pointing at them are cleared.
  (r) => {
    const o: Raw = { ...r, version: 2 };
    if (!isObj(r['skills'])) return o;
    const skills: Raw = {};
    let refund = 0;
    for (const [id, v] of Object.entries(r['skills'])) {
      const pts = typeof v === 'number' && Number.isFinite(v) ? v : 0;
      const to = SKILL_RENAMES_V2[id];
      if (to) skills[to] = ((skills[to] as number | undefined) ?? 0) + pts;
      else if (SKILLS_REMOVED_V2.has(id)) refund += Math.max(0, Math.floor(pts));
      else skills[id] = v;
    }
    o['skills'] = skills;
    o['skillPointsUnspent'] = num(r['skillPointsUnspent'], 0, 0) + refund;
    const remap = (id: unknown): unknown =>
      typeof id === 'string' ? (SKILL_RENAMES_V2[id] ?? (SKILLS_REMOVED_V2.has(id) ? null : id)) : id;
    for (const hand of ['leftSkill', 'rightSkill']) {
      const id = remap(r[hand]);
      if (id === null) delete o[hand];
      else if (id !== undefined) o[hand] = id;
    }
    if (Array.isArray(r['hotkeys'])) o['hotkeys'] = (r['hotkeys'] as unknown[]).map(remap);
    return o;
  },
];

/** v1 -> v2 skill id changes (Forse powers update). */
export const SKILL_RENAMES_V2: Record<string, string> = {
  fearRoar: 'mindTrik',
  swiftStep: 'forseSpeed',
  shockwave: 'forseRepulse',
};
export const SKILLS_REMOVED_V2 = new Set([
  'staticField',
  'stormNova',
  'lightning',
  'twinThrow',
  'pikeMastery',
  'avoid',
]);

const ACCOUNT_MIGRATIONS: Step[] = [
  (r) => {
    const o: Raw = { ...r };
    if (o['settings'] === undefined && o['options'] !== undefined) o['settings'] = o['options'];
    delete o['options'];
    o['version'] = 1;
    return o;
  },
  (r) => ({ ...r, version: 2 }),
];

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const str = (v: unknown, d: string): string => (typeof v === 'string' && v ? v : d);

function repairGrid(v: unknown, w: number, h: number, repairs: string[], label: string) {
  if (!isObj(v) || !Array.isArray(v['items'])) {
    repairs.push(`${label} reset`);
    return emptyGrid(w, h);
  }
  const items = (v['items'] as unknown[]).filter((e) => {
    const ok = isObj(e) && isObj(e['item']) && typeof e['item']['uid'] === 'string';
    if (!ok) repairs.push(`${label}: dropped malformed entry`);
    return ok;
  }) as ReturnType<typeof emptyGrid>['items'];
  return { w: num(v['w'], w, 1, 64), h: num(v['h'], h, 1, 64), items };
}

function runMigrations(raw: Raw, steps: Step[], target: number): { raw: Raw; from: number } | string {
  let version = num(raw['version'], 0, 0);
  const from = version;
  if (version > target) return `save is from a newer game version (${version} > ${target})`;
  let cur = raw;
  while (version < target) {
    const step = steps[version];
    if (!step) return `no migration from version ${version}`;
    cur = step(cur);
    version++;
  }
  return { raw: cur, from };
}

type Progress = CharacterSave['progress'];

function repairProgress(r: Raw, out: CharacterSave, repairs: string[]): void {
  const prog = isObj(r['progress']) ? r['progress'] : {};
  const respecs = isObj(r['respecs']) ? r['respecs'] : {};
  for (const d of DIFFICULTIES) {
    const p = prog[d];
    if (isObj(p)) {
      const next: DifficultyProgress = {
        unlocked: p['unlocked'] === true || d === 'normal',
        actsUnlocked:
          Array.isArray(p['actsUnlocked']) && p['actsUnlocked'].length
            ? (p['actsUnlocked'] as Progress[Difficulty]['actsUnlocked'])
            : [1],
        currentAct: ([1, 2, 3, 4] as number[]).includes(p['currentAct'] as number)
          ? (p['currentAct'] as 1 | 2 | 3 | 4)
          : 1,
        waypoints: Array.isArray(p['waypoints'])
          ? (p['waypoints'] as unknown[]).filter((w): w is string => typeof w === 'string')
          : [],
        quests: isObj(p['quests']) ? (p['quests'] as Progress[Difficulty]['quests']) : {},
      };
      out.progress[d] = next;
    } else if (p !== undefined) repairs.push(`progress.${d} reset`);
    out.respecs[d] = Math.floor(num(respecs[d], 1, 0));
  }
}

export function migrateCharacter(raw: unknown): MigrateResult<CharacterSave> {
  try {
    if (!isObj(raw)) return { ok: false, error: 'character save is not an object' };
    const m = runMigrations(raw, CHARACTER_MIGRATIONS, SAVE_VERSION);
    if (typeof m === 'string') return { ok: false, error: m };
    const r = m.raw;
    if (typeof r['id'] !== 'string' || !r['id']) return { ok: false, error: 'character has no id' };
    const classId = r['classId'];
    if (classId !== 'yediKnight' && classId !== 'bountyHuntur' && classId !== 'forseAdept') {
      return { ok: false, error: `unknown class ${String(classId)}` };
    }
    const repairs: string[] = [];
    const base = newCharacterSave(classId, str(r['name'], 'Hero'), { id: r['id'] });
    const alloc = isObj(r['allocated']) ? r['allocated'] : {};
    const out: CharacterSave = {
      ...base,
      name: str(r['name'], 'Hero'),
      level: Math.floor(num(r['level'], 1, 1, 99)),
      xp: num(r['xp'], 0, 0),
      creditz: Math.floor(num(r['creditz'], 0, 0)),
      createdAt: num(r['createdAt'], 0, 0),
      updatedAt: num(r['updatedAt'], 0, 0),
      playTimeSec: num(r['playTimeSec'], 0, 0),
      allocated: {
        strength: num(alloc['strength'], 0, 0),
        dexterity: num(alloc['dexterity'], 0, 0),
        vitality: num(alloc['vitality'], 0, 0),
        energy: num(alloc['energy'], 0, 0),
      },
      statPointsUnspent: Math.floor(num(r['statPointsUnspent'], 0, 0)),
      skillPointsUnspent: Math.floor(num(r['skillPointsUnspent'], 0, 0)),
      leftSkill: str(r['leftSkill'], base.leftSkill),
      rightSkill: str(r['rightSkill'], base.rightSkill),
    };
    if (isObj(r['skills'])) {
      out.skills = {};
      for (const [k, v] of Object.entries(r['skills'])) {
        if (typeof v === 'number' && Number.isFinite(v)) out.skills[k] = v;
      }
    } else repairs.push('skills reset');
    if (Array.isArray(r['hotkeys'])) {
      out.hotkeys = Array.from({ length: 8 }, (_, i) => {
        const h = (r['hotkeys'] as unknown[])[i];
        return typeof h === 'string' ? h : null;
      });
    } else repairs.push('hotkeys reset');
    if (isObj(r['equipment'])) out.equipment = r['equipment'] as CharacterSave['equipment'];
    else repairs.push('equipment reset');
    if (isObj(r['swap'])) out.swap = r['swap'] as CharacterSave['equipment'];
    out.inventory = repairGrid(r['inventory'], INVENTORY_SIZE.w, INVENTORY_SIZE.h, repairs, 'inventory');
    out.cube = repairGrid(r['cube'], 3, 4, repairs, 'cube');
    out.stash = repairGrid(r['stash'], 10, 10, repairs, 'stash');
    const belt = r['belt'];
    if (isObj(belt) && Array.isArray(belt['slots'])) {
      const rows = Math.floor(num(belt['rows'], 1, 1, 4));
      const slots = (belt['slots'] as unknown[]).slice(0, rows * 4).map((s) => s ?? null);
      while (slots.length < rows * 4) slots.push(null);
      out.belt = { rows, cols: 4, slots: slots as CharacterSave['belt']['slots'] };
    } else {
      out.belt = emptyBelt(1);
      repairs.push('belt reset');
    }
    repairProgress(r, out, repairs);
    out.currentDifficulty = (DIFFICULTIES as readonly string[]).includes(r['currentDifficulty'] as string)
      ? (r['currentDifficulty'] as Difficulty)
      : 'normal';
    const merc = r['merc'];
    if (isObj(merc) && typeof merc['defId'] === 'string') out.merc = merc as unknown as CharacterSave['merc'];
    const qb = isObj(r['questBonuses']) ? r['questBonuses'] : {};
    out.questBonuses = {
      lifeMax: num(qb['lifeMax'], 0),
      resistAll: num(qb['resistAll'], 0),
      skillPoints: num(qb['skillPoints'], 0),
      statPoints: num(qb['statPoints'], 0),
    };
    const problems = sanityCheckCharacter(out);
    if (problems.length) return { ok: false, error: problems.join('; ') };
    return { ok: true, value: out, migratedFrom: m.from, repairs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'migration failed' };
  }
}

export function migrateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], def: T): T =>
    allowed.includes(v as T) ? (v as T) : def;
  const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
  return {
    masterVolume: num(raw['masterVolume'], d.masterVolume, 0, 1),
    musicVolume: num(raw['musicVolume'], d.musicVolume, 0, 1),
    sfxVolume: num(raw['sfxVolume'], d.sfxVolume, 0, 1),
    voiceVolume: num(raw['voiceVolume'], d.voiceVolume, 0, 1),
    movement: pick(raw['movement'], ['tapToMove', 'joystick', 'auto'], d.movement),
    showBuildGuide: bool(raw['showBuildGuide'], d.showBuildGuide),
    showStatHints: bool(raw['showStatHints'], d.showStatHints),
    lootFilter: pick(raw['lootFilter'], ['all', 'hideInferior', 'hideNormal'], d.lootFilter),
    screenShake: bool(raw['screenShake'], d.screenShake),
    weather: bool(raw['weather'], d.weather),
    reduceFlashes: bool(raw['reduceFlashes'], d.reduceFlashes),
    colorblind: pick(raw['colorblind'], ['none', 'protan', 'deutan', 'tritan'], d.colorblind),
    textScale: num(raw['textScale'], d.textScale, 0.75, 2),
    readAloud: bool(raw['readAloud'], d.readAloud),
    quality: pick(raw['quality'], ['low', 'medium', 'high', 'auto'], d.quality),
    sessionTimerMin: num(raw['sessionTimerMin'], d.sessionTimerMin, 0, 600),
  };
}

export function migrateAccount(raw: unknown): MigrateResult<AccountSave> {
  try {
    if (!isObj(raw)) return { ok: false, error: 'account save is not an object' };
    const m = runMigrations(raw, ACCOUNT_MIGRATIONS, SAVE_VERSION);
    if (typeof m === 'string') return { ok: false, error: m };
    const r = m.raw;
    const repairs: string[] = [];
    const d = defaultAccount();
    const stash = Array.isArray(r['sharedStash'])
      ? (r['sharedStash'] as unknown[]).map((g, i) => repairGrid(g, 10, 10, repairs, `sharedStash[${i}]`))
      : [];
    const out: AccountSave = {
      version: SAVE_VERSION,
      sharedStash: stash.length ? stash : d.sharedStash,
      settings: migrateSettings(r['settings']),
      characterIds: Array.isArray(r['characterIds'])
        ? [...new Set((r['characterIds'] as unknown[]).filter((x): x is string => typeof x === 'string'))]
        : [],
    };
    const problems = sanityCheckAccount(out);
    if (problems.length) return { ok: false, error: problems.join('; ') };
    return { ok: true, value: out, migratedFrom: m.from, repairs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'migration failed' };
  }
}
