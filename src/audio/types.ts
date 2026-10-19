/** Audio contract (Wave 1 assets agent provides sounds; integration later). */
import type { GameEvent } from '../core/sim/events';
import type { Vec2 } from '../core/types';
import type { CueContext } from './eventMap';

export interface AudioSystem {
  unlock(): void; // call on first user gesture (iOS)
  playMusic(trackId: string | null): void;
  playSfx(id: string, opts?: { volume?: number; rate?: number }): void;
  handleEvents(events: readonly GameEvent[], ctx?: CueContext): void;
  setVolumes(v: { master: number; music: number; sfx: number; voice?: number }): void;
  /** Listener position (local player) for positional sfx. */
  setListener?(pos: Vec2): void;
  playSfxAt?(id: string, pos: Vec2, opts?: { volume?: number; rate?: number }): void;
}
