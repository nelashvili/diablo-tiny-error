/** Pure GameEvent → sound-cue mapping. */
import type { GameEvent } from '../core/sim/events';
import type { DamageType } from '../core/types';

export interface Cue {
  /** Candidate ids in preference order; catalog files are tried first, the last must be procedural. */
  ids: string[];
  volume?: number;
  rate?: number;
  pos?: { x: number; y: number };
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
  saber: 'saberSwing',
  blastur: 'blastur',
  storm: 'lightning',
  plasma: 'plasma',
  cryo: 'cryo',
  toxin: 'toxin',
  magic: 'forse',
};

export function soundForSkill(skillId: string): string {
  return SKILL_SOUND[elementForSkill(skillId)];
}

function hitCue(dtype: DamageType, crit: boolean, pos: { x: number; y: number }): Cue {
  const v = crit ? 1 : 0.7;
  const r = crit ? 0.85 : 1;
  switch (dtype) {
    case 'physical':
      return { ids: ['hit'], volume: v, rate: r, pos };
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

/** Map one event to zero or more cues. */
export function cuesForEvent(e: GameEvent): Cue[] {
  switch (e.type) {
    case 'damage':
      return e.amount > 0 ? [hitCue(e.dtype, e.crit, e.pos)] : [];
    case 'death':
      return e.droyd
        ? [{ ids: ['death.droyd', 'droydDeath'], pos: e.pos }]
        : [{ ids: ['death.organic', 'smoke'], volume: 0.8, pos: e.pos }];
    case 'skillCast':
      return [{ ids: [`skill.${e.skillId}`, soundForSkill(e.skillId)], pos: e.targetPos }];
    case 'heal':
      return e.amount > 0 ? [{ ids: ['heal'], volume: 0.6 }] : [];
    case 'levelUp':
      return [{ ids: ['levelUp'] }];
    case 'itemDropped':
      return [{ ids: itemDropIds(e.quality), pos: e.pos }];
    case 'itemPickedUp':
      return [{ ids: e.creditz ? ['creditz'] : ['itemPickup', 'uiClick'] }];
    case 'bossIntro':
      return [{ ids: ['bossIntro'] }];
    case 'dialogue':
      return [{ ids: ['dialogue'], volume: 0.7 }];
    case 'shrineUsed':
      return [{ ids: ['shrine'] }];
    case 'waypointActivated':
      return [{ ids: ['waypoint'] }];
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
export function planCues(events: readonly GameEvent[], perIdCap = 4): Cue[] {
  const groups = new Map<string, Cue[]>();
  for (const e of events) {
    for (const c of cuesForEvent(e)) {
      const key = c.ids[c.ids.length - 1] ?? '';
      const g = groups.get(key);
      if (g) g.push(c);
      else groups.set(key, [c]);
    }
  }
  const out: Cue[] = [];
  for (const g of groups.values()) {
    const scale = g.length <= 1 ? 1 : Math.max(0.4, 1.3 / Math.sqrt(g.length));
    for (const c of g.slice(0, perIdCap)) out.push({ ...c, volume: (c.volume ?? 1) * Math.min(1, scale) });
  }
  return out;
}
