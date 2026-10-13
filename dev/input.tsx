/**
 * Dev harness for input devices + touch controls: a fake top-down world (2D canvas), a fake
 * InputContext/UiApi that logs every dispatched Command on screen and in `window.__cmds`.
 * Open /dev/input.html (add ?mode=tapToMove for tap-to-move, ?touch=0 to hide touch controls).
 */
import { render } from 'preact';
import { signal } from '@preact/signals';
import '../src/ui/theme.css';
import type { Command } from '../src/core/sim/commands';
import type { Entity, PlayerEntity } from '../src/core/sim/entities';
import type { WorldView } from '../src/core/sim/world';
import type { Settings } from '../src/core/save/types';
import type { EntityId, Vec2 } from '../src/core/types';
import type { ItemInstance } from '../src/core/items/types';
import type { ItemBaseDef, SkillDef } from '../src/data/schema';
import type { PanelId, UiApi } from '../src/ui/types';
import type { InputContext } from '../src/ui/input/types';
import { DB } from '../src/data/db';
import { t } from '../src/data/names';
import { createInputManager } from '../src/ui/input/manager';
import { TouchControls } from '../src/ui/touch/TouchControls';

// ------------------------------------------------------------------ fake content
const skills = DB.skills as Map<string, SkillDef>;
const devSkill = (id: string, element: SkillDef['element'], mana: number, cd?: number): SkillDef =>
  ({
    id,
    classId: 'yediKnight',
    tree: 'dev',
    name: `input.dev.skill.${id.replace('dev.', '')}`,
    d2Analog: '',
    description: '',
    kind: 'meleeAttack',
    reqLevel: 1,
    prereqs: [],
    ui: { col: 0, row: 0, icon: '' },
    maxHardPoints: 20,
    manaCost: mana,
    cooldownSec: cd,
    element,
    leftClickable: true,
    vfx: '',
    anim: 'attack1',
  }) as SkillDef;
for (const s of [
  devSkill('dev.slash', 'physical', 0),
  devSkill('dev.bolt', 'plasma', 3),
  devSkill('dev.leap', 'magic', 6, 2),
  devSkill('dev.nova', 'storm', 40),
  devSkill('dev.armor', 'cryo', 8, 4),
])
  if (!skills.has(s.id)) skills.set(s.id, s);

const items = DB.items as Map<string, ItemBaseDef>;
const devItem = (id: string, kind?: NonNullable<ItemBaseDef['use']>['kind']): ItemBaseDef =>
  ({
    id,
    name: `input.dev.item.${id.replace('dev.', '')}`,
    category: kind ? 'consumable' : 'weapon',
    slots: [],
    size: { w: 1, h: 1 },
    qlvl: 1,
    req: {},
    maxSockets: 0,
    cost: 1,
    use: kind ? { kind } : undefined,
    modelId: 'item.dev',
    icon: '',
  }) as ItemBaseDef;
for (const it of [
  devItem('dev.heal', 'heal'),
  devItem('dev.mana', 'mana'),
  devItem('dev.rejuv', 'rejuv'),
  devItem('dev.saber'),
])
  if (!items.has(it.id)) items.set(it.id, it);

let uid = 0;
const inst = (base: string, quality: ItemInstance['quality'] = 'normal'): ItemInstance => ({
  uid: `u${++uid}`,
  base,
  quality,
  ilvl: 1,
  affixes: [],
  mods: [],
  sockets: 0,
  socketed: [],
  identified: true,
});

// ------------------------------------------------------------------ fake world
const ents = new Map<EntityId, Entity>();
const player = {
  id: 1,
  kind: 'player',
  pos: { x: 0, y: 0 },
  facing: 0,
  radius: 0.4,
  alive: true,
  team: 'players',
  life: 80,
  mana: 30,
  mode: 'idle',
  cooldowns: {},
  skills: { 'dev.slash': 1, 'dev.bolt': 3, 'dev.leap': 1, 'dev.nova': 1, 'dev.armor': 2 },
  leftSkill: 'dev.slash',
  rightSkill: 'dev.bolt',
  hotkeys: ['dev.bolt', 'dev.leap', 'dev.nova', null, 'dev.armor', null, null, null],
  belt: {
    rows: 2,
    cols: 4,
    slots: [
      inst('dev.heal'),
      inst('dev.mana'),
      inst('dev.heal'),
      inst('dev.rejuv'),
      inst('dev.heal'),
      null,
      null,
      null,
    ],
  },
} as unknown as PlayerEntity;
ents.set(1, player);
const addMon = (id: number, x: number, y: number) =>
  ents.set(id, {
    id,
    kind: 'monster',
    pos: { x, y },
    facing: 0,
    radius: 0.45,
    alive: true,
    team: 'monsters',
    life: 10,
    mode: 'idle',
  } as unknown as Entity);
addMon(10, 3, 0.2);
addMon(11, -4, 3);
addMon(12, 1, -5);
ents.set(20, {
  id: 20,
  kind: 'npc',
  pos: { x: -3, y: -3 },
  facing: 0,
  radius: 0.45,
  alive: true,
  team: 'neutral',
  life: 1,
  mode: 'idle',
} as unknown as Entity);
ents.set(30, {
  id: 30,
  kind: 'groundItem',
  pos: { x: 1.5, y: -2.5 },
  facing: 0,
  radius: 0.3,
  alive: true,
  item: inst('dev.saber', 'unique'),
  droppedAtTick: 0,
} as unknown as Entity);

let tick = 0;
const view: WorldView = {
  get tick() {
    return tick;
  },
  get time() {
    return tick / 25;
  },
  difficulty: 'normal',
  level: null,
  localPlayerId: 1,
  paused: false,
  get: (id) => ents.get(id),
  all: () => ents.values(),
  frameEvents: [],
};

// ------------------------------------------------------------------ projection (top-down)
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;
const S = 40; // px per tile
const W = () => canvas.clientWidth;
const H = () => canvas.clientHeight;
const toScreen = (p: Vec2): { x: number; y: number } => ({
  x: W() / 2 + (p.x - player.pos.x) * S,
  y: H() / 2 + (p.y - player.pos.y) * S,
});
const toWorld = (px: number, py: number): Vec2 => ({
  x: player.pos.x + (px - W() / 2) / S,
  y: player.pos.y + (py - H() / 2) / S,
});

// ------------------------------------------------------------------ fake store / api
const params = new URLSearchParams(location.search);
const settings = signal<Settings>({
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
  movement: (params.get('mode') as Settings['movement']) ?? 'auto',
  showBuildGuide: true,
  showStatHints: true,
  lootFilter: 'all',
  screenShake: true,
  colorblind: 'none',
  textScale: 1,
  readAloud: false,
  quality: 'auto',
  sessionTimerMin: 0,
});
const openPanels = signal<PanelId[]>([]);
const log = signal<string[]>([]);
const cmds: Command[] = [];
(window as unknown as { __cmds: Command[] }).__cmds = cmds;
(window as unknown as { __player: PlayerEntity }).__player = player;

let moveDir: Vec2 = { x: 0, y: 0 };
let moveTo: Vec2 | null = null;
const fmt = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x));

function dispatch(cmd: Command): void {
  cmds.push(cmd);
  log.value = [fmt(cmd), ...log.value].slice(0, 14);
  switch (cmd.type) {
    case 'moveDir':
      moveDir = cmd.dir;
      moveTo = null;
      break;
    case 'moveTo':
      moveTo = cmd.pos;
      moveDir = { x: 0, y: 0 };
      break;
    case 'stop':
      moveDir = { x: 0, y: 0 };
      moveTo = null;
      break;
    case 'useSkill': {
      const def = DB.skills.get(cmd.skillId);
      const cost = typeof def?.manaCost === 'number' ? def.manaCost : 0;
      player.mana = Math.max(0, player.mana - cost);
      if (typeof def?.cooldownSec === 'number') player.cooldowns[cmd.skillId] = def.cooldownSec;
      const tgt = cmd.targetId != null ? ents.get(cmd.targetId)?.pos : cmd.targetPos;
      if (tgt) player.facing = Math.atan2(tgt.y - player.pos.y, tgt.x - player.pos.x);
      break;
    }
    case 'bindHotkey':
      player.hotkeys[cmd.slot] = cmd.skillId;
      break;
    case 'selectSkill':
      if (cmd.hand === 'left') player.leftSkill = cmd.skillId;
      else player.rightSkill = cmd.skillId;
      break;
    case 'useBeltSlot': {
      const b = player.belt;
      if (b.slots[cmd.index]) {
        for (let i = cmd.index; i < b.slots.length; i += b.cols) b.slots[i] = b.slots[i + b.cols] ?? null;
      }
      break;
    }
    default:
      break;
  }
}

const togglePanel = (id: PanelId) => {
  openPanels.value = openPanels.value.includes(id)
    ? openPanels.value.filter((p) => p !== id)
    : [...openPanels.value, id];
};

const frame = signal(0);
const api: UiApi = {
  store: {
    frame,
    view: signal<WorldView | null>(view),
    openPanels,
    settings,
    hoveredEntity: signal<EntityId | null>(null),
    interactNpc: signal<EntityId | null>(null),
    isTouch: signal(true),
    worldToScreen: (p) => toScreen(p),
  },
  dispatch,
  onEvents: () => () => {},
  togglePanel,
  closeAllPanels: () => (openPanels.value = []),
  updateSettings: (patch) => (settings.value = { ...settings.value, ...patch }),
};

const ctx: InputContext = {
  dispatch,
  pick(px, py) {
    let best: EntityId | null = null;
    let bestD = Infinity;
    for (const e of ents.values()) {
      if (e.kind === 'player') continue;
      const s = toScreen(e.pos);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < e.radius * S + 8 && d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    return best;
  },
  screenToWorld: (px, py) => toWorld(px, py),
  getSelectedSkills: () => ({ left: player.leftSkill, right: player.rightSkill, hotkeys: player.hotkeys }),
  togglePanel,
  isOverUi: () => false,
};

const showLabels = signal(false);
const input = createInputManager(canvas, ctx, {
  getView: () => view,
  onShowItemLabels: (s) => (showLabels.value = s),
  closeAllPanels: api.closeAllPanels,
});

// ------------------------------------------------------------------ overlay
function LogPanel() {
  return (
    <div
      data-testid="cmd-log"
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
        width: 'min(46vw, 380px)',
        padding: '8px 10px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--ui-border)',
        background: 'rgba(12,14,24,0.7)',
        font: '12px/1.35 ui-monospace, monospace',
        color: 'var(--ui-text)',
        zIndex: 5,
      }}
    >
      <div style={{ font: '700 13px var(--font-title)', color: 'var(--ui-border-hi)', marginBottom: 4 }}>
        {t('input.dev.title')} · {t('input.dev.mode')}: {settings.value.movement} · {t('input.dev.panels')}:{' '}
        {openPanels.value.join(',') || '-'}
      </div>
      {log.value.map((l, i) => (
        <div
          key={i}
          style={{
            opacity: 1 - i * 0.06,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

function App() {
  return (
    <>
      {params.get('touch') !== '0' && <TouchControls api={api} ctx={ctx} />}
      <LogPanel />
    </>
  );
}
render(<App />, uiRoot);

// ------------------------------------------------------------------ fake sim + draw
const g = canvas.getContext('2d')!;
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.update(dt);
  const speed = 4;
  if (moveDir.x || moveDir.y) {
    player.pos = { x: player.pos.x + moveDir.x * speed * dt, y: player.pos.y + moveDir.y * speed * dt };
    player.facing = Math.atan2(moveDir.y, moveDir.x);
  } else if (moveTo) {
    const dx = moveTo.x - player.pos.x;
    const dy = moveTo.y - player.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) moveTo = null;
    else {
      const k = Math.min(1, (speed * dt) / d);
      player.pos = { x: player.pos.x + dx * k, y: player.pos.y + dy * k };
      player.facing = Math.atan2(dy, dx);
    }
  }
  for (const k of Object.keys(player.cooldowns))
    player.cooldowns[k] = Math.max(0, (player.cooldowns[k] ?? 0) - dt);
  player.mana = Math.min(60, player.mana + dt * 2);
  tick++;
  frame.value = tick;
  draw();
  requestAnimationFrame(loop);
}

function draw() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(W() * dpr)) {
    canvas.width = Math.round(W() * dpr);
    canvas.height = Math.round(H() * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#16202a';
  g.fillRect(0, 0, W(), H());
  g.strokeStyle = 'rgba(120,160,120,0.15)';
  g.lineWidth = 1;
  const o = toScreen({ x: 0, y: 0 });
  for (let x = ((o.x % S) + S) % S; x < W(); x += S) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H());
    g.stroke();
  }
  for (let y = ((o.y % S) + S) % S; y < H(); y += S) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W(), y);
    g.stroke();
  }
  const colors: Record<string, string> = {
    player: '#d9c8a0',
    monster: '#c8323c',
    npc: '#3fd16b',
    groundItem: '#c8a464',
  };
  for (const e of ents.values()) {
    const s = toScreen(e.pos);
    g.fillStyle = colors[e.kind] ?? '#888';
    g.beginPath();
    if (e.kind === 'groundItem') g.rect(s.x - 8, s.y - 4, 16, 8);
    else g.arc(s.x, s.y, e.radius * S, 0, Math.PI * 2);
    g.fill();
    if (e.kind === 'groundItem' && showLabels.value) {
      g.fillStyle = '#c8a464';
      g.font = '13px sans-serif';
      g.fillText(t(DB.items.get((e as { item: ItemInstance }).item.base)?.name ?? ''), s.x - 30, s.y - 10);
    }
  }
  const p = toScreen(player.pos);
  g.strokeStyle = '#4fc3ff';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(p.x, p.y);
  g.lineTo(p.x + Math.cos(player.facing) * 26, p.y + Math.sin(player.facing) * 26);
  g.stroke();
}
requestAnimationFrame(loop);
