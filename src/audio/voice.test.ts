import { describe, expect, it } from 'vitest';
import { voiceUrl } from './voice';
import VOICE_LINES from './voiceLines.gen';

describe('voiceUrl', () => {
  it('points at the recording with a cache-busting hash, or null without one', () => {
    expect(voiceUrl('npc.a.d1', { 'npc.a.d1': 'abc123' })).toBe('/assets/audio/voice/npc.a.d1.m4a?v=abc123');
    expect(voiceUrl('npc.a.d2', { 'npc.a.d1': 'abc123' })).toBeNull();
  });

  it('the generated index covers the Act I cast', () => {
    expect(voiceUrl('npc.medicAkarra.d1', VOICE_LINES)).not.toBeNull();
    expect(voiceUrl('boss.countDooky.intro', VOICE_LINES)).not.toBeNull();
  });
});
