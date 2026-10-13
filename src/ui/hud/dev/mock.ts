/**
 * Mock UiApi for the HUD dev harness (dev/hud.html) and component smoke tests. Builds a fake
 * level, a Forse Adept with plausible stats, a pack of monsters and an NPC, and fires a scripted
 * stream of events on a timer so every HUD element shows up. Dev-only: never imported by the game.
 */
import { signal } from '@preact/signals';
import type { UiApi, UiStore, PanelId } from '../../types';
import type { Command } from '../../../core/sim/commands';
import type { GameEvent } from '../../../core/sim/events';
import type { WorldView } from '../../../core/sim/world';
import type { Entity, MonsterEntity, NpcEntity, PlayerEntity } from '../../../core/sim/entities';
import type { DerivedStats } from '../../../core/stats/types';
import type { ItemInstance } from '../../../core/items/types';
import type { GeneratedLevel, TileKind } from '../../../core/world/types';
import type { Settings } from '../../../core/save/types';
import type { DamageType, Vec2 } from '../../../core/types';
import type { SkillDef } from '../../../data/schema';
import { DB } from '../../../data/db';
import { registerNames } from '../../../data/names';
import { isoProject } from '../minimapMath';

// ---------------------------------------------------------------- fake content

const DEMO_SKILLS: [string, string, DamageType, SkillDef['kind'], number, number?][] = [
  ['plasmaBolt', 'Plasma Bolt', 'plasma', 'missile', 3],
  ['iceBolt', 'Ice Bolt', 'cryo', 'missile', 4],
  ['frostArmor', 'Frost Armor', 'cryo', 'buff', 7],
  ['sparkBolts', 'Spark Bolts', 'storm', 'multiMissile', 5],
  ['staticField', 'Static Field', 'storm', 'nova', 9],
  ['frostNova', 'Frost Nova', 'cryo', 'nova', 12],
  ['forseBlink', 'Forse Blink', 'magic', 'movement', 24],
  ['plasmaOrb', 'Plasma Orb', 'plasma', 'missile', 60, 0],
  ['starfall', 'Starfall', 'plasma', 'area', 30, 1.2],
];

export function installDemoContent(): void {
  const skills = DB.skills as Map<string, SkillDef>;
  const names: Record<string, string> = {};
  DEMO_SKILLS.forEach(([id, name, element, kind, cost, cd], i) => {
    names[`skill.${id}`] = name;
    if (skills.has(id)) return;
    skills.set(id, {
      id,
      classId: 'forseAdept',
      tree: `forseAdept.${element === 'plasma' ? 'plasma' : element === 'cryo' ? 'cryo' : 'storm'}`,
      name: `skill.${id}`,
      d2Analog: '',
      description: `skill.${id}`,
      kind,
      reqLevel: 1,
      prereqs: [],
      ui: { col: i % 3, row: Math.floor(i / 3), icon: id },
      maxHardPoints: 20,
      manaCost: cost,
      cooldownSec: cd,
      element,
      leftClickable: kind !== 'buff' && kind !== 'movement',
      vfx: '',
      anim: 'cast',
    });
  });
  names['mon.battleDroyd'] = 'Battle Droyd';
  names['mon.normtrooper'] = 'Normtrooper';
  names['mon.countDooky'] = 'Count Dooky';
  names['npc.yoduh'] = 'Master Yoduh';
  names['lvl.mossfields'] = 'Mossfields';
  registerNames(names);
}

function stats(lifeMax: number, manaMax: number, staminaMax = 100): DerivedStats {
  const el = { min: 0, max: 0 };
  return {
    strength: 15,
    dexterity: 25,
    vitality: 20,
    energy: 45,
    lifeMax,
    manaMax,
    staminaMax,
    lifeRegen: 0,
    manaRegenPerSec: 1,
    attackRating: 100,
    defense: 20,
    blockChance: 0,
    res: { plasma: 0, cryo: 0, storm: 0, toxin: 0 },
    physMin: 1,
    physMax: 4,
    elemental: { plasma: el, cryo: el, storm: el, toxin: el, magic: el },
    attackSpeedMul: 1,
    castSpeedMul: 1,
    hitRecoveryMul: 1,
    blockSpeedMul: 1,
    moveSpeedMul: 1,
    raw: {},
    skillBonus: { all: 0, byClass: {}, byTree: {}, bySkill: {} },
  };
}

let uidSeq = 1;
function item(base: string, quality: ItemInstance['quality'] = 'normal'): ItemInstance {
  return {
    uid: `u${uidSeq++}`,
    base,
    quality,
    ilvl: 5,
    affixes: [],
    mods: [],
    sockets: 0,
    socketed: [],
    identified: true,
  };
}

function makeLevel(): GeneratedLevel {
  const w = 72;
  const h = 72;
  const kinds: TileKind[] = new Array(w * h).fill('void');
  const walkable = new Uint8Array(w * h);
  const room = (x0: number, y0: number, rw: number, rh: number) => {
    for (let y = y0; y < y0 + rh; y++)
      for (let x = x0; x < x0 + rw; x++) {
        kinds[y * w + x] = 'floor';
        walkable[y * w + x] = 1;
      }
  };
  room(24, 24, 18, 16); // main hall
  room(6, 8, 14, 10);
  room(48, 6, 16, 14);
  room(50, 44, 14, 18);
  room(8, 46, 12, 14);
  room(30, 40, 4, 10); // corridors
  room(19, 12, 6, 3);
  room(41, 14, 8, 3);
  room(45, 14, 3, 12);
  room(14, 18, 3, 28);
  room(41, 34, 16, 3);
  room(56, 37, 3, 8);
  room(30, 50, 22, 3);
  for (let y = 26; y < 34; y++) {
    kinds[y * w + 60] = 'water';
  }
  kinds[50 * w + 12] = 'stairsDown';
  return {
    levelId: 'a1.mossfields',
    seed: 7,
    map: {
      width: w,
      height: h,
      kinds,
      variants: new Uint8Array(w * h),
      walkable,
      blocksMissiles: walkable.map((v) => 1 - v),
    },
    placements: [
      { kind: 'playerStart', pos: { x: 32, y: 32 } },
      { kind: 'waypoint', pos: { x: 28, y: 27 } },
      { kind: 'exit', pos: { x: 12, y: 50 }, ref: 'a1.tuskinDen' },
      { kind: 'exit', pos: { x: 56, y: 8 }, ref: 'a1.darkwood' },
    ],
    regions: [],
  };
}

function actorBase(id: number, pos: Vec2) {
  return {
    id,
    pos,
    facing: 0,
    radius: 0.4,
    alive: true,
    level: 7,
    mode: 'idle' as const,
    modeTime: 0,
    path: [],
    running: true,
    effects: [],
    buffs: [],
    cooldowns: {},
    statsDirty: false,
  };
}

function makePlayer(): PlayerEntity {
  const belt: (ItemInstance | null)[] = new Array(12).fill(null);
  belt[0] = item('baktaStim');
  belt[4] = item('baktaStim');
  belt[8] = item('baktaStim');
  belt[1] = item('baktaStim');
  belt[2] = item('energyCell');
  belt[6] = item('energyCell');
  belt[3] = item('rejuvStim');
  return {
    ...actorBase(1, { x: 33, y: 32 }),
    kind: 'player',
    defId: 'forseAdept',
    team: 'players',
    life: 168,
    mana: 141,
    stamina: 64,
    stats: stats(240, 190, 90),
    modelId: 'hero.forseAdept',
    classId: 'forseAdept',
    name: 'Padawon Pip',
    xp: 36000,
    creditz: 1234,
    statPointsUnspent: 5,
    skillPointsUnspent: 2,
    allocated: { strength: 0, dexterity: 0, vitality: 10, energy: 20 },
    skills: {
      plasmaBolt: 4,
      iceBolt: 2,
      frostArmor: 1,
      sparkBolts: 3,
      staticField: 1,
      frostNova: 1,
      forseBlink: 1,
      plasmaOrb: 1,
      starfall: 1,
    },
    leftSkill: 'plasmaBolt',
    rightSkill: 'frostNova',
    hotkeys: ['plasmaBolt', 'iceBolt', 'frostNova', 'staticField', 'forseBlink', 'frostArmor', null, null],
    equipment: {},
    inventory: { w: 10, h: 4, items: [] },
    belt: { rows: 3, cols: 4, slots: belt },
    respecs: { normal: 1, veteran: 1, legend: 1 },
    effects: [{ spec: { kind: 'toxin', durationSec: 8, magnitude: 20 }, remainingSec: 6 }],
    buffs: [{ id: 'frostArmor', level: 1, remainingSec: 95, mods: [] }],
  };
}

function makeMonster(
  id: number,
  defId: string,
  pos: Vec2,
  rank: MonsterEntity['rank'],
  mods: MonsterEntity['mods'] = [],
  nameKey?: string,
): MonsterEntity {
  const max = rank === 'boss' ? 2000 : rank === 'unique' ? 400 : rank === 'champion' ? 160 : 60;
  return {
    ...actorBase(id, pos),
    kind: 'monster',
    defId,
    team: 'monsters',
    life: max * (0.4 + (0.6 * ((id * 37) % 10)) / 10),
    mana: 0,
    stamina: 0,
    stats: stats(max, 0),
    modelId: `mon.${defId}`,
    rank,
    mods,
    nameKey,
    ai: {},
    home: pos,
  };
}

// ---------------------------------------------------------------- world view

class MockView implements WorldView {
  tick = 0;
  time = 0;
  difficulty = 'normal' as const;
  level: GeneratedLevel | null = makeLevel();
  localPlayerId: number | null = 1;
  paused = false;
  frameEvents: GameEvent[] = [];
  entities = new Map<number, Entity>();

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }
  all(): Iterable<Entity> {
    return this.entities.values();
  }
}

export interface MockHandle {
  api: UiApi;
  view: MockView;
  player: PlayerEntity;
  /** Advance the fake simulation by dt seconds (and fire scripted events). */
  step(dt: number, silent?: boolean): void;
  emit(events: GameEvent[]): void;
  commands: Command[];
  /** Pixels per tile used by worldToScreen (the harness backdrop uses the same). */
  tilePx: number;
  start(): void;
  stop(): void;
}

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
  movement: 'auto',
  showBuildGuide: false,
  showStatHints: false,
  lootFilter: 'all',
  screenShake: true,
  colorblind: 'none',
  textScale: 1,
  readAloud: false,
  quality: 'auto',
  sessionTimerMin: 0,
};

export function createMockApi(
  opts: { touch?: boolean; scripted?: boolean; autoplay?: boolean } = {},
): MockHandle {
  installDemoContent();
  const view = new MockView();
  const player = makePlayer();
  const npc: NpcEntity = {
    ...actorBase(2, { x: 28.5, y: 29 }),
    kind: 'npc',
    defId: 'yoduh',
    team: 'neutral',
    life: 100,
    mana: 0,
    stamina: 0,
    stats: stats(100, 0),
    modelId: 'npc.yoduh',
  };
  const ents: Entity[] = [
    player,
    npc,
    makeMonster(10, 'battleDroyd', { x: 37, y: 29 }, 'normal'),
    makeMonster(11, 'battleDroyd', { x: 38.5, y: 31 }, 'normal'),
    makeMonster(12, 'normtrooper', { x: 36, y: 35 }, 'normal'),
    makeMonster(13, 'battleDroyd', { x: 39, y: 33.5 }, 'champion', ['extraFast']),
    makeMonster(
      14,
      'normtrooper',
      { x: 40, y: 28 },
      'unique',
      ['extraFast', 'plasmaEnchanted'],
      'mon.normtrooper',
    ),
    makeMonster(15, 'countDooky', { x: 52, y: 50 }, 'boss', ['stormEnchanted'], 'mon.countDooky'),
  ];
  for (const e of ents) view.entities.set(e.id, e);

  const tilePx = 64;
  const frame = signal(0);
  const viewSig = signal<WorldView | null>(view);
  const openPanels = signal<PanelId[]>([]);
  const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
  const hovered = signal<number | null>(14);
  const listeners = new Set<(e: readonly GameEvent[]) => void>();
  const commands: Command[] = [];

  const store: UiStore = {
    frame,
    view: viewSig,
    openPanels,
    settings,
    hoveredEntity: hovered,
    interactNpc: signal(null),
    isTouch: signal(!!opts.touch),
    worldToScreen: (p, heightTiles = 0) => {
      if (typeof window === 'undefined') return { x: 0, y: 0 };
      const d = isoProject(p.x - player.pos.x, p.y - player.pos.y, tilePx * 2);
      return { x: window.innerWidth / 2 + d.x, y: window.innerHeight / 2 + d.y - heightTiles * tilePx * 0.8 };
    },
  };

  const api: UiApi = {
    store,
    dispatch(cmd) {
      commands.push(cmd);
      // Minimal echo so the harness reacts to clicks.
      if (cmd.type === 'selectSkill') player[cmd.hand === 'left' ? 'leftSkill' : 'rightSkill'] = cmd.skillId;
      if (cmd.type === 'bindHotkey') {
        const hk = [...player.hotkeys];
        if (cmd.skillId) for (let i = 0; i < hk.length; i++) if (hk[i] === cmd.skillId) hk[i] = null;
        hk[cmd.slot] = cmd.skillId;
        player.hotkeys = hk;
      }
      if (cmd.type === 'setRunning') player.running = cmd.running;
      if (cmd.type === 'useBeltSlot') {
        for (let r = player.belt.rows - 1; r >= 0; r--) {
          const i = r * 4 + cmd.index;
          if (player.belt.slots[i]) {
            const kind = player.belt.slots[i]!.base;
            player.belt.slots[i] = null;
            if (kind === 'baktaStim') player.life = Math.min(player.stats.lifeMax, player.life + 60);
            if (kind === 'energyCell') player.mana = Math.min(player.stats.manaMax, player.mana + 60);
            break;
          }
        }
      }
      frame.value++;
    },
    onEvents(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    togglePanel(id) {
      openPanels.value = openPanels.value.includes(id)
        ? openPanels.value.filter((p) => p !== id)
        : [...openPanels.value, id];
    },
    closeAllPanels() {
      openPanels.value = [];
    },
    updateSettings(patch) {
      settings.value = { ...settings.value, ...patch };
    },
  };

  const emit = (events: GameEvent[]) => {
    for (const l of listeners) l(events);
  };

  // Scripted show: a timeline that loops every 12 seconds.
  let t = 0;
  let nextHit = 0.3;
  let fired = new Set<string>();
  const once = (key: string, at: number, fn: () => void) => {
    if (t >= at && !fired.has(key)) {
      fired.add(key);
      fn();
    }
  };
  const monsters = [10, 11, 12, 13, 14];
  const dtypes: DamageType[] = ['plasma', 'cryo', 'storm', 'physical', 'toxin', 'magic'];
  let hitN = 0;

  const step = (dt: number, silent = false) => {
    t += dt;
    view.time += dt;
    view.tick++;
    const ev: GameEvent[] = [];
    // Pulse life/mana a little so the liquid moves.
    player.mana = Math.max(0, Math.min(player.stats.manaMax, player.mana + dt * 6 - (t % 3 < dt ? 22 : 0)));
    player.facing += dt * 0.6;
    for (const k of Object.keys(player.cooldowns)) {
      player.cooldowns[k] = Math.max(0, (player.cooldowns[k] ?? 0) - dt);
    }
    for (const e of player.effects) e.remainingSec = Math.max(0, e.remainingSec - dt);
    player.effects = player.effects.filter((e) => e.remainingSec > 0);
    for (const b of player.buffs) b.remainingSec -= dt;

    if (opts.scripted !== false && t >= nextHit) {
      nextHit = t + 0.45;
      const id = monsters[hitN % monsters.length]!;
      const m = view.get(id) as MonsterEntity;
      const crit = hitN % 5 === 3;
      const dtype = dtypes[hitN % dtypes.length]!;
      const amount = Math.round((crit ? 2.2 : 1) * (8 + ((hitN * 13) % 30)));
      m.life = Math.max(m.stats.lifeMax * 0.15, m.life - amount);
      ev.push({ type: 'damage', targetId: id, sourceId: 1, amount, dtype, crit, pos: { ...m.pos } });
      hitN++;
      if (hitN % 7 === 0) {
        ev.push({
          type: 'damage',
          targetId: 1,
          sourceId: id,
          amount: 9,
          dtype: 'physical',
          crit: false,
          pos: { ...player.pos },
        });
        player.life = Math.max(40, player.life - 9);
      }
      if (hitN % 6 === 0) ev.push({ type: 'xpGained', id: 1, amount: 45 });
      if (hitN % 4 === 0) player.cooldowns['starfall'] = 1.2;
    }
    once('toast', 1.0, () => ev.push({ type: 'toast', textKey: 'hud.waypoint' }));
    once('pick', 1.6, () => {
      const it = item('trainingLitesaber', 'magic');
      player.inventory.items.push({ item: it, x: 0, y: 0 });
      ev.push({ type: 'itemPickedUp', playerId: 1, baseId: 'trainingLitesaber' });
    });
    once('pick2', 2.2, () => {
      const it = item('crashSiteHelm', 'unique');
      player.inventory.items.push({ item: it, x: 2, y: 0 });
      ev.push({ type: 'itemPickedUp', playerId: 1, baseId: 'crashSiteHelm' });
    });
    once('creditz', 2.6, () =>
      ev.push({ type: 'itemPickedUp', playerId: 1, baseId: 'creditz', creditz: 120 }),
    );
    once('lvl', 3.0, () => {
      player.level = 8;
      ev.push({ type: 'levelUp', id: 1, level: 8 });
    });
    once('quest', 2.9, () =>
      ev.push({ type: 'questUpdated', questId: 'a1q1', step: 'clearDen', completed: true }),
    );
    once('chill', 4.0, () =>
      player.effects.push({ spec: { kind: 'chill', durationSec: 4 }, remainingSec: 4 }),
    );
    once('boss', 7.5, () => ev.push({ type: 'bossIntro', id: 15, lineKey: 'game.subtitle' }));
    if (t > 12) {
      t = 0;
      nextHit = 0.3;
      fired = new Set();
      player.level = 7;
      player.life = 168;
      player.inventory.items = [];
    }
    if (ev.length && !silent) emit(ev);
    frame.value++;
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (!timer && typeof window !== 'undefined') timer = setInterval(() => step(1 / 25), 40);
  };
  if (opts.scripted !== false && opts.autoplay !== false) start();
  return {
    api,
    view,
    player,
    step,
    emit,
    commands,
    tilePx,
    start,
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
