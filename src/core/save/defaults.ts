import type { ClassId, Difficulty } from '../types';
import { DIFFICULTIES } from '../types';
import type { Belt, GridContainer } from '../items/types';
import { INVENTORY_SIZE } from '../items/grid';
import type { AccountSave, CharacterSave, DifficultyProgress, Settings } from './types';
import { SAVE_VERSION } from './types';

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    movement: 'auto',
    showBuildGuide: true,
    showStatHints: true,
    lootFilter: 'all',
    screenShake: true,
    colorblind: 'none',
    textScale: 1,
    readAloud: false,
    quality: 'auto',
    sessionTimerMin: 45,
  };
}

export function emptyGrid(w: number, h: number): GridContainer {
  return { w, h, items: [] };
}

export function emptyBelt(rows = 1): Belt {
  return { rows, cols: 4, slots: Array.from({ length: rows * 4 }, () => null) };
}

export function defaultAccount(): AccountSave {
  return {
    version: SAVE_VERSION,
    sharedStash: [emptyGrid(10, 10)],
    settings: defaultSettings(),
    characterIds: [],
  };
}

export function defaultProgress(difficulty: Difficulty): DifficultyProgress {
  return {
    unlocked: difficulty === 'normal',
    actsUnlocked: [1],
    currentAct: 1,
    waypoints: [],
    quests: {},
  };
}

export interface NewCharacterOptions {
  id?: string;
  now?: number;
  /** Starting left/right skill ids (class data decides; default 'attack'). */
  leftSkill?: string;
  rightSkill?: string;
  /** Starting base attributes (class data decides). */
  allocated?: CharacterSave['allocated'];
}

/** Random uuid via crypto (not `Math.random`, which core bans). */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = (i * 73 + 41) & 255;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Brand-new level-1 character. Pure apart from id generation (pass `id`/`now` for determinism).
 * Class-specific starting stats/gear are applied by the sim via `saveToPlayerInit`.
 */
export function newCharacterSave(
  classId: ClassId,
  name: string,
  opts: NewCharacterOptions = {},
): CharacterSave {
  const now = opts.now ?? 0;
  const progress = {} as Record<Difficulty, DifficultyProgress>;
  const respecs = {} as Record<Difficulty, number>;
  for (const d of DIFFICULTIES) {
    progress[d] = defaultProgress(d);
    respecs[d] = 1;
  }
  return {
    version: SAVE_VERSION,
    id: opts.id ?? newId(),
    name: name.trim().slice(0, 16) || 'Hero',
    classId,
    level: 1,
    xp: 0,
    creditz: 0,
    createdAt: now,
    updatedAt: now,
    playTimeSec: 0,
    allocated: opts.allocated ?? { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    statPointsUnspent: 0,
    skillPointsUnspent: 0,
    skills: {},
    leftSkill: opts.leftSkill ?? 'attack',
    rightSkill: opts.rightSkill ?? 'attack',
    hotkeys: Array.from({ length: 8 }, () => null),
    equipment: {},
    inventory: emptyGrid(INVENTORY_SIZE.w, INVENTORY_SIZE.h),
    belt: emptyBelt(1),
    cube: emptyGrid(3, 4),
    stash: emptyGrid(10, 10),
    progress,
    currentDifficulty: 'normal',
    respecs,
    questBonuses: { lifeMax: 0, resistAll: 0, skillPoints: 0, statPoints: 0 },
  };
}
