/**
 * Pluggable command handlers. Other modules (vendor, waypoint, merc, cube, quests, talk, stash...)
 * register handlers here; they run BEFORE the built-in behavior, and returning `true` marks the
 * command as handled. Unhandled module-specific commands produce a 'toast.notAvailable'.
 */
import type { Command } from '../commands';
import type { PlayerEntity } from '../entities';
import type { SimWorld } from '../world';

export type CommandOf<T extends Command['type']> = Extract<Command, { type: T }>;
export type CommandHandlerFn<T extends Command['type']> = (
  world: SimWorld,
  player: PlayerEntity,
  cmd: CommandOf<T>,
) => boolean | void;

type Stored = (world: SimWorld, player: PlayerEntity, cmd: Command) => boolean | void;
const registry = new Map<string, Stored[]>();

export const CommandHandlers = {
  /** Register a handler for a command type. Returns an unregister function. */
  register<T extends Command['type']>(type: T, fn: CommandHandlerFn<T>): () => void {
    const list = registry.get(type) ?? [];
    registry.set(type, list);
    const stored = fn as unknown as Stored;
    list.push(stored);
    return () => {
      const i = list.indexOf(stored);
      if (i >= 0) list.splice(i, 1);
    };
  },
  /** Run handlers; true if any claimed the command. */
  dispatch(world: SimWorld, player: PlayerEntity, cmd: Command): boolean {
    const list = registry.get(cmd.type);
    if (!list) return false;
    for (const fn of [...list]) if (fn(world, player, cmd) === true) return true;
    return false;
  },
  has(type: Command['type']): boolean {
    return (registry.get(type)?.length ?? 0) > 0;
  },
  clear(type?: Command['type']): void {
    if (type) registry.delete(type);
    else registry.clear();
  },
};
