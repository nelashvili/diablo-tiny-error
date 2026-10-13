/** Shared helpers for building item base tables (not a data table itself: no default export). */
import type { ItemTier } from '../schema';

export const TIERS: readonly ItemTier[] = ['normal', 'exceptional', 'elite'];

/** "Training Litesaber" -> "trainingLitesaber" (def id convention). */
export function camel(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1))
    .join('');
}

/** Per-tier multipliers (D2 normal -> exceptional -> elite analog). */
export const TIER_MUL = {
  dmg: [1, 2.2, 3.2],
  req: [1, 2, 2.6],
  def: [1, 4, 7],
  cost: [1, 3, 8],
  dur: [1, 1.3, 1.6],
} as const;

export function tierQlvl(t: number, q: number): number {
  return t === 0 ? q : t === 1 ? 28 + Math.round(q * 0.6) : 55 + Math.round(q * 0.5);
}

export function tierReqLevel(t: number, qlvl: number): number {
  return t === 0 ? 0 : Math.round(qlvl * (t === 1 ? 0.65 : 0.7));
}
