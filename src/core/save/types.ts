/**
 * Save-game schema. Versioned; core/save owns migrations (Wave 1).
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { ActId, ClassId, DefId, Difficulty } from '../types';
import type { Belt, Equipment, GridContainer } from '../items/types';

export const SAVE_VERSION = 1;

export interface CharacterSave {
  version: number;
  id: string; // uuid
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  creditz: number;
  createdAt: number;
  updatedAt: number;
  playTimeSec: number;
  allocated: { strength: number; dexterity: number; vitality: number; energy: number };
  statPointsUnspent: number;
  skillPointsUnspent: number;
  skills: Record<DefId, number>;
  leftSkill: DefId;
  rightSkill: DefId;
  hotkeys: (DefId | null)[];
  equipment: Equipment;
  swap?: Equipment;
  inventory: GridContainer;
  belt: Belt;
  cube: GridContainer;
  /** Personal stash page (shared stash is in AccountSave). */
  stash: GridContainer;
  progress: Record<Difficulty, DifficultyProgress>;
  currentDifficulty: Difficulty;
  merc?: { defId: DefId; level: number; xp: number; equipment: Equipment; name: string; alive: boolean };
  respecs: Record<Difficulty, number>;
  /** Permanent quest bonuses already applied (so they're not double-counted). */
  questBonuses: { lifeMax: number; resistAll: number; skillPoints: number; statPoints: number };
}

export interface DifficultyProgress {
  unlocked: boolean;
  actsUnlocked: ActId[];
  currentAct: ActId;
  waypoints: DefId[];
  quests: Record<DefId, { step: string; completed: boolean; rewardClaimed: boolean }>;
}

export interface AccountSave {
  version: number;
  sharedStash: GridContainer[];
  settings: Settings;
  characterIds: string[];
  /** Last played character, for a "Continue" button. */
  lastCharacterId?: string;
}

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  movement: 'tapToMove' | 'joystick' | 'auto';
  showBuildGuide: boolean;
  showStatHints: boolean;
  lootFilter: 'all' | 'hideInferior' | 'hideNormal';
  screenShake: boolean;
  colorblind: 'none' | 'protan' | 'deutan' | 'tritan';
  textScale: number;
  readAloud: boolean;
  quality: 'low' | 'medium' | 'high' | 'auto';
  sessionTimerMin: number; // 0 = off
}

/** Persistence port; platform/ implements it with IndexedDB. */
export interface SaveStore {
  listCharacters(): Promise<Pick<CharacterSave, 'id' | 'name' | 'classId' | 'level' | 'updatedAt'>[]>;
  loadCharacter(id: string): Promise<CharacterSave | null>;
  saveCharacter(c: CharacterSave): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  loadAccount(): Promise<AccountSave>;
  saveAccount(a: AccountSave): Promise<void>;
  exportAll(): Promise<Blob>;
  importAll(file: Blob): Promise<void>;
}
