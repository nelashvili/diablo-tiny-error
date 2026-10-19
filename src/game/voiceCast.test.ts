import { describe, expect, it } from 'vitest';
import { DB } from '@/data/db';
import { nameEntries } from '@/data/names';
import { CAST, spokenText, voiceScript } from './voiceCast';

const script = voiceScript(nameEntries(), DB.quests);
const byKey = new Map(script.map((l) => [l.key, l]));

describe('voice casting', () => {
  it('voices NPC banter and topics, but not names, roles or topic labels', () => {
    expect(byKey.get('npc.medicAkarra.d1')?.speaker).toBe('medicAkarra');
    expect(byKey.get('npc.masterYoduh.kip.2')?.speaker).toBe('masterYoduh');
    expect(byKey.has('npc.medicAkarra')).toBe(false);
    expect(byKey.has('npc.medicAkarra.role')).toBe(false);
    expect(byKey.has('npc.topic.self')).toBe(false);
  });

  it('story lines are spoken by the giver, thanks by whoever the quest is reported to', () => {
    expect(byKey.get('story.a1q3.enter')?.speaker).toBe('medicAkarra');
    expect(byKey.get('story.a1q3.done')?.speaker).toBe('masterYoduh');
    expect(byKey.get('story.a1q2.done.2')?.speaker).toBe('captainKasha');
  });

  it('narrates the crawls and voices boss intros', () => {
    expect(byKey.get('story.crawl.p1')?.speaker).toBe('narrator');
    expect(byKey.has('story.crawl.title')).toBe(false);
    expect(byKey.get('boss.countDooky.intro')?.speaker).toBe('countDooky');
  });

  it('every NPC and boss has a voice', () => {
    // Speakers are named after their name key (`boss.grizzwald` → grizzwald).
    const ids = [...DB.npcs.keys(), ...[...DB.bosses.values()].map((b) => b.name.split('.')[1] ?? '')];
    for (const id of ids) expect(CAST[id], id).toBeDefined();
  });

  it('says the parody spellings as the real words', () => {
    expect(spokenText('The Forse guides Yedis and Droyds.')).toBe('The Force guides Yeddys and droids.');
  });
});
