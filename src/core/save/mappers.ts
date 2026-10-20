import type { ClassId, DefId, Difficulty } from '../types';
import type { PlayerEntity } from '../sim/entities';
import type { CharacterSave } from './types';
import { SAVE_VERSION } from './types';
import { INVENTORY_SIZE, growGrid } from '../items/grid';

/** Fields of CharacterSave that live outside the PlayerEntity. */
export interface PlayerSaveExtra {
  id: string;
  createdAt: number;
  updatedAt: number;
  playTimeSec: number;
  cube: CharacterSave['cube'];
  stash: CharacterSave['stash'];
  progress: CharacterSave['progress'];
  currentDifficulty: Difficulty;
  merc?: CharacterSave['merc'];
  questBonuses: CharacterSave['questBonuses'];
  setPiecesFound?: DefId[];
}

/** Plain data the sim uses to construct a PlayerEntity (level, items, skills...). */
export interface PlayerInit {
  classId: ClassId;
  name: string;
  level: number;
  xp: number;
  creditz: number;
  allocated: CharacterSave['allocated'];
  statPointsUnspent: number;
  skillPointsUnspent: number;
  skills: Record<DefId, number>;
  leftSkill: DefId;
  rightSkill: DefId;
  hotkeys: (DefId | null)[];
  equipment: CharacterSave['equipment'];
  swap?: CharacterSave['equipment'];
  inventory: CharacterSave['inventory'];
  belt: CharacterSave['belt'];
  respecs: CharacterSave['respecs'];
  /** Everything not on the entity; hand back to `playerToSave` when saving. */
  extra: PlayerSaveExtra;
}

export type SavablePlayer = Pick<
  PlayerEntity,
  | 'classId'
  | 'name'
  | 'level'
  | 'xp'
  | 'creditz'
  | 'allocated'
  | 'statPointsUnspent'
  | 'skillPointsUnspent'
  | 'skills'
  | 'leftSkill'
  | 'rightSkill'
  | 'hotkeys'
  | 'equipment'
  | 'swap'
  | 'inventory'
  | 'belt'
  | 'respecs'
>;

const clone = <T>(v: T): T => structuredClone(v);

export function playerToSave(p: SavablePlayer, extra: PlayerSaveExtra): CharacterSave {
  const save: CharacterSave = {
    version: SAVE_VERSION,
    id: extra.id,
    name: p.name,
    classId: p.classId,
    level: p.level,
    xp: p.xp,
    creditz: p.creditz,
    createdAt: extra.createdAt,
    updatedAt: extra.updatedAt,
    playTimeSec: extra.playTimeSec,
    allocated: clone(p.allocated),
    statPointsUnspent: p.statPointsUnspent,
    skillPointsUnspent: p.skillPointsUnspent,
    skills: clone(p.skills),
    leftSkill: p.leftSkill,
    rightSkill: p.rightSkill,
    hotkeys: [...p.hotkeys],
    equipment: clone(p.equipment),
    inventory: clone(p.inventory),
    belt: clone(p.belt),
    cube: clone(extra.cube),
    stash: clone(extra.stash),
    progress: clone(extra.progress),
    currentDifficulty: extra.currentDifficulty,
    respecs: clone(p.respecs),
    questBonuses: clone(extra.questBonuses),
  };
  if (p.swap) save.swap = clone(p.swap);
  if (extra.merc) save.merc = clone(extra.merc);
  if (extra.setPiecesFound?.length) save.setPiecesFound = [...extra.setPiecesFound];
  return save;
}

export function saveToPlayerInit(save: CharacterSave): PlayerInit {
  const init: PlayerInit = {
    classId: save.classId,
    name: save.name,
    level: save.level,
    xp: save.xp,
    creditz: save.creditz,
    allocated: clone(save.allocated),
    statPointsUnspent: save.statPointsUnspent,
    skillPointsUnspent: save.skillPointsUnspent,
    skills: clone(save.skills),
    leftSkill: save.leftSkill,
    rightSkill: save.rightSkill,
    hotkeys: [...save.hotkeys],
    equipment: clone(save.equipment),
    inventory: growGrid(clone(save.inventory), INVENTORY_SIZE),
    belt: clone(save.belt),
    respecs: clone(save.respecs),
    extra: {
      id: save.id,
      createdAt: save.createdAt,
      updatedAt: save.updatedAt,
      playTimeSec: save.playTimeSec,
      cube: clone(save.cube),
      stash: clone(save.stash),
      progress: clone(save.progress),
      currentDifficulty: save.currentDifficulty,
      questBonuses: clone(save.questBonuses),
    },
  };
  if (save.swap) init.swap = clone(save.swap);
  if (save.merc) init.extra.merc = clone(save.merc);
  if (save.setPiecesFound?.length) init.extra.setPiecesFound = [...save.setPiecesFound];
  return init;
}
