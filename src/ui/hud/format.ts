/** Pure formatting helpers for the HUD (no DOM). */

/** Whole number with thousands separators: 1234567 -> "1,234,567". Negative/fractional safe. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.round(n);
  const s = Math.abs(v).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return v < 0 ? `-${out}` : out;
}

/**
 * Compact number for floating damage text: 999 -> "999", 12345 -> "12.3k", 1500000 -> "1.5M".
 * Small values (< 10,000) are shown whole so kids can read the real number.
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.round(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  if (v < 10_000) return sign + v.toString();
  if (v < 1_000_000) return sign + trim1(v / 1000) + 'k';
  return sign + trim1(v / 1_000_000) + 'M';
}

function trim1(x: number): string {
  const r = Math.floor(x * 10) / 10;
  return r % 1 === 0 ? r.toFixed(0) : r.toFixed(1);
}

/**
 * Remaining-time label for buffs/cooldowns: Infinity/NaN -> "", 0.4 -> "0.4", 5.2 -> "5s",
 * 75 -> "1:15", 3600 -> "60:00". Values under 1 second show one decimal.
 */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 1) return sec.toFixed(1);
  if (sec < 60) return `${Math.ceil(sec)}s`;
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Clamp a ratio to [0, 1]; NaN/zero max -> 0. */
export function ratio(cur: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(cur)) return 0;
  return Math.min(1, Math.max(0, cur / max));
}

/** Quantize a ratio so derived signals change rarely (e.g. steps=200 -> 0.5% steps). */
export function quantize(r: number, steps: number): number {
  return Math.round(r * steps) / steps;
}

/** "litesaberStrike" -> "Litesaber Strike" (fallback when no display name exists). */
export function prettifyId(id: string): string {
  const last = id.split('.').pop() ?? id;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
