/**
 * ASCII template DSL + the template library used by the preset / town generators.
 *
 * Legend (one char = one tile):
 *   terrain   '#' wall   '.' floor   ',' grass   '=' road   's' sand   '~' water   ':' pit
 *             'R' rock   'D' door    '<' stairsUp   '>' stairsDown   '+' bridge   ' ' outside
 *   markers   'S' player start   'W' waypoint   'E' exit (assigned to LevelDef.links in reading order)
 *             'B' boss spot      'C' chest       'M' monster pack     'H' shrine
 *             'T' stash          'L' light       'P' prop (decor)     'Q' quest object
 *             '0'..'9' NPC slot n (genParams.npcs[n])
 *   Marker tiles become the template's `floor` kind.
 */
import type { TileKind } from '../types';

export interface PresetTemplate {
  id: string;
  /** Kind of '.' and of all marker tiles. */
  floor: TileKind;
  /** Kind of ' ' tiles ('void' => walls are generated hugging the floor). */
  outside: TileKind;
  /** Never mirror this template. */
  fixed?: boolean;
  rows: string[];
}

/** Tiny drawing canvas to author templates in code (still ASCII underneath). */
export class Canvas {
  readonly cells: string[][];
  constructor(
    readonly w: number,
    readonly h: number,
    fill = ' ',
  ) {
    this.cells = Array.from({ length: h }, () => new Array<string>(w).fill(fill));
  }
  set(x: number, y: number, c: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) (this.cells[y] as string[])[x] = c;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }
  /** Walled box with floor inside. */
  box(x: number, y: number, w: number, h: number, wall = '#', inner = '.'): this {
    this.rect(x, y, w, h, wall);
    this.rect(x + 1, y + 1, w - 2, h - 2, inner);
    return this;
  }
  ring(c: string, thick = 1): this {
    for (let t = 0; t < thick; t++) {
      for (let i = 0; i < this.w; i++) {
        this.set(i, t, c);
        this.set(i, this.h - 1 - t, c);
      }
      for (let j = 0; j < this.h; j++) {
        this.set(t, j, c);
        this.set(this.w - 1 - t, j, c);
      }
    }
    return this;
  }
  disc(cx: number, cy: number, r: number, c: string): this {
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++)
      for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.set(i, j, c);
    return this;
  }
  hline(x0: number, x1: number, y: number, c: string): this {
    for (let x = x0; x <= x1; x++) this.set(x, y, c);
    return this;
  }
  vline(x: number, y0: number, y1: number, c: string): this {
    for (let y = y0; y <= y1; y++) this.set(x, y, c);
    return this;
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}

// ----------------------------------------------------------------------- Act I town
function townA1(): string[] {
  const c = new Canvas(40, 28, ',');
  c.ring('R', 1);
  c.rect(1, 1, 3, 1, 'R').rect(36, 1, 3, 1, 'R').rect(1, 26, 3, 1, 'R').rect(36, 26, 3, 1, 'R');
  // roads: main east-west street and a north-south avenue
  c.hline(1, 38, 13, '=').hline(1, 38, 14, '=').vline(19, 8, 22, '=').vline(20, 8, 22, '=');
  // plaza
  c.rect(14, 10, 12, 7, '=');
  // houses: top-left healer, top-right smith, bottom-left captain, bottom-right gambler
  c.box(4, 3, 8, 5).set(8, 7, 'D').set(5, 4, '0').set(10, 4, 'L');
  c.box(28, 3, 8, 5).set(32, 7, 'D').set(29, 4, '1').set(34, 4, 'L');
  c.box(4, 20, 8, 5).set(8, 20, 'D').set(5, 23, '2').set(10, 23, 'L');
  c.box(28, 20, 8, 5).set(32, 20, 'D').set(29, 23, '3').set(34, 23, 'L');
  // paths from doors to the street
  c.vline(8, 8, 12, '=').vline(32, 8, 12, '=').vline(8, 15, 19, '=').vline(32, 15, 19, '=');
  // pond
  c.disc(23, 21, 2.4, '~');
  c.set(21, 18, 's').set(22, 18, 's');
  // plaza furniture
  c.set(19, 12, 'W'); // waypoint (holo-beacon)
  c.set(22, 15, 'T'); // stash
  c.set(19, 15, 'S'); // start
  c.set(16, 12, '4'); // Master Yoduh
  c.set(15, 10, 'L').set(24, 10, 'L').set(15, 16, 'L').set(24, 16, 'L');
  c.set(12, 11, 'P').set(27, 11, 'P').set(12, 16, 'P').set(27, 16, 'P');
  // east gate
  c.rect(37, 12, 3, 4, '=');
  c.set(38, 13, 'E');
  return c.rows();
}

// ----------------------------------------------------------------------- Crash site
function crashSite(): string[] {
  const c = new Canvas(64, 46, ',');
  // irregular rock rim
  c.ring('R', 2);
  for (let i = 0; i < 64; i += 3) {
    c.set(i, 2, 'R')
      .set(i + 1, 3, 'R')
      .set((i * 7) % 64, 43, 'R')
      .set((i * 5) % 64, 42, 'R');
  }
  // scorched earth from the impact line
  c.disc(30, 22, 11, 's');
  // wrecked hull: two long walled halves with breaches, interior floor
  c.box(18, 16, 24, 12, '#', '.');
  c.rect(30, 16, 3, 1, '.').rect(30, 27, 3, 1, '.').rect(18, 21, 1, 3, '.').rect(41, 21, 1, 3, '.');
  c.rect(24, 20, 2, 4, '#').rect(34, 20, 2, 4, '#');
  c.set(30, 22, 'Q'); // black-box recorder
  c.set(21, 18, 'C').set(38, 25, 'C').set(21, 25, 'M').set(37, 18, 'M');
  // debris field
  const debris: [number, number][] = [
    [12, 10],
    [13, 10],
    [46, 12],
    [47, 12],
    [47, 13],
    [10, 30],
    [11, 30],
    [50, 32],
    [51, 32],
    [28, 8],
    [29, 8],
    [33, 38],
    [34, 38],
    [34, 37],
    [8, 20],
    [54, 22],
    [55, 22],
  ];
  for (const [x, y] of debris) c.set(x, y, '#');
  // monster camps
  for (const [x, y] of [
    [10, 14],
    [52, 16],
    [12, 36],
    [50, 36],
    [30, 6],
    [30, 40],
  ] as [number, number][])
    c.disc(x, y, 3, ',').set(x, y, 'M');
  c.set(14, 40, 'H');
  // entrance in the west
  c.rect(0, 21, 3, 3, '=').hline(3, 15, 22, '=').hline(3, 15, 23, '=');
  c.set(2, 22, 'E').set(6, 22, 'S');
  c.hline(16, 17, 22, '=').hline(16, 17, 23, '=');
  return c.rows();
}

// ----------------------------------------------------------------------- Ewok village ruins
function ewokVillage(): string[] {
  const c = new Canvas(60, 44, ',');
  c.ring('R', 2);
  c.hline(2, 57, 22, '=').hline(2, 57, 23, '=').vline(29, 3, 40, '=').vline(30, 3, 40, '=');
  c.disc(29.5, 22.5, 5, '=');
  // burnt huts
  const huts: [number, number, number, number][] = [
    [8, 8, 7, 6],
    [18, 6, 6, 6],
    [38, 7, 7, 6],
    [48, 9, 7, 6],
    [8, 29, 7, 6],
    [19, 31, 6, 6],
    [38, 30, 7, 6],
    [48, 28, 7, 6],
  ];
  huts.forEach(([x, y, w, h], i) => {
    c.box(x, y, w, h, '#', ',');
    c.rect(x + Math.floor(w / 2), y + h - 1, 1, 1, i < 4 ? ',' : ',');
    c.rect(x + Math.floor(w / 2), y, 1, 1, ',');
    c.set(x + 2, y + 2, 'M');
    if (i % 3 === 0) c.set(x + 1, y + 1, 'C');
  });
  // captive's cage in the village centre
  c.box(33, 19, 5, 5, '#', '.').set(35, 19, ',');
  c.set(35, 21, '0'); // Master Yoduh (captive until rescued)
  c.set(29, 21, 'Q'); // cairn stone / rescue object
  c.set(29, 24, 'H');
  c.set(5, 22, 'E').set(8, 22, 'S');
  c.rect(0, 21, 3, 3, '=');
  return c.rows();
}

// ----------------------------------------------------------------------- Hand-drawn sanctum
const SANCTUM: string[] = [
  '       #########       ',
  '      ##.......##      ',
  '     ##....B....##     ',
  '    ##...........##    ',
  '   ##....#...#....##   ',
  '   #.....M...M.....#   ',
  '   #...............#   ',
  '   ##......C......##   ',
  '    ##...........##    ',
  '     ###.......###     ',
  '       ##.....##       ',
  '        #..S..#        ',
  '        #..E..#        ',
  '        ###D###        ',
];

const library = new Map<string, PresetTemplate>();
export function registerTemplate(t: PresetTemplate): void {
  library.set(t.id, t);
}
export function getTemplate(id: string): PresetTemplate | undefined {
  return library.get(id);
}
export function templateIds(): string[] {
  return [...library.keys()];
}

registerTemplate({ id: 'town.a1', floor: 'grass', outside: 'rock', fixed: true, rows: townA1() });
registerTemplate({ id: 'crashSite', floor: 'grass', outside: 'rock', rows: crashSite() });
registerTemplate({ id: 'ewokVillage', floor: 'grass', outside: 'rock', rows: ewokVillage() });
registerTemplate({ id: 'sanctum', floor: 'floor', outside: 'void', rows: SANCTUM });
