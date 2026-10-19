/**
 * FxModel: turns frame GameEvents into transient HUD feedback — pooled floating combat text,
 * toasts, the level-up / boss / defeated banners and item pickup notifications.
 */
import { signal } from '@preact/signals';
import type { GameEvent } from '../../core/sim/events';
import type { WorldView } from '../../core/sim/world';
import type { PlayerEntity } from '../../core/sim/entities';
import type { ItemInstance } from '../../core/items/types';
import type { Vec2 } from '../../core/types';
import { DB } from '../../data/db';
import { t } from '../../data/names';
import { damageColor, qualityColor } from './colors';
import { formatCompact, formatInt } from './format';
import { FloatPool, type FloatKind } from './floatPool';
import { entityName, itemBaseName, itemName } from './lookup';

export interface Toast {
  id: number;
  text: string;
  color?: string;
}

export interface Banner {
  id: number;
  kind: 'levelUp' | 'boss' | 'defeated';
  title: string;
  lines: string[];
}

export interface Pickup {
  id: number;
  text: string;
  color: string;
}

/** D2 rules (PLAN §3-4): 5 stat points and 1 skill point per level. */
export const STAT_POINTS_PER_LEVEL = 5;
export const SKILL_POINTS_PER_LEVEL = 1;

export const TOAST_MS = 3500;
export const PICKUP_MS = 4000;
export const BANNER_MS = { levelUp: 3600, boss: 4200, defeated: 4000 } as const;
const MAX_TOASTS = 3;
const MAX_PICKUPS = 5;

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function levelUpLines(levels: number): string[] {
  const stats = levels * STAT_POINTS_PER_LEVEL;
  const skills = levels * SKILL_POINTS_PER_LEVEL;
  return [
    t('hud.levelUp.stats', { n: stats }),
    t(skills === 1 ? 'hud.levelUp.skills' : 'hud.levelUp.skillsPlural', { n: skills }),
  ];
}

function playerItems(p: PlayerEntity): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const g of p.inventory.items) out.push(g.item);
  for (const s of p.belt.slots) if (s) out.push(s);
  for (const it of Object.values(p.equipment)) if (it) out.push(it);
  return out;
}

export class FxModel {
  readonly pool = new FloatPool(64);
  readonly toasts = signal<Toast[]>([]);
  readonly pickups = signal<Pickup[]>([]);
  readonly banner = signal<Banner | null>(null);
  /** Called after floats are spawned so the layer can wake its animation loop. */
  onSpawn: (() => void) | null = null;

  private seq = 1;
  private bannerTimer: unknown = null;
  private bannerLevels = 0;
  private knownUids: Set<string> | null = null;

  constructor(private sched: Scheduler = defaultScheduler) {}

  handle(events: readonly GameEvent[], view: WorldView | null): void {
    if (!events.length) return;
    const pid = view?.localPlayerId ?? null;
    const player = pid != null ? view?.get(pid) : undefined;
    const p = player?.kind === 'player' ? (player as PlayerEntity) : undefined;
    let xp = 0;
    let levels = 0;
    let newLevel = 0;
    let invChanged = false;
    let spawned = false;

    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          if (e.amount <= 0) break;
          const target = view?.get(e.targetId);
          const toPlayer = e.targetId === pid;
          if (!toPlayer && target && target.kind !== 'monster') break;
          const kind: FloatKind = toPlayer ? 'hurt' : e.crit ? 'crit' : 'dmg';
          const text = toPlayer
            ? `-${formatCompact(e.amount)}`
            : e.crit
              ? t('hud.crit', { n: formatCompact(e.amount) })
              : formatCompact(e.amount);
          this.float(
            text,
            toPlayer ? 'var(--ui-life)' : damageColor(e.dtype),
            kind,
            e.pos,
            toPlayer ? 2.0 : 1.7,
          );
          spawned = true;
          break;
        }
        case 'attackResult': {
          if (e.outcome === 'hit') break;
          // Your misses, and your blocks/dodges; a pack's misses on you would bury the numbers.
          const shown = e.attackerId === pid || (e.targetId === pid && e.outcome !== 'miss');
          if (!shown) break;
          const target = view?.get(e.targetId);
          if (!target) break;
          const key =
            e.outcome === 'blocked' ? 'hud.blocked' : e.outcome === 'miss' ? 'hud.miss' : 'hud.dodged';
          this.float(t(key), 'var(--ui-text-dim)', 'info', target.pos, 1.9);
          spawned = true;
          break;
        }
        case 'xpGained':
          if (e.id === pid) xp += e.amount;
          break;
        case 'levelUp':
          if (e.id === pid) {
            levels++;
            newLevel = Math.max(newLevel, e.level);
          }
          break;
        case 'bossIntro': {
          const boss = view?.get(e.id);
          const name = boss ? entityName(boss) : t('hud.boss.incoming');
          this.showBanner({
            kind: 'boss',
            title: name,
            lines: e.lineKey ? [t(e.lineKey)] : [t('hud.boss.incoming')],
          });
          break;
        }
        case 'playerDefeated':
          if (e.id === pid) this.showBanner({ kind: 'defeated', title: t('hud.defeated'), lines: [] });
          break;
        case 'toast':
          this.toast(t(e.textKey, e.params));
          break;
        case 'waypointActivated':
          this.toast(t('hud.waypoint'), 'var(--dmg-cryo)');
          break;
        case 'questUpdated': {
          const q = DB.quests.get(e.questId);
          // Progress shows what to do next, completion names the quest.
          const next = q?.steps[q.steps.findIndex((st) => st.id === e.step) + 1];
          const text = e.completed
            ? q
              ? t('quest.done', { name: t(q.name) })
              : t('hud.questDone')
            : next
              ? t(next.text)
              : t('hud.questUpdated');
          this.toast(text, 'var(--q-unique)');
          break;
        }
        case 'itemPickedUp': {
          if (e.playerId !== pid) break;
          if (e.creditz) {
            if (p)
              this.float(
                t('hud.creditzGain', { n: formatInt(e.creditz) }),
                'var(--q-unique)',
                'creditz',
                p.pos,
                2.3,
              );
            spawned = true;
          } else {
            this.pickup(e.baseId, p);
          }
          invChanged = true;
          break;
        }
        case 'inventoryChanged':
          if (e.playerId === pid) invChanged = true;
          break;
      }
    }

    if (xp > 0 && p) {
      this.float(t('hud.xpGain', { n: formatInt(xp) }), 'var(--ui-xp)', 'xp', p.pos, 2.5);
      spawned = true;
    }
    if (levels > 0) {
      const add = this.banner.value?.kind === 'levelUp' ? this.bannerLevels : 0;
      this.bannerLevels = add + levels;
      this.showBanner({
        kind: 'levelUp',
        title: t('hud.levelUp.title', { level: newLevel }),
        lines: levelUpLines(this.bannerLevels),
      });
    }
    if (p && (invChanged || !this.knownUids)) this.knownUids = new Set(playerItems(p).map((i) => i.uid));
    if (spawned) this.onSpawn?.();
  }

  float(text: string, color: string, kind: FloatKind, world: Vec2, height: number): void {
    const life =
      kind === 'crit' ? 1.4 : kind === 'xp' || kind === 'creditz' ? 1.6 : kind === 'info' ? 0.9 : 1.1;
    this.pool.spawn({
      text,
      color,
      kind,
      world,
      height,
      life,
      dx: kind === 'xp' || kind === 'creditz' ? 0 : undefined,
    });
  }

  toast(text: string, color?: string): void {
    const id = this.seq++;
    this.toasts.value = [...this.toasts.value, { id, text, color }].slice(-MAX_TOASTS);
    this.sched.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((x) => x.id !== id);
    }, TOAST_MS);
  }

  private pickup(baseId: string, p: PlayerEntity | undefined): void {
    let item: ItemInstance | undefined;
    if (p) {
      const known = this.knownUids;
      item = playerItems(p).find((i) => i.base === baseId && (!known || !known.has(i.uid)));
    }
    const name = item ? itemName(item) : itemBaseName(baseId);
    const id = this.seq++;
    this.pickups.value = [
      ...this.pickups.value,
      { id, text: t('hud.pickup', { item: name }), color: qualityColor(item?.quality ?? 'normal') },
    ].slice(-MAX_PICKUPS);
    this.sched.setTimeout(() => {
      this.pickups.value = this.pickups.value.filter((x) => x.id !== id);
    }, PICKUP_MS);
  }

  private showBanner(b: Omit<Banner, 'id'>): void {
    // A boss intro or defeat outranks a level-up banner that's already showing.
    const cur = this.banner.value;
    if (cur && cur.kind !== 'levelUp' && b.kind === 'levelUp') return;
    if (b.kind !== 'levelUp') this.bannerLevels = 0;
    const id = this.seq++;
    this.banner.value = { ...b, id };
    if (this.bannerTimer) this.sched.clearTimeout(this.bannerTimer);
    this.bannerTimer = this.sched.setTimeout(() => {
      if (this.banner.value?.id === id) {
        this.banner.value = null;
        this.bannerLevels = 0;
      }
    }, BANNER_MS[b.kind]);
  }

  dispose(): void {
    if (this.bannerTimer) this.sched.clearTimeout(this.bannerTimer);
    this.pool.clear();
  }
}
