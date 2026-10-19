import { describe, expect, it } from 'vitest';
import type { TileKind } from '../../core/world/types';
import { wallKitFor, wallPieces } from './walls';

/** Rows of 'w' (wall) and '.' (floor). */
const grid = (rows: string[]): TileKind[] =>
  rows.flatMap((r) => [...r].map((c): TileKind => (c === 'w' ? 'wall' : 'floor')));

describe('wallPieces', () => {
  it('gives buried walls only a top and edge walls a segment', () => {
    const k = grid(['wwww', 'wwww', 'wwww', '....']);
    const p = wallPieces(k, 4, 4);
    const at = (x: number, y: number) => p.filter((q) => q.tx === x && q.ty === y).map((q) => q.piece);
    // (1,1) has floor only beyond its neighbours' row: all 8 neighbours are wall.
    expect(at(1, 1)).toEqual(['top']);
    expect(at(1, 2)).toContain('segment');
    expect(at(0, 3)).toEqual([]);
  });

  it('puts pilasters on open faces every third tile, facing the open side', () => {
    const k = grid(['wwwwwww', '.......']);
    const pil = wallPieces(k, 7, 2).filter((q) => q.piece === 'pilaster');
    expect(pil.map((q) => q.tx)).toEqual([0, 3, 6]);
    expect(pil.every((q) => q.rot === 0)).toBe(true);
  });

  it('only kits the town and temple tilesets', () => {
    expect(wallKitFor('endoor.temple')).toBeDefined();
    expect(wallKitFor('endoor.town')).toBeDefined();
    expect(wallKitFor('endoor.cave')).toBeUndefined();
  });
});
