/**
 * HudModel: turns the per-frame WorldView into a handful of small, value-deduplicated signals.
 * Components subscribe to these instead of `store.frame`, so a frame where nothing visible
 * changed re-renders nothing. Arrays/objects are only replaced when their content key changes.
 */
import { batch, effect, signal, type Signal } from '@preact/signals';
import type { UiStore } from '../types';
import type { ActiveEffect, MonsterEntity, PlayerEntity } from '../../core/sim/entities';
import type { WorldView } from '../../core/sim/world';
import type { EntityId } from '../../core/types';
import { quantize, ratio } from './format';
import { xpProgress } from './xp';
import { consumableKind, entityName, itemName, resourceName, type ConsumableKind } from './lookup';

export interface StatusItem {
  key: string;
  buff: boolean;
  /** Effect kind or buff (skill) id. */
  id: string;
  remaining: number;
  /** 0..1 remaining fraction for the ring (1 for permanent). */
  frac: number;
}

export interface BeltCol {
  col: number;
  base: string | null;
  name: string;
  kind: ConsumableKind;
  count: number;
  rows: number;
}

export interface TargetInfo {
  id: EntityId;
  kind: 'monster' | 'npc' | 'merc' | 'player';
  name: string;
  rank?: MonsterEntity['rank'];
  mods: string[];
  lifeFrac: number;
}

/** Remembers the largest remaining value seen per key to turn "remaining" into a fraction. */
export class MaxTracker {
  private max = new Map<string, number>();

  frac(key: string, remaining: number, nominal = 0): number {
    if (!Number.isFinite(remaining)) return 1;
    if (remaining <= 0) {
      this.max.delete(key);
      return 0;
    }
    let m = this.max.get(key) ?? 0;
    if (remaining > m) m = remaining;
    if (nominal > m) m = nominal;
    this.max.set(key, m);
    return m > 0 ? remaining / m : 0;
  }

  prune(alive: Set<string>): void {
    for (const k of this.max.keys()) if (!alive.has(k)) this.max.delete(k);
  }
}

/** Write a signal only if the derived key changed (for arrays/objects). */
function setKeyed<T>(sig: Signal<T>, keys: Map<Signal<unknown>, string>, value: T, key: string): void {
  if (keys.get(sig as Signal<unknown>) === key) return;
  keys.set(sig as Signal<unknown>, key);
  sig.value = value;
}

export class HudModel {
  readonly hasPlayer = signal(false);
  readonly life = signal(0);
  readonly lifeMax = signal(1);
  readonly mana = signal(0);
  readonly manaMax = signal(1);
  readonly stamina = signal(0);
  readonly staminaMax = signal(1);
  readonly running = signal(true);
  readonly level = signal(1);
  readonly xpFrac = signal(0);
  readonly xpCur = signal(0);
  readonly xpSpan = signal(0);
  readonly xpMaxed = signal(false);
  readonly statPoints = signal(0);
  readonly skillPoints = signal(0);
  readonly resource = signal('');
  readonly leftSkill = signal('');
  readonly rightSkill = signal('');
  readonly hotkeys = signal<(string | null)[]>([]);
  /** skillId -> remaining cooldown fraction (only skills currently cooling down). */
  readonly cooldowns = signal<Record<string, number>>({});
  /** Hard points per skill (for mana-cost lookups). */
  readonly skillLevels = signal<Record<string, number>>({});
  readonly status = signal<StatusItem[]>([]);
  readonly belt = signal<BeltCol[]>([]);
  readonly target = signal<TargetInfo | null>(null);
  readonly levelKey = signal('');
  readonly paused = signal(false);

  private keys = new Map<Signal<unknown>, string>();
  private cd = new MaxTracker();
  private st = new MaxTracker();
  private dispose: (() => void) | null = null;

  constructor(private store: UiStore) {}

  start(): () => void {
    this.dispose = effect(() => {
      void this.store.frame.value;
      const view = this.store.view.value;
      const hovered = this.store.hoveredEntity.value;
      batch(() => this.sync(view, hovered));
    });
    return () => this.stop();
  }

  stop(): void {
    this.dispose?.();
    this.dispose = null;
  }

  player(): PlayerEntity | undefined {
    const view = this.store.view.peek();
    if (!view || view.localPlayerId == null) return undefined;
    const p = view.get(view.localPlayerId);
    return p?.kind === 'player' ? (p as PlayerEntity) : undefined;
  }

  /** Exposed for tests/harness: derive everything from a view. */
  sync(view: WorldView | null, hovered: EntityId | null): void {
    const p = view && view.localPlayerId != null ? view.get(view.localPlayerId) : undefined;
    const lvlKey = view?.level ? `${view.level.levelId}#${view.level.seed}` : '';
    if (this.levelKey.value !== lvlKey) this.levelKey.value = lvlKey;
    this.paused.value = !!view?.paused;
    if (!p || p.kind !== 'player') {
      this.hasPlayer.value = false;
      this.target.value = null;
      return;
    }
    this.hasPlayer.value = true;
    this.life.value = Math.max(0, Math.ceil(p.life));
    this.lifeMax.value = Math.max(1, Math.round(p.stats.lifeMax));
    this.mana.value = Math.max(0, Math.floor(p.mana));
    this.manaMax.value = Math.max(1, Math.round(p.stats.manaMax));
    this.stamina.value = quantize(ratio(p.stamina, p.stats.staminaMax), 100);
    this.staminaMax.value = Math.max(1, Math.round(p.stats.staminaMax));
    this.running.value = p.running;
    this.level.value = p.level;
    const xp = xpProgress(p.level, p.xp);
    this.xpFrac.value = quantize(xp.frac, 500);
    this.xpCur.value = Math.floor(xp.cur);
    this.xpSpan.value = xp.span;
    this.xpMaxed.value = xp.maxed;
    this.statPoints.value = p.statPointsUnspent;
    this.skillPoints.value = p.skillPointsUnspent;
    this.resource.value = resourceName(p);
    this.leftSkill.value = p.leftSkill;
    this.rightSkill.value = p.rightSkill;
    setKeyed(this.hotkeys, this.keys, [...p.hotkeys], p.hotkeys.join('|'));
    setKeyed(this.skillLevels, this.keys, { ...p.skills }, JSON.stringify(p.skills));

    // Cooldowns (quantized to 1/40 so the sweep animates smoothly but cheaply).
    const cds: Record<string, number> = {};
    let cdKey = '';
    const alive = new Set<string>();
    for (const [id, rem] of Object.entries(p.cooldowns)) {
      if (!(rem > 0)) {
        this.cd.frac(id, 0);
        continue;
      }
      alive.add(id);
      const f = quantize(this.cd.frac(id, rem), 40);
      cds[id] = f;
      cdKey += `${id}:${f};`;
    }
    this.cd.prune(alive);
    setKeyed(this.cooldowns, this.keys, cds, cdKey);

    this.syncStatus(p);
    this.syncBelt(p);
    this.syncTarget(view!, p, hovered);
  }

  private syncStatus(p: PlayerEntity): void {
    // Group debuffs by kind (strongest remaining wins), buffs by id.
    const byKind = new Map<string, ActiveEffect>();
    for (const e of p.effects) {
      const prev = byKind.get(e.spec.kind);
      if (!prev || e.remainingSec > prev.remainingSec) byKind.set(e.spec.kind, e);
    }
    const items: StatusItem[] = [];
    const alive = new Set<string>();
    for (const [kind, e] of byKind) {
      const key = `fx:${kind}`;
      alive.add(key);
      items.push({
        key,
        buff: false,
        id: kind,
        remaining: e.remainingSec,
        frac: quantize(this.st.frac(key, e.remainingSec, e.spec.durationSec), 24),
      });
    }
    for (const b of p.buffs) {
      const key = `buff:${b.id}`;
      alive.add(key);
      items.push({
        key,
        buff: true,
        id: b.id,
        remaining: b.remainingSec,
        frac: quantize(this.st.frac(key, b.remainingSec), 24),
      });
    }
    this.st.prune(alive);
    // Debuffs first (more urgent), then buffs.
    const k = items
      .map(
        (s) =>
          `${s.key}:${Number.isFinite(s.remaining) ? Math.ceil(s.remaining * (s.remaining < 1 ? 10 : 1)) : 'inf'}:${s.frac}`,
      )
      .join(';');
    setKeyed(this.status, this.keys, items, k);
  }

  private syncBelt(p: PlayerEntity): void {
    const cols: BeltCol[] = [];
    const rows = Math.max(1, p.belt.rows);
    let key = `${rows};`;
    for (let c = 0; c < 4; c++) {
      let count = 0;
      let top: (typeof p.belt.slots)[number] = null;
      for (let r = 0; r < rows; r++) {
        const it = p.belt.slots[r * 4 + c] ?? null;
        if (it) {
          count += Math.max(1, it.quantity ?? 1);
          if (!top) top = it;
        }
      }
      const base = top?.base ?? null;
      cols.push({
        col: c,
        base,
        name: top ? itemName(top) : '',
        kind: base ? consumableKind(base) : 'other',
        count,
        rows,
      });
      key += `${base}:${count};`;
    }
    setKeyed(this.belt, this.keys, cols, key);
  }

  private syncTarget(view: WorldView, p: PlayerEntity, hovered: EntityId | null): void {
    let id = hovered ?? null;
    let e = id != null ? view.get(id) : undefined;
    if (!e || e.kind === 'player' || !('life' in e)) {
      id = p.targetId ?? null;
      e = id != null ? view.get(id) : undefined;
    }
    if (!e || !e.alive || (e.kind !== 'monster' && e.kind !== 'npc' && e.kind !== 'merc')) {
      setKeyed(this.target, this.keys, null, '');
      return;
    }
    if (e.kind === 'monster' && e.life <= 0) {
      setKeyed(this.target, this.keys, null, '');
      return;
    }
    const lifeFrac = quantize(ratio(e.life, e.stats.lifeMax), 200);
    const info: TargetInfo = {
      id: e.id,
      kind: e.kind,
      name: entityName(e),
      rank: e.kind === 'monster' ? e.rank : undefined,
      mods: e.kind === 'monster' ? [...e.mods] : [],
      lifeFrac,
    };
    setKeyed(
      this.target,
      this.keys,
      info,
      `${e.id}:${info.name}:${info.rank}:${info.mods.join(',')}:${lifeFrac}`,
    );
  }
}
