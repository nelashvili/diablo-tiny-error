/**
 * Commands: the ONLY way ui/ and input/ affect the simulation. Queued and applied at tick start.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { DefId, EntityId, EquipSlot, Vec2 } from '../types';
import type { ItemUid } from '../items/types';

export type ContainerRef = 'inventory' | 'stash' | 'cube' | 'belt' | 'ground' | 'cursor' | 'vendor' | 'merc';

export type Command =
  /** Click-to-move / tap-to-move / joystick target. `force` = Shift stand-still is false. */
  | { type: 'moveTo'; pos: Vec2 }
  /** Joystick/WASD direction (unit vector or zero to stop). Continuous. */
  | { type: 'moveDir'; dir: Vec2 }
  | { type: 'stop' }
  /** Use a skill on an entity or ground position. standStill = Shift held / attack in place. */
  | { type: 'useSkill'; skillId: DefId; targetId?: EntityId; targetPos?: Vec2; standStill?: boolean }
  /** Default left-click on entity: attack monster, talk to npc, pick up item, use object. */
  | { type: 'interact'; targetId: EntityId }
  | { type: 'setRunning'; running: boolean }
  | { type: 'selectSkill'; hand: 'left' | 'right'; skillId: DefId }
  | { type: 'bindHotkey'; slot: number; skillId: DefId | null }
  | { type: 'allocateStat'; stat: 'strength' | 'dexterity' | 'vitality' | 'energy'; amount: number }
  | { type: 'allocateSkill'; skillId: DefId }
  | { type: 'moveItem'; uid: ItemUid; from: ContainerRef; to: ContainerRef; x?: number; y?: number }
  | { type: 'equip'; uid: ItemUid; slot: EquipSlot }
  | { type: 'unequip'; slot: EquipSlot }
  | { type: 'useItem'; uid: ItemUid }
  | { type: 'useBeltSlot'; index: number }
  | { type: 'dropItem'; uid: ItemUid }
  | { type: 'pickup'; targetId: EntityId }
  | { type: 'sortInventory'; container: 'inventory' | 'stash' }
  | { type: 'buyItem'; vendorId: EntityId; uid: ItemUid }
  | { type: 'sellItem'; vendorId: EntityId; uid: ItemUid }
  | { type: 'repairAll'; vendorId: EntityId }
  | { type: 'hireMerc'; npcId: EntityId; mercIndex: number }
  | { type: 'respec' }
  | { type: 'swapWeapons' }
  | { type: 'castRecall' }
  | { type: 'useWaypoint'; levelId: DefId }
  | { type: 'takeExit'; objectId: EntityId }
  | { type: 'talk'; npcId: EntityId; option?: string }
  | { type: 'cubeTransmute' }
  | { type: 'pause'; paused: boolean };
