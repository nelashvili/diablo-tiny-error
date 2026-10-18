/**
 * Commands: applies the queued Command union for the local player at the start of each tick.
 * Module-specific commands (vendor, waypoint, merc, cube, quests, talk, stash) go through
 * `CommandHandlers`; unclaimed ones raise a 'toast.notAvailable'.
 */
import { DB } from '../../../data/db';
import { allocateSkill, allocateStat, respec, skillAllocationProblem } from '../../player/progression';
import {
  dropItem,
  equipItem,
  moveItem,
  sortInventory,
  swapWeapons,
  unequipItem,
  useBeltSlot,
  useItem,
  type MoveContainer,
} from '../../player/inventory';
import { buyItem, repairAll, sellItem } from '../../player/vendor';
import { getSkillLevel } from '../../skills/runtime';
import { isActor, type PlayerEntity } from '../entities';
import type { Command } from '../commands';
import type { SimSystem, SimWorld } from '../world';
import { CommandHandlers } from './commandHandlers';
import { clearMovement, setIntent, setMoveDir } from './intent';
import { getLocalPlayer, isHostile, isTargetable } from './util';

const toast = (world: SimWorld, textKey: string): void => world.emit({ type: 'toast', textKey });

const MODULE_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'hireMerc',
  'castRecall',
  'useWaypoint',
  'takeExit',
  'talk',
  'cubeTransmute',
]);

/** The stash chest only exists in camp (D2). */
function inTown(world: SimWorld): boolean {
  return world.levelId !== null && DB.levels.get(world.levelId)?.isTown === true;
}

function skillKnown(p: PlayerEntity, id: string): boolean {
  const def = DB.skills.get(id);
  return !!def && def.kind !== 'passive' && getSkillLevel(p, id) > 0;
}

/** Skill used for a default click on an enemy: the left skill unless it can't target things. */
function clickSkill(p: PlayerEntity): string {
  const def = DB.skills.get(p.leftSkill);
  if (!def) return 'attack';
  const selfOnly =
    def.kind === 'buff' || def.kind === 'aura' || def.kind === 'passive' || def.kind === 'summon';
  return selfOnly ? 'attack' : p.leftSkill;
}

function applyCommand(world: SimWorld, p: PlayerEntity, cmd: Command): void {
  if (cmd.type === 'pause') {
    world.paused = cmd.paused;
    return;
  }
  if (!isTargetable(p)) return; // defeated: only pause works
  if (CommandHandlers.dispatch(world, p, cmd)) return;

  switch (cmd.type) {
    case 'moveTo':
      setIntent(p, undefined);
      clearMovement(p);
      p.targetId = undefined;
      p.moveTarget = { x: cmd.pos.x, y: cmd.pos.y };
      return;
    case 'moveDir':
      if (Math.abs(cmd.dir.x) > 1e-3 || Math.abs(cmd.dir.y) > 1e-3) {
        setIntent(p, undefined);
        p.path = [];
        p.moveTarget = undefined;
      }
      setMoveDir(p, cmd.dir);
      return;
    case 'stop':
      setIntent(p, undefined);
      clearMovement(p);
      p.targetId = undefined;
      return;
    case 'useSkill': {
      if (!DB.skills.get(cmd.skillId)) return;
      clearMovement(p);
      p.targetId = cmd.targetId;
      setIntent(p, {
        kind: 'skill',
        skillId: cmd.skillId,
        targetId: cmd.targetId,
        targetPos: cmd.targetPos ? { x: cmd.targetPos.x, y: cmd.targetPos.y } : undefined,
        standStill: cmd.standStill,
      });
      return;
    }
    case 'interact': {
      const e = world.get(cmd.targetId);
      if (!e) return;
      clearMovement(p);
      if (isActor(e)) {
        if (e.kind === 'npc') setIntent(p, { kind: 'talk', npcId: e.id });
        else if (isHostile(p, e) && isTargetable(e)) {
          p.targetId = e.id;
          setIntent(p, { kind: 'skill', skillId: clickSkill(p), targetId: e.id });
        }
      } else if (e.kind === 'groundItem') setIntent(p, { kind: 'pickup', targetId: e.id });
      else if (e.kind === 'object') setIntent(p, { kind: 'object', targetId: e.id });
      return;
    }
    case 'pickup': {
      const e = world.get(cmd.targetId);
      if (e && e.kind === 'groundItem') {
        clearMovement(p);
        setIntent(p, { kind: 'pickup', targetId: e.id });
      }
      return;
    }
    case 'setRunning':
      p.running = cmd.running;
      return;
    case 'selectSkill':
      if (!skillKnown(p, cmd.skillId)) return toast(world, 'toast.skillNotAvailable');
      if (cmd.hand === 'left') p.leftSkill = cmd.skillId;
      else p.rightSkill = cmd.skillId;
      return;
    case 'bindHotkey':
      if (cmd.slot < 0 || cmd.slot >= p.hotkeys.length) return;
      if (cmd.skillId !== null && !skillKnown(p, cmd.skillId)) return toast(world, 'toast.skillNotAvailable');
      p.hotkeys[cmd.slot] = cmd.skillId;
      return;
    case 'allocateStat':
      if (!allocateStat(p, cmd.stat, cmd.amount)) toast(world, 'toast.cannotAllocate');
      else world.emit({ type: 'statsChanged', id: p.id });
      return;
    case 'allocateSkill':
      if (skillAllocationProblem(p, cmd.skillId) !== null || !allocateSkill(p, cmd.skillId))
        toast(world, 'toast.cannotAllocate');
      else world.emit({ type: 'statsChanged', id: p.id });
      return;
    case 'respec':
      if (!respec(p, world.difficulty)) toast(world, 'toast.noRespec');
      else world.emit({ type: 'statsChanged', id: p.id });
      return;
    case 'equip':
      equipItem(world, p, cmd.uid, cmd.slot);
      return;
    case 'unequip':
      unequipItem(world, p, cmd.slot);
      return;
    case 'useItem':
      useItem(world, p, cmd.uid);
      return;
    case 'useBeltSlot':
      useBeltSlot(world, p, cmd.index);
      return;
    case 'dropItem':
      dropItem(world, p, cmd.uid);
      return;
    case 'swapWeapons':
      swapWeapons(world, p);
      return;
    case 'sortInventory':
      if (cmd.container === 'stash' && !inTown(world)) return toast(world, 'toast.stashTownOnly');
      sortInventory(world, p, cmd.container);
      return;
    case 'moveItem': {
      const ok: MoveContainer[] = ['inventory', 'stash', 'belt', 'ground', 'cursor'];
      if (!ok.includes(cmd.to as MoveContainer) || !ok.includes(cmd.from as MoveContainer))
        return toast(world, 'toast.notAvailable');
      if ((cmd.to === 'stash' || cmd.from === 'stash') && !inTown(world))
        return toast(world, 'toast.stashTownOnly');
      moveItem(world, p, cmd.uid, cmd.to as MoveContainer, cmd.x, cmd.y);
      return;
    }
    case 'buyItem':
      buyItem(world, p, cmd.vendorId, cmd.uid, world.lootRng);
      return;
    case 'sellItem':
      sellItem(world, p, cmd.vendorId, cmd.uid);
      return;
    case 'repairAll':
      repairAll(world, p, cmd.vendorId);
      return;
    default:
      if (MODULE_COMMANDS.has(cmd.type)) toast(world, 'toast.notAvailable');
  }
}

export function createCommandSystem(): SimSystem {
  return {
    name: 'commands',
    update(world) {
      if (world.commands.length === 0) return;
      const cmds = world.commands.splice(0, world.commands.length);
      const p = getLocalPlayer(world);
      for (const c of cmds) {
        if (c.type === 'pause') world.paused = c.paused;
        else if (p) applyCommand(world, p, c);
      }
    },
  };
}
