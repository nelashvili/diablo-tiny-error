/**
 * Dev harness for render/: self-contained test map, fake WorldView with ~50 moving actors,
 * missiles and ground items. Open /dev/render.html under `npm run dev`.
 * Does not depend on mapgen or the simulation.
 */
import * as THREE from 'three';
import { createRenderer } from '../src/render/renderer';
import type { EntityVisual, VisualFactory, QualityLevel } from '../src/render/types';
import type { GeneratedLevel, TileKind } from '../src/core/world/types';
import type { WorldView } from '../src/core/sim/world';
import type { Entity } from '../src/core/sim/entities';
import type { GameEvent } from '../src/core/sim/events';

// ------------------------------------------------------------------ colored placeholder factory
function hashColor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return new THREE.Color().setHSL(((h >>> 0) % 360) / 360, 0.55, 0.5).getHex();
}

const TILE_COLORS: Partial<Record<TileKind, number>> = {
  floor: 0x6d7a8c,
  wall: 0x8a6f5a,
  road: 0x7a7468,
  grass: 0x55784a,
  rock: 0x5a5a62,
  water: 0x2f6fa8,
  door: 0x9a7a3a,
};

const devFactory: VisualFactory = {
  async preload() {},
  create(modelId): EntityVisual {
    const isHero = modelId.startsWith('hero.');
    const geo = modelId.startsWith('item.')
      ? new THREE.BoxGeometry(0.35, 0.18, 0.5)
      : new THREE.CapsuleGeometry(0.28, isHero ? 0.9 : 0.6, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: isHero ? 0xe8d9a8 : hashColor(modelId) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = modelId.startsWith('item.') ? 0.12 : isHero ? 0.75 : 0.6;
    const object = new THREE.Group();
    object.add(mesh);
    let bob = 0;
    let moving = false;
    const base = mesh.position.y;
    return {
      object,
      setMode(mode) {
        moving = mode === 'walk' || mode === 'run';
      },
      setFacing(rad) {
        object.rotation.y = -rad;
      },
      setAttachment() {},
      setHighlight(on) {
        mat.emissive.setHex(on ? 0x663322 : 0x000000);
      },
      setTint(c) {
        mat.color.setHex(c ?? (isHero ? 0xe8d9a8 : hashColor(modelId)));
      },
      update(dt) {
        bob += dt * (moving ? 12 : 2);
        mesh.position.y = base + (moving ? Math.abs(Math.sin(bob)) * 0.08 : 0);
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
  getStaticMesh(modelId) {
    const kind = modelId.split('.')[2] as TileKind | undefined;
    const color = (kind && TILE_COLORS[kind]) || (modelId.startsWith('prop.') ? 0x9a5a2a : 0x666666);
    const geometry = modelId.startsWith('prop.')
      ? new THREE.CylinderGeometry(0.25, 0.3, 1.2, 8)
      : new THREE.BoxGeometry(1, 1, 1);
    return [{ geometry, material: new THREE.MeshStandardMaterial({ color }) }];
  },
};

// ------------------------------------------------------------------ test level
const W = 96;
const H = 96;
let seed = 12345;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

function makeLevel(): GeneratedLevel {
  const kinds: TileKind[] = new Array<TileKind>(W * H).fill('void');
  const walkable = new Uint8Array(W * H);
  const variants = new Uint8Array(W * H);
  for (let i = 0; i < variants.length; i++) variants[i] = Math.floor(rnd() * 256);
  const carve = (x: number, y: number, kind: TileKind = 'floor') => {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    kinds[y * W + x] = kind;
    walkable[y * W + x] = 1;
  };
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  for (let n = 0; n < 40; n++) {
    const w = 6 + Math.floor(rnd() * 10);
    const h = 6 + Math.floor(rnd() * 10);
    const x = 2 + Math.floor(rnd() * (W - w - 4));
    const y = 2 + Math.floor(rnd() * (H - h - 4));
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y))
      continue;
    rooms.push({ x, y, w, h });
    const floorKind: TileKind = n % 3 === 0 ? 'grass' : n % 3 === 1 ? 'road' : 'floor';
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) carve(xx, yy, floorKind);
  }
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]!;
    const b = rooms[i]!;
    let x = Math.floor(a.x + a.w / 2);
    let y = Math.floor(a.y + a.h / 2);
    const tx = Math.floor(b.x + b.w / 2);
    const ty = Math.floor(b.y + b.h / 2);
    while (x !== tx) {
      carve(x, y);
      carve(x, y + 1);
      x += Math.sign(tx - x);
    }
    while (y !== ty) {
      carve(x, y);
      carve(x + 1, y);
      y += Math.sign(ty - y);
    }
  }
  // walls around floor
  const wallAt: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (walkable[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && walkable[ny * W + nx]) wallAt.push(y * W + x);
        }
    }
  for (const i of wallAt) kinds[i] = 'wall';
  const blocks = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (kinds[i] === 'wall') blocks[i] = 1;
  const placements: GeneratedLevel['placements'] = [];
  for (const r of rooms) {
    placements.push({ kind: 'light', pos: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
    for (let k = 0; k < 3; k++)
      placements.push({
        kind: 'prop',
        ref: 'crate',
        pos: { x: r.x + 1.5 + rnd() * (r.w - 3), y: r.y + 1.5 + rnd() * (r.h - 3) },
      });
  }
  placements.unshift({ kind: 'playerStart', pos: { x: rooms[0]!.x + 2.5, y: rooms[0]!.y + 2.5 } });
  return {
    levelId: 'dev.test',
    seed: 1,
    map: { width: W, height: H, kinds, variants, walkable, blocksMissiles: blocks },
    placements,
    regions: rooms,
  };
}

// ------------------------------------------------------------------ fake world
interface FakeActor {
  e: Entity;
  tx: number;
  ty: number;
  speed: number;
}

class FakeWorld implements WorldView {
  tick = 0;
  time = 0;
  difficulty = 'normal' as const;
  level: GeneratedLevel;
  localPlayerId: number | null = 1;
  paused = false;
  frameEvents: GameEvent[] = [];
  readonly entities = new Map<number, Entity>();
  readonly actors: FakeActor[] = [];
  private nextId = 2;
  private events: GameEvent[] = [];
  readonly player: FakeActor;

  constructor(level: GeneratedLevel) {
    this.level = level;
    const start = level.placements.find((p) => p.kind === 'playerStart')!.pos;
    const mk = (kind: string, modelId: string, x: number, y: number, extra: object = {}) =>
      ({
        id: 0,
        kind,
        pos: { x, y },
        facing: 0,
        radius: 0.4,
        alive: true,
        modelId,
        mode: 'idle',
        modeTime: 0,
        effects: [],
        stats: { attackSpeedMul: 1, castSpeedMul: 1, lifeMax: 100 },
        equipment: {},
        ...extra,
      }) as unknown as Entity;
    const p = mk('player', 'hero.yediKnight', start.x, start.y, { id: 1 });
    this.entities.set(1, p);
    this.player = { e: p, tx: start.x, ty: start.y, speed: 6 };
    const rooms = level.regions;
    for (let i = 0; i < 50; i++) {
      const r = rooms[i % rooms.length]!;
      const x = r.x + 1 + rnd() * (r.w - 2);
      const y = r.y + 1 + rnd() * (r.h - 2);
      const e = mk('monster', `mon.dev${i % 7}`, x, y, {
        id: this.nextId++,
        rank: i % 11 === 0 ? 'champion' : i % 17 === 0 ? 'unique' : 'normal',
        radius: 0.4,
      });
      this.entities.set(e.id, e);
      this.actors.push({ e, tx: x, ty: y, speed: 1.5 + rnd() * 2 });
    }
    const qualities = ['normal', 'magic', 'rare', 'set', 'unique'];
    for (let i = 0; i < 10; i++) {
      const r = rooms[i % rooms.length]!;
      const e = mk('groundItem', '', r.x + 2 + rnd() * 2, r.y + 2 + rnd() * 2, {
        id: this.nextId++,
        item: { base: 'plasmaBlade', quality: qualities[i % 5] },
        droppedAtTick: 0,
      });
      this.entities.set(e.id, e);
    }
    this.mk = mk;
  }
  private mk: (kind: string, modelId: string, x: number, y: number, extra?: object) => Entity;

  get(id: number) {
    return this.entities.get(id);
  }
  all() {
    return this.entities.values();
  }

  step(dt: number): void {
    this.tick++;
    this.time += dt;
    const move = (a: FakeActor) => {
      const dx = a.tx - a.e.pos.x;
      const dy = a.ty - a.e.pos.y;
      const d = Math.hypot(dx, dy);
      const m = a.e as unknown as { mode: string; modeTime: number };
      if (d < 0.1) {
        if (m.mode !== 'idle') {
          m.mode = 'idle';
          m.modeTime = 0;
        }
        return false;
      }
      const s = Math.min(d, a.speed * dt);
      const nx = a.e.pos.x + (dx / d) * s;
      const ny = a.e.pos.y + (dy / d) * s;
      const ix = Math.floor(nx);
      const iy = Math.floor(ny);
      if (this.level.map.walkable[iy * W + ix]) {
        a.e.pos.x = nx;
        a.e.pos.y = ny;
        a.e.facing = Math.atan2(dy, dx);
        if (m.mode !== 'run') {
          m.mode = 'run';
          m.modeTime = 0;
        }
      } else {
        a.tx = a.e.pos.x;
        a.ty = a.e.pos.y;
      }
      m.modeTime += dt;
      return true;
    };
    move(this.player);
    for (const a of this.actors) {
      if (!move(a) && rnd() < 0.02) {
        a.tx = a.e.pos.x + (rnd() - 0.5) * 6;
        a.ty = a.e.pos.y + (rnd() - 0.5) * 6;
      }
    }
    // missiles fly from the player toward the click
    for (const [id, e] of this.entities) {
      if (e.kind !== 'missile') continue;
      const m = e as unknown as { velocity: { x: number; y: number }; traveled: number; range: number };
      e.pos.x += m.velocity.x * dt;
      e.pos.y += m.velocity.y * dt;
      m.traveled += Math.hypot(m.velocity.x, m.velocity.y) * dt;
      if (m.traveled > m.range) {
        this.entities.delete(id);
        this.events.push({ type: 'removed', id });
      }
    }
    this.frameEvents = this.events;
    this.events = [];
  }

  fire(tx: number, ty: number): void {
    const p = this.player.e.pos;
    const a = Math.atan2(ty - p.y, tx - p.x);
    const e = this.mk('missile', '', p.x, p.y, {
      id: this.nextId++,
      defId: 'plasmaBolt',
      velocity: { x: Math.cos(a) * 14, y: Math.sin(a) * 14 },
      traveled: 0,
      range: 18,
      radius: 0.2,
    });
    this.entities.set(e.id, e);
  }
}

// ------------------------------------------------------------------ boot
async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = createRenderer({ visuals: devFactory });
  let quality: QualityLevel = (new URLSearchParams(location.search).get('q') as QualityLevel) || 'high';
  await renderer.init(canvas, { quality });
  const level = makeLevel();
  await renderer.loadLevel(level, 'dev');
  const world = new FakeWorld(level);
  const fit = () => renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  window.addEventListener('resize', fit);
  fit();

  const rect = () => canvas.getBoundingClientRect();
  canvas.addEventListener('pointerdown', (ev) => {
    const r = rect();
    const w = renderer.screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
    if (!w) return;
    renderer.setTouchMode(ev.pointerType === 'touch');
    if (ev.shiftKey || ev.button === 2) world.fire(w.x, w.y);
    else {
      world.player.tx = w.x;
      world.player.ty = w.y;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (ev) => {
    const r = rect();
    renderer.setHovered(renderer.pick(ev.clientX - r.left, ev.clientY - r.top));
  });
  canvas.addEventListener('wheel', (ev) => renderer.setZoom(ev.deltaY > 0 ? 1 : 0), { passive: true });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'z') renderer.setZoom(renderer.getZoom() ? 0 : 1);
    if (ev.key === 'q') {
      quality = quality === 'low' ? 'medium' : quality === 'medium' ? 'high' : 'low';
      renderer.setQuality(quality);
    }
    if (ev.key === 's') renderer.shake(0.6);
  });

  const STEP = 1 / 25;
  let acc = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const events: GameEvent[] = [];
    while (acc >= STEP) {
      world.step(STEP);
      events.push(...world.frameEvents);
      acc -= STEP;
    }
    renderer.render(world, events, acc / STEP, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  Object.assign(window, {
    __dev: {
      renderer,
      world,
      setPlayerTarget: (x: number, y: number) => ((world.player.tx = x), (world.player.ty = y)),
    },
    __ready: true,
  });
}

main().catch((e) => {
  console.error(e);
  (window as unknown as { __error: string }).__error = String(e);
});
