// STUB (Wave 0) — replaced by agent "assets". Model ids used across data/ resolve here.
import type { ModelEntry } from '../types';

const ph = (shape: ModelEntry['placeholder']['shape'], color: number, height: number, radius: number) => ({
  shape,
  color,
  height,
  radius,
});

export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: 'hero.yediKnight',
    url: null,
    scale: 1,
    placeholder: ph('capsule', 0xd9c8a0, 1.6, 0.3),
    accent: 0x4fc3ff,
  },
  { id: 'hero.bountyHuntur', url: null, scale: 1, placeholder: ph('capsule', 0x6b7d5c, 1.6, 0.3) },
  { id: 'hero.forseAdept', url: null, scale: 1, placeholder: ph('capsule', 0x7b5ea7, 1.6, 0.3) },
];

export const DEFAULT_PLACEHOLDER = ph('box', 0xff00ff, 1, 0.4);
