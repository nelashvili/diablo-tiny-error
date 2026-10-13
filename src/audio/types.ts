/** Audio contract (Wave 1 assets agent provides sounds; integration later). */
import type { GameEvent } from '../core/sim/events';

export interface AudioSystem {
  unlock(): void; // call on first user gesture (iOS)
  playMusic(trackId: string | null): void;
  playSfx(id: string, opts?: { volume?: number; rate?: number }): void;
  handleEvents(events: readonly GameEvent[]): void;
  setVolumes(v: { master: number; music: number; sfx: number }): void;
}
