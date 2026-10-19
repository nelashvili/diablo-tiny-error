/** Pure helpers for render/models (no Three.js): id classification, clip resolution, procedural poses. */
import type { ActorMode } from '../../core/sim/entities';

export type ModelKind =
  'hero' | 'droyd' | 'creature' | 'npc' | 'object' | 'item' | 'tile' | 'prop' | 'unknown';

export interface ModelInfo {
  kind: ModelKind;
  /** Id without the prefix (`hero.yediKnight` -> `yediKnight`). */
  name: string;
  tileset?: string;
  tileKind?: string;
}

const DROYD_RE = /(droy?d|droid|robot|turret|mech)/i;

export function classifyModelId(id: string): ModelInfo {
  const dot = id.indexOf('.');
  const prefix = dot < 0 ? id : id.slice(0, dot);
  const name = dot < 0 ? '' : id.slice(dot + 1);
  switch (prefix) {
    case 'hero':
      return { kind: 'hero', name };
    case 'mon':
      return { kind: DROYD_RE.test(name) ? 'droyd' : 'creature', name };
    case 'npc':
      return { kind: DROYD_RE.test(name) ? 'droyd' : 'npc', name };
    case 'obj':
      return { kind: 'object', name };
    case 'item':
      return { kind: 'item', name };
    case 'prop':
      return { kind: 'prop', name };
    case 'tile': {
      const rest = name.split('.');
      return { kind: 'tile', name, tileset: rest[0] ?? '', tileKind: rest.slice(1).join('.') };
    }
    default:
      return { kind: 'unknown', name: id };
  }
}

export type ItemKind =
  | 'litesaber'
  | 'blade'
  | 'blaster'
  | 'rifle'
  | 'spear'
  | 'javelin'
  | 'staff'
  | 'axe'
  | 'baton'
  | 'disc'
  | 'focus'
  | 'helm'
  | 'hood'
  | 'mask'
  | 'armor'
  | 'suit'
  | 'shield'
  | 'boots'
  | 'gloves'
  | 'belt'
  | 'ring'
  | 'amulet'
  | 'potion'
  | 'scroll'
  | 'gem'
  | 'generic';

const ITEM_RULES: [RegExp, ItemKind][] = [
  [/(itesaber|ightsaber|lightsabre)/i, 'litesaber'],
  [/(rifle|carbine|sniper|cannon)/i, 'rifle'],
  [/(blast|gun|pistol)/i, 'blaster'],
  [/(staff|stave|rod|wand)/i, 'staff'],
  [/javelin/i, 'javelin'],
  [/(spear|pike|lance)/i, 'spear'],
  [/(axe|hatchet)/i, 'axe'],
  [/(baton|stick|mace|club)/i, 'baton'],
  [/(disc|disk)/i, 'disc'],
  [/focus/i, 'focus'],
  [/(sword|blade|vibro|knife|dagger)/i, 'blade'],
  [/(hood|cowl)/i, 'hood'],
  [/(flight ?suit|exosuit|hypersuit|flightSuit|flightExosuit|flightHypersuit)/i, 'suit'],
  [/mask/i, 'mask'],
  [/(helm|hat|cap|crown|circlet|visor)/i, 'helm'],
  [/(shield|buckler|deflector)/i, 'shield'],
  [/(boot|shoe|greave)/i, 'boots'],
  [/(glove|gaunt|mitt|bracer)/i, 'gloves'],
  [/(belt|sash)/i, 'belt'],
  [/(ring|band)/i, 'ring'],
  [/(amulet|necklace|pendant|talisman)/i, 'amulet'],
  [/(armor|armour|robe|vest|plate|chest|tunic|jacket|mail)/i, 'armor'],
  [/(potion|vial|stim|flask|elixir|medpac)/i, 'potion'],
  [/(scroll|tome|book|holocron|datapad)/i, 'scroll'],
  [/(gem|jewel|crystal|orb|rune|kyber|coin|gold)/i, 'gem'],
];

export function classifyItem(name: string): ItemKind {
  const n = name.startsWith('item.') ? name.slice(5) : name;
  for (const [re, kind] of ITEM_RULES) if (re.test(n)) return kind;
  return 'generic';
}

/**
 * Model id for a weapon by its class (item names vary too much to classify by name).
 * Blasters map to catalog entries with real glTF models; the rest classify via ITEM_RULES.
 */
export const WEAPON_MODEL_IDS: Record<string, string> = {
  litesaber: 'item.litesaber',
  doubleLitesaber: 'item.doubleLitesaber',
  blasturPistol: 'item.blastur.pistol',
  blasturRifle: 'item.blastur.rifle',
  forseStaff: 'item.forseStaff',
  vibroAxe: 'item.vibroAxe',
  shockBaton: 'item.shockBaton',
  vibroPike: 'item.vibroPike',
  throwingDisc: 'item.throwingDisc',
  javelin: 'item.javelin',
  kyburFocus: 'item.kyburFocus',
};

/** Weapon classes whose basic attack is a shot/throw (render plays the ranged clip). */
export const RANGED_WEAPON_CLASSES = new Set(['blasturPistol', 'blasturRifle', 'javelin', 'throwingDisc']);

export function isLitesaberId(id: string): boolean {
  return /(itesaber|ightsaber)/i.test(id);
}

export function isDoubleSaberId(id: string): boolean {
  return isLitesaberId(id) && /(double|dual|twin)/i.test(id);
}

// ------------------------------------------------------------------ clip resolution

const CLIP_ALIASES: Record<ActorMode, string[]> = {
  idle: ['idle', 'stand', 'breathing', 'rest'],
  walk: ['walk', 'walking'],
  run: ['run', 'running', 'sprint', 'jog'],
  attack: ['attack', 'slash', 'swing', 'melee', 'punch', 'strike'],
  cast: ['cast', 'spell', 'magic', 'interact', 'wave'],
  throw: ['throw', 'shoot', 'fire'],
  hit: ['hit', 'hurt', 'damage', 'flinch', 'gethit', 'hitreact'],
  block: ['block', 'defend', 'guard'],
  stunned: ['stun', 'dizzy', 'stunned'],
  frozen: ['frozen', 'idle'],
  dying: ['death', 'die', 'dying', 'dead', 'defeat', 'fall'],
  dead: ['death', 'dead', 'die', 'dying', 'defeat'],
};

const MODE_FALLBACK: Record<ActorMode, ActorMode[]> = {
  idle: [],
  walk: ['run', 'idle'],
  run: ['walk', 'idle'],
  attack: ['cast', 'throw', 'idle'],
  cast: ['attack', 'idle'],
  throw: ['attack', 'cast', 'idle'],
  hit: ['idle'],
  block: ['hit', 'idle'],
  stunned: ['hit', 'idle'],
  frozen: ['idle'],
  dying: ['dead', 'hit', 'idle'],
  dead: ['dying', 'hit', 'idle'],
};

export const ALL_MODES: readonly ActorMode[] = [
  'idle',
  'walk',
  'run',
  'attack',
  'cast',
  'throw',
  'hit',
  'block',
  'stunned',
  'frozen',
  'dying',
  'dead',
];

/** Normalize a clip name: drop armature prefixes (`Armature|Idle`), lowercase, letters only. */
export function normalizeClipName(name: string): string {
  const seg = name.split(/[|/]/).pop() ?? name;
  return seg.toLowerCase().replace(/[^a-z]/g, '');
}

function matchAlias(alias: string, norm: Map<string, string>): string | null {
  const a = normalizeClipName(alias);
  const exact = norm.get(a);
  if (exact !== undefined) return exact;
  for (const [n, orig] of norm) if (n.startsWith(a)) return orig;
  for (const [n, orig] of norm) if (n.includes(a)) return orig;
  return null;
}

/**
 * Pick the clip name to play for a mode. Explicit `map` entries win, then common names
 * (Idle/Walk/Run/Attack/Cast/Hit/Death...), then a fallback chain of related modes.
 * Returns null when no clip is suitable.
 */
export function resolveClip(
  mode: ActorMode,
  available: readonly string[],
  map?: Partial<Record<string, string>>,
): string | null {
  if (available.length === 0) return null;
  const set = new Set(available);
  const norm = new Map<string, string>();
  for (const n of available) {
    const k = normalizeClipName(n);
    if (!norm.has(k)) norm.set(k, n);
  }
  for (const m of [mode, ...MODE_FALLBACK[mode]]) {
    const explicit = map?.[m];
    if (explicit !== undefined && set.has(explicit)) return explicit;
    for (const alias of CLIP_ALIASES[m]) {
      const hit = matchAlias(alias, norm);
      if (hit !== null) return hit;
    }
  }
  return null;
}

/** True when the clip for this mode loops; false = play once (dying/dead hold the last frame). */
export function modeLoops(mode: ActorMode): boolean {
  switch (mode) {
    case 'idle':
    case 'walk':
    case 'run':
    case 'stunned':
    case 'frozen':
      return true;
    default:
      return false;
  }
}

/** Resolve a catalog url to a fetchable path (`models/x.glb` -> `/assets/models/x.glb`). */
export function resolveAssetUrl(url: string): string {
  if (
    /^(https?:)?\/\//.test(url) ||
    url.startsWith('/') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  ) {
    return url;
  }
  if (url.startsWith('assets/')) return '/' + url;
  return '/assets/' + url;
}

// ------------------------------------------------------------------ procedural pose

export interface Pose {
  /** Hips vertical offset. */
  bob: number;
  /** Hips pitch (+ = lean forward). */
  lean: number;
  /** Hips yaw twist. */
  twist: number;
  /** Whole-body roll (z). */
  roll: number;
  /** Whole-body vertical sink (>=0 = down). */
  sink: number;
  /** Vertical breathing scale delta. */
  breathe: number;
  /** Limb rotations about X (negative = swing forward/up). */
  armR: number;
  armL: number;
  legR: number;
  legL: number;
  /** Overall scale multiplier (dying shrink). */
  scale: number;
}

export function makePose(): Pose {
  return {
    bob: 0,
    lean: 0,
    twist: 0,
    roll: 0,
    sink: 0,
    breathe: 0,
    armR: 0,
    armL: 0,
    legR: 0,
    legL: 0,
    scale: 1,
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const ATTACK_BASE_SEC = 0.55;

/**
 * Fill `out` with a procedural pose for a mode. No allocations. `t` = seconds in mode,
 * `speedMul` speeds the animation (IAS/FCR/walk speed).
 */
export function computePose(mode: ActorMode, t: number, speedMul: number, out: Pose): Pose {
  const sp = speedMul > 0 ? speedMul : 1;
  out.bob = 0;
  out.lean = 0;
  out.twist = 0;
  out.roll = 0;
  out.sink = 0;
  out.breathe = 0;
  out.armR = -0.25;
  out.armL = -0.25;
  out.legR = 0;
  out.legL = 0;
  out.scale = 1;
  const ts = t * sp;
  switch (mode) {
    case 'idle': {
      const b = Math.sin(t * 2.2);
      out.breathe = b * 0.018;
      out.armR = -0.2 + b * 0.04;
      out.armL = -0.2 - b * 0.04;
      break;
    }
    case 'walk':
    case 'run': {
      const run = mode === 'run';
      const ph = ts * (run ? 11 : 7.5);
      const s = Math.sin(ph);
      const swing = run ? 0.95 : 0.6;
      out.legR = s * swing;
      out.legL = -s * swing;
      out.armR = -0.2 - s * swing * 0.9;
      out.armL = -0.2 + s * swing * 0.9;
      out.bob = Math.abs(Math.cos(ph)) * (run ? 0.07 : 0.04);
      out.lean = run ? 0.18 : 0.05;
      out.twist = s * 0.08;
      break;
    }
    case 'attack': {
      const p = clamp01(ts / ATTACK_BASE_SEC);
      if (p < 0.35) {
        const k = smooth(p / 0.35);
        out.armR = lerp(-0.25, -2.7, k);
        out.armL = lerp(-0.25, -0.9, k);
        out.twist = lerp(0, 0.5, k);
        out.lean = lerp(0, -0.12, k);
      } else if (p < 0.6) {
        const k = (p - 0.35) / 0.25;
        out.armR = lerp(-2.7, 0.2, k * k);
        out.armL = lerp(-0.9, -0.3, k);
        out.twist = lerp(0.5, -0.6, k);
        out.lean = lerp(-0.12, 0.3, k);
      } else {
        const k = smooth((p - 0.6) / 0.4);
        out.armR = lerp(0.2, -0.25, k);
        out.armL = lerp(-0.3, -0.25, k);
        out.twist = lerp(-0.6, 0, k);
        out.lean = lerp(0.3, 0, k);
      }
      out.legR = -0.3;
      out.legL = 0.3;
      break;
    }
    case 'throw': {
      const p = clamp01(ts / (ATTACK_BASE_SEC * 0.9));
      if (p < 0.4) {
        const k = smooth(p / 0.4);
        out.armR = lerp(-0.25, -2.4, k);
        out.twist = k * 0.4;
      } else if (p < 0.6) {
        const k = (p - 0.4) / 0.2;
        out.armR = lerp(-2.4, -0.1, k);
        out.twist = lerp(0.4, -0.2, k);
        out.lean = 0.2 * k;
      } else {
        const k = smooth((p - 0.6) / 0.4);
        out.armR = lerp(-0.1, -0.25, k);
        out.twist = lerp(-0.2, 0, k);
        out.lean = 0.2 * (1 - k);
      }
      break;
    }
    case 'cast': {
      const p = clamp01(ts / (ATTACK_BASE_SEC * 1.2));
      const up = p < 0.5 ? smooth(p / 0.5) : 1 - smooth((p - 0.7) / 0.3) * 0.7;
      out.armR = lerp(-0.25, -2.5, up);
      out.armL = lerp(-0.25, -2.5, up);
      out.bob = up * 0.05;
      out.lean = -0.1 * up;
      out.breathe = Math.sin(ts * 14) * 0.01 * up;
      break;
    }
    case 'hit': {
      const p = clamp01(ts / 0.35);
      const k = Math.sin(p * Math.PI);
      out.lean = -0.4 * k;
      out.bob = -0.03 * k;
      out.armR = -0.25 + 0.6 * k;
      out.armL = -0.25 + 0.6 * k;
      out.roll = 0.08 * k;
      break;
    }
    case 'block': {
      out.armR = -1.3;
      out.armL = -1.3;
      out.lean = -0.08;
      out.twist = 0.15;
      break;
    }
    case 'stunned': {
      const w = Math.sin(ts * 9);
      out.roll = w * 0.12;
      out.lean = -0.1;
      out.armR = -0.6 + w * 0.2;
      out.armL = -0.6 - w * 0.2;
      out.twist = w * 0.2;
      break;
    }
    case 'frozen': {
      out.armR = -0.35;
      out.armL = -0.35;
      out.lean = -0.04;
      break;
    }
    case 'dying':
    case 'dead': {
      const p = mode === 'dead' ? 1 : clamp01(ts / 0.9);
      const k = smooth(p);
      out.lean = -1.1 * k;
      out.sink = 0.25 * k;
      out.roll = 0.3 * k;
      out.armR = lerp(-0.25, 0.6, k);
      out.armL = lerp(-0.25, 0.6, k);
      out.scale = 1 - 0.25 * k;
      break;
    }
  }
  return out;
}
