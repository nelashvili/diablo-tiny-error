/** Pure GameEvent → sound-cue mapping. */
import type { GameEvent } from '../core/sim/events';
import type { DamageType } from '../core/types';

export interface Cue {
  /** Candidate ids in preference order; catalog files are tried first, the last must be procedural. */
  ids: string[];
  volume?: number;
  rate?: number;
  pos?: { x: number; y: number };
  /** An enemy's attack (capped per batch as a group). */
  hostile?: boolean;
}

export type SkillSound = 'saber' | 'blastur' | 'storm' | 'plasma' | 'cryo' | 'toxin' | 'magic';

/** Guess a sound family from a skill id when no explicit sound exists. */
export function elementForSkill(skillId: string): SkillSound {
  const s = skillId.toLowerCase();
  if (/saber|slash|strike|cleave|whirl|leap|smash|bash|thrust|swing|slice/.test(s)) return 'saber';
  if (/blast|shot|snipe|pistol|rifle|volley|pew/.test(s)) return 'blastur';
  if (/storm|lightning|shock|thunder|spark|zap|arc/.test(s)) return 'storm';
  if (/plasma|fire|flame|burn|inferno|meteor/.test(s)) return 'plasma';
  if (/cryo|frost|ice|freeze|cold|chill|blizzard/.test(s)) return 'cryo';
  if (/toxin|poison|venom|acid|bile|gas/.test(s)) return 'toxin';
  return 'magic';
}

const SKILL_SOUND: Record<SkillSound, string> = {
  saber: 'saberVwoom',
  blastur: 'blasturClassic',
  storm: 'lightning',
  plasma: 'plasma',
  cryo: 'cryo',
  toxin: 'toxin',
  magic: 'forse',
};

/** Recorded clips (with their own variants) to prefer over the procedural sound, per family. */
const SKILL_FILE: Partial<Record<SkillSound, string>> = {
  // Sabers and blasturs use synthesized movie-style sounds (saberVwoom, blasturClassic), not the
  // generic recorded whooshes/shots.
};

export function soundForSkill(skillId: string): string {
  return SKILL_SOUND[elementForSkill(skillId)];
}

/** Candidate ids for a skill's cast sound: its own clip, the family's recordings, then procedural. */
export function skillSoundIds(skillId: string): string[] {
  const fam = elementForSkill(skillId);
  const file = SKILL_FILE[fam];
  return [`skill.${skillId}`, ...(file ? [file] : []), SKILL_SOUND[fam]];
}

function hitCue(dtype: DamageType, crit: boolean, pos: { x: number; y: number }): Cue {
  const v = crit ? 1 : 0.7;
  const r = crit ? 0.85 : 1;
  switch (dtype) {
    case 'physical':
      return { ids: ['hit.physical', 'hit'], volume: v, rate: r, pos };
    case 'plasma':
      return { ids: ['hit.plasma', 'plasma'], volume: v * 0.5, rate: 1.3 * r, pos };
    case 'cryo':
      return { ids: ['hit.cryo', 'cryo'], volume: v * 0.5, rate: 1.4 * r, pos };
    case 'storm':
      return { ids: ['hit.storm', 'lightning'], volume: v * 0.5, rate: 1.2 * r, pos };
    case 'toxin':
      return { ids: ['hit.toxin', 'toxin'], volume: v * 0.55, rate: 1.1 * r, pos };
    default:
      return { ids: ['hit.magic', 'forse'], volume: v * 0.5, rate: 1.2 * r, pos };
  }
}

export const ITEM_QUALITIES = ['normal', 'magic', 'rare', 'set', 'unique'] as const;

export function itemDropIds(quality: string): string[] {
  const q = quality.toLowerCase();
  const proc = (ITEM_QUALITIES as readonly string[]).includes(q) ? q : q === 'crafted' ? 'rare' : 'normal';
  return q === proc ? [`itemDrop.${q}`] : [`itemDrop.${q}`, `itemDrop.${proc}`];
}

/** Melee swings by weapon: light (daggers, fists, throws), medium, heavy (pikes, staves), vibro, shock. */
export type SwingSound = 'swingLight' | 'swingMedium' | 'swingHeavy' | 'swingVibro' | 'swingShock';
const SWINGS: ReadonlySet<string> = new Set<SwingSound>([
  'swingLight',
  'swingMedium',
  'swingHeavy',
  'swingVibro',
  'swingShock',
]);
export const isSwing = (s: BasicAttackSound): s is SwingSound => s !== null && SWINGS.has(s);

/** What a basic attack (`attack` / `throw`) sounds like for a caster; null = silent (the hit covers it). */
export type BasicAttackSound = SkillSound | 'blasturHeavy' | SwingSound | null;

export interface CueContext {
  basicAttackSound?(casterId: number): BasicAttackSound;
  /** True when the attacker hits with a lit saber (hits then sizzle instead of thumping). */
  hitsWithSaber?(sourceId: number): boolean;
  /** True when the target is a droyd (weapon hits clank on metal). */
  isDroyd?(targetId: number): boolean;
  /**
   * For an enemy caster: what its attack sounds like (null = silent, the impact covers melee).
   * Undefined for anyone else (heroes and mercs use the normal sounds).
   */
  hostileAttackSound?(casterId: number, skillId: string): BasicAttackSound | undefined;
}

/** Enemy attacks: quieter and pitched up so they sit under the hero's own sounds. */
const HOSTILE_VOLUME = 0.3;
const HOSTILE_RATE = 1.15;
/** Most enemy attack sounds heard per frame, however many enemies attack. */
const HOSTILE_CAP = 2;

const BASIC_SKILLS = new Set(['attack', 'throw']);

function basicAttackCue(sound: BasicAttackSound, pos?: { x: number; y: number }): Cue[] {
  if (!sound) return [];
  if (isSwing(sound)) return [{ ids: [sound], volume: 0.6, pos }];
  if (sound === 'blasturHeavy') return [{ ids: ['blasturHeavy'], volume: 0.85, pos }];
  const file = SKILL_FILE[sound];
  return [{ ids: [...(file ? [file] : []), SKILL_SOUND[sound]], volume: sound === 'saber' ? 1 : 0.8, pos }];
}

/** Map one event to zero or more cues. */
export function cuesForEvent(e: GameEvent, ctx?: CueContext): Cue[] {
  switch (e.type) {
    case 'damage': {
      if (e.amount <= 0) return [];
      const physical = e.dtype === 'physical';
      // A crushing extra layer under physical crits.
      const crit: Cue[] = physical && e.crit ? [{ ids: ['hitCrit'], volume: 0.7, pos: e.pos }] : [];
      const v = e.crit ? 1 : 0.75;
      const r = e.crit ? 0.9 : 1;
      if (physical && e.sourceId !== undefined && ctx?.hitsWithSaber?.(e.sourceId))
        return [{ ids: ['saberHit'], volume: v, rate: r, pos: e.pos }, ...crit];
      if (physical && ctx?.isDroyd?.(e.targetId))
        return [{ ids: ['hitMetal'], volume: v, rate: r, pos: e.pos }, ...crit];
      return [hitCue(e.dtype, e.crit, e.pos), ...crit];
    }
    case 'death':
      return e.droyd
        ? [{ ids: ['death.droyd', 'droydDeath'], pos: e.pos }]
        : [{ ids: ['death.organic', 'smoke'], volume: 0.8, pos: e.pos }];
    case 'skillCast': {
      const hostile = ctx?.hostileAttackSound?.(e.casterId, e.skillId);
      if (hostile !== undefined)
        return basicAttackCue(hostile, e.targetPos).map((c) => ({
          ...c,
          volume: (c.volume ?? 1) * HOSTILE_VOLUME,
          rate: (c.rate ?? 1) * HOSTILE_RATE,
          hostile: true,
        }));
      if (BASIC_SKILLS.has(e.skillId))
        return basicAttackCue(ctx?.basicAttackSound?.(e.casterId) ?? null, e.targetPos);
      return [{ ids: skillSoundIds(e.skillId), pos: e.targetPos }];
    }
    case 'heal':
      return e.amount > 0 ? [{ ids: ['heal'], volume: 0.6 }] : [];
    case 'levelUp':
      return [{ ids: ['sfx.levelUp', 'levelUp'] }];
    case 'itemDropped':
      return [{ ids: itemDropIds(e.quality), pos: e.pos }];
    case 'itemPickedUp':
      return [
        { ids: e.creditz ? ['sfx.creditsPickup', 'creditz'] : ['sfx.itemPickup', 'itemPickup', 'uiClick'] },
      ];
    case 'bossIntro':
      return [{ ids: ['bossIntro'] }];
    case 'dialogue':
      return [{ ids: ['dialogue'], volume: 0.7 }];
    case 'shrineUsed':
      return [{ ids: ['shrine'] }];
    case 'waypointActivated':
      return [{ ids: ['sfx.waypoint', 'waypoint'] }];
    case 'playerDefeated':
      return [{ ids: ['droydDeath'], volume: 0.8, rate: 0.7 }];
    case 'objectUsed':
      return [{ ids: ['uiOpen'], volume: 0.6 }];
    case 'questUpdated':
      return e.completed ? [{ ids: ['levelUp'], volume: 0.5, rate: 1.2 }] : [];
    default:
      return [];
  }
}

/** Collapse crowds within one event batch: cap per primary sound and soften volume by crowd size. */
export function planCues(events: readonly GameEvent[], perIdCap = 4, ctx?: CueContext): Cue[] {
  const groups = new Map<string, Cue[]>();
  for (const e of events) {
    for (const c of cuesForEvent(e, ctx)) {
      const key = c.ids[c.ids.length - 1] ?? '';
      const g = groups.get(key);
      if (g) g.push(c);
      else groups.set(key, [c]);
    }
  }
  const out: Cue[] = [];
  let hostile = 0;
  for (const g of groups.values()) {
    const scale = g.length <= 1 ? 1 : Math.max(0.4, 1.3 / Math.sqrt(g.length));
    for (const c of g.slice(0, perIdCap)) {
      if (c.hostile && ++hostile > HOSTILE_CAP) continue;
      out.push({ ...c, volume: (c.volume ?? 1) * Math.min(1, scale) });
    }
  }
  return out;
}
