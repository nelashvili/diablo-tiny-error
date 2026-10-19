/**
 * Voice casting: who speaks which line, and with which TTS voice. `scripts/voices/generate.mjs` renders
 * every line from `voiceScript()` to `public/assets/audio/voice/<key>.m4a` (Kokoro TTS, offline) and
 * records what it rendered in `src/audio/voiceLines.gen.ts`; at runtime a line plays if it is listed there.
 */
import type { DefId } from '@/core/types';
import type { QuestDef } from '@/data/schema';
import { QUEST_GIVER, reportsTo } from './story';

export interface VoiceCast {
  /** Kokoro voice id (af_* / am_* American, bf_* / bm_* British). */
  voice: string;
  /** Speaking tempo (1 = natural). */
  speed?: number;
  /** Pitch multiplier, applied tape-style after synthesis (tempo is compensated). */
  pitch?: number;
}

export const NARRATOR: VoiceCast = { voice: 'am_michael', pitch: 0.94 };

/** NPCs by def id, bosses by their name key (`boss.<id>`). */
export const CAST: Record<DefId, VoiceCast> = {
  medicAkarra: { voice: 'af_heart' },
  chiefCharzi: { voice: 'af_bella', speed: 1.05 },
  captainKasha: { voice: 'bf_emma' },
  gheedo: { voice: 'am_puck', speed: 1.08, pitch: 1.04 },
  masterYoduh: { voice: 'bm_fable', speed: 0.9, pitch: 1.18 },
  countDooky: { voice: 'bm_george', speed: 0.88, pitch: 0.86 },
  captainScrapfire: { voice: 'am_fenrir', pitch: 0.9 },
  bishyBosh: { voice: 'am_puck', speed: 1.15, pitch: 1.45 },
  rakanishoo: { voice: 'am_echo', pitch: 1.12 },
  grizzwald: { voice: 'am_onyx', speed: 0.92, pitch: 0.88 },
  countezz: { voice: 'bf_isabella', speed: 0.92, pitch: 0.95 },
};

/** The parody names are typos on screen; spoken, they should sound like the real words. */
const SAY_AS: [RegExp, string][] = [
  [/\bForse\b/g, 'Force'],
  [/\bYedi(s?)\b/g, 'Yeddy$1'],
  [/\bSyth\b/g, 'Sith'],
  [/\bDroyd(s?)\b/gi, 'droid$1'],
  [/\bPadawon(s?)\b/g, 'Padawan$1'],
  [/\bLitesaber(s?)\b/gi, 'lightsaber$1'],
  [/\bBlastur(s?)\b/gi, 'blaster$1'],
  [/\bKybur\b/g, 'Kyber'],
  [/\bEwokz\b/g, 'Ewoks'],
  [/\bJawwa(s?)\b/g, 'Jahwa$1'],
  [/\bDooky\b/g, 'Dookee'],
  [/\bYoduh\b/g, 'Yoda'],
  [/\bcreditz\b/gi, 'credits'],
  [/\bbakta\b/gi, 'bacta'],
];

export function spokenText(text: string): string {
  let s = text;
  for (const [re, to] of SAY_AS) s = s.replace(re, to);
  return s;
}

export interface VoiceLine {
  key: string;
  /** Text as the TTS should say it. */
  text: string;
  speaker: DefId;
  cast: VoiceCast;
}

/** Story crawls narrated in full (`story.<id>.<part>`). */
const CRAWLS = ['crawl', 'act1End'];
export const CRAWL_PARTS = ['intro', 'p1', 'p2', 'p3'] as const;

/** Who says a story line (`story.<quest>.<step>[.<page>]`): its giver, or for thanks whoever it is reported to. */
function storySpeaker(key: string, quests: ReadonlyMap<DefId, QuestDef>): DefId | undefined {
  const [, questId = '', step] = key.split('.');
  const giver = QUEST_GIVER[questId];
  const q = quests.get(questId);
  if (!giver || !q) return undefined;
  return step === 'done' ? (reportsTo(q) ?? giver) : giver;
}

/** Every line to voice, from the registered display names. Lines with `{params}` are skipped. */
export function voiceScript(
  names: Readonly<Record<string, string>>,
  quests: ReadonlyMap<DefId, QuestDef>,
): VoiceLine[] {
  const out: VoiceLine[] = [];
  const push = (key: string, speaker: DefId, cast: VoiceCast | undefined) => {
    const text = names[key];
    if (!cast || !text || text.includes('{')) return;
    out.push({ key, text: spokenText(text), speaker, cast });
  };
  for (const key of Object.keys(names).sort()) {
    const parts = key.split('.');
    const [ns, id = ''] = parts;
    if (ns === 'npc' && parts.length > 2 && parts[2] !== 'role') push(key, id, CAST[id]);
    else if (ns === 'boss' && parts.length > 2) push(key, id, CAST[id]);
    else if (ns === 'story' && CRAWLS.includes(id)) {
      if ((CRAWL_PARTS as readonly string[]).includes(parts[2] ?? '')) push(key, 'narrator', NARRATOR);
    } else if (ns === 'story') {
      const who = storySpeaker(key, quests);
      if (who) push(key, who, CAST[who]);
    }
  }
  return out;
}
