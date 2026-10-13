/**
 * Pure tooltip placement: keep the tooltip fully inside the viewport, preferring a side of the
 * anchor (right of the anchor by default, like D2's item popups), and never covering the anchor
 * when there is room elsewhere.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'right' | 'left' | 'top' | 'bottom';

export interface Placement {
  x: number;
  y: number;
  side: Side | 'overlap';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function placeTooltip(
  anchor: Rect,
  tip: { w: number; h: number },
  viewport: { w: number; h: number },
  prefer: Side[] = ['right', 'left', 'top', 'bottom'],
  gap = 10,
  margin = 8,
): Placement {
  const maxX = viewport.w - tip.w - margin;
  const maxY = viewport.h - tip.h - margin;
  for (const side of prefer) {
    let x: number;
    let y: number;
    if (side === 'right' || side === 'left') {
      x = side === 'right' ? anchor.x + anchor.w + gap : anchor.x - gap - tip.w;
      if (x < margin || x > maxX) continue;
      y = clamp(anchor.y + anchor.h / 2 - tip.h / 2, margin, Math.max(margin, maxY));
    } else {
      y = side === 'bottom' ? anchor.y + anchor.h + gap : anchor.y - gap - tip.h;
      if (y < margin || y > maxY) continue;
      x = clamp(anchor.x + anchor.w / 2 - tip.w / 2, margin, Math.max(margin, maxX));
    }
    return { x, y, side };
  }
  // Nothing fits cleanly (tiny screens): pin inside the viewport.
  return {
    x: clamp(anchor.x + anchor.w / 2 - tip.w / 2, margin, Math.max(margin, maxX)),
    y: clamp(margin, margin, Math.max(margin, maxY)),
    side: 'overlap',
  };
}
