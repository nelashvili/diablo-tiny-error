/**
 * Dev harness for render/models. Open /dev/models.html via `npm run dev`.
 * Query: ?mode=attack (freeze a mode), ?cols=8, ?zoom=1, ?only=hero.yediKnight,mon.jawwa (just those,
 * without the extra demo actors and tiles), ?nohelm, ?armor=helm,chest,gloves,boots (armor item ids worn
 * by the heroes, e.g. trooperHelm,trooperArmor,heavyGloves,heavyBoots), ?view=front|side|back|iso
 * (camera azimuth), ?paused (no animation loop: drive it with window.__pose(mode, t) for screenshots).
 */
import * as THREE from 'three';
import { MODEL_CATALOG } from '../src/render/assets/catalog';
import { createVisualFactory } from '../src/render/models';
import type { EntityVisual } from '../src/render/types';
import type { ActorMode } from '../src/core/sim/entities';
import { armorLook } from '../src/render/models/outfit';

const MODES: ActorMode[] = [
  'idle',
  'walk',
  'run',
  'attack',
  'cast',
  'throw',
  'hit',
  'block',
  'stunned',
  'frozen',
  'dying',
  'dead',
];
const SAMPLE_IDS = [
  'hero.yediKnight',
  'hero.bountyHuntur',
  'hero.forseAdept',
  'mon.battleDroyd',
  'mon.probeDroyd',
  'mon.sandBeast',
  'mon.swampSlug',
  'npc.vendor',
  'npc.elder',
  'obj.waypoint',
  'obj.chest',
  'obj.stash',
  'obj.portal',
  'obj.shrine',
  'item.blueLitesaber',
  'item.doubleLitesaber',
  'item.blasterPistol',
  'item.vibroSword',
  'item.battleHelm',
  'item.jediRobe',
  'item.energyShield',
  'item.stimPack',
  'item.kyberCrystal',
  'item.holocron',
  'prop.tree',
  'prop.rock',
  'prop.crate',
];
const TILESETS = ['endoor', 'tatoonie', 'kashyyyyyk', 'deafStar'];
const TILE_KINDS = ['floor', 'floor.grass', 'road', 'sand', 'rock', 'wall', 'water'];

const params = new URLSearchParams(location.search);
const fixedMode = params.get('mode') as ActorMode | null;
const cols = Number(params.get('cols') ?? 8);
const zoom = Number(params.get('zoom') ?? 1.15);
const only = (params.get('only') ?? '').split(',').filter(Boolean);
const view = params.get('view') ?? 'iso';
/** Camera direction (x, z) from the subject for ?view. */
const VIEW_DIR: Record<string, [number, number]> = {
  iso: [1, 1],
  front: [0, 1],
  side: [1, 0],
  back: [0, -1],
  left: [-1, 0],
};

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2036);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445066, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(-4, 8, 3);
scene.add(sun);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x232a44 }),
);
ground.position.y = -0.3;
scene.add(ground);

const factory = createVisualFactory({ renderer });
const catalogIds = MODEL_CATALOG.map((m) => m.id);
const ids = only.length ? only : [...new Set([...catalogIds, ...SAMPLE_IDS])];

const visuals: { v: EntityVisual; t: number }[] = [];
const SPACING = 2.6;
let n = 0;
const place = (obj: THREE.Object3D) => {
  const col = n % cols;
  const row = Math.floor(n / cols);
  obj.position.set(col * SPACING, 0, row * SPACING);
  n++;
};
const add = (v: EntityVisual) => {
  place(v.object);
  scene.add(v.object);
  visuals.push({ v, t: 0 });
};

await factory.preload(ids);
for (const id of ids) {
  const v = factory.create(id);
  if (id.startsWith('hero.')) {
    v.setAttachment('mainHand', 'item.blueLitesaber', 0x4fc3ff);
    if (id.endsWith('forseAdept')) v.setAttachment('offHand', 'item.energyShield');
    if (id.endsWith('bountyHuntur')) v.setAttachment('mainHand', 'item.blasterPistol');
    if (id.endsWith('yediKnight') && !params.has('nohelm')) v.setAttachment('head', 'item.battleHelm');
    if (params.has('chest')) v.setAttachment('chest', `item.${params.get('chest')}`);
    const armor = (params.get('armor') ?? '').split(',');
    (['head', 'body', 'arms', 'legs'] as const).forEach((part, i) =>
      v.setOutfit?.(part, armorLook(armor[i])),
    );
  }
  add(v);
}
if (!only.length) {
  const v = factory.create('hero.yediKnight');
  v.setAttachment('mainHand', 'item.doubleLitesaber', 0xff3030);
  v.setTint(0x66b3ff);
  add(v);
  const w = factory.create('mon.battleDroyd');
  w.setHighlight(true, 0xffd23f);
  w.setTint(0x6aff6a);
  add(w);
}

// static meshes: tilesets x kinds, instanced
const statics = new THREE.Group();
scene.add(statics);
let tileRow = Math.ceil(n / cols) + 1;
for (const ts of only.length ? [] : TILESETS) {
  let x = 0;
  for (const kind of TILE_KINDS) {
    for (const part of factory.getStaticMesh(`tile.${ts}.${kind}`)) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, 4);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 4; i++) {
        m.makeTranslation(x + (i % 2), 0, tileRow * SPACING + Math.floor(i / 2));
        im.setMatrixAt(i, m);
      }
      statics.add(im);
    }
    x += 2.4;
  }
  tileRow += 1.2;
}
const maxX = only.length
  ? (Math.min(n, cols) - 1) * SPACING
  : Math.max((cols - 1) * SPACING, TILE_KINDS.length * 2.4) + 2;
const maxZ = only.length ? (Math.ceil(n / cols) - 1) * SPACING : tileRow * SPACING + 2;

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  const cx = maxX / 2;
  const cz = maxZ / 2;
  const [vx, vz] = VIEW_DIR[view] ?? [1, 1];
  const vl = Math.hypot(vx, vz);
  const elev = view === 'iso' ? 30 * 0.82 : 12;
  camera.position.set(cx + (vx / vl) * 42, elev + (only.length ? 0.8 : 0), cz + (vz / vl) * 42);
  camera.lookAt(cx, only.length ? 0.8 : 0, cz);
  const span = (Math.hypot(maxX, maxZ) / 2 + (only.length ? 1.6 : 1)) / zoom;
  const aspect = w / h;
  camera.left = -span * aspect * 0.75;
  camera.right = span * aspect * 0.75;
  camera.top = span * 0.75;
  camera.bottom = -span * 0.75;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

if (params.has('paused')) {
  // Pose every model at `t` seconds into `mode`, stepping in small increments so blends settle.
  (window as unknown as { __pose: (m: ActorMode, t: number) => void }).__pose = (m, t) => {
    // Reset through another mode, then jump to just before t and play the last 0.25s so fades settle.
    const lead = Math.min(t, 0.4);
    for (const e of visuals) {
      e.v.setMode(m === 'idle' ? 'walk' : 'idle', 0, 1);
      e.v.update(0);
      e.v.setMode(m, t - lead, 1);
      for (let s = 0; s < lead - 1e-6; s += 1 / 60) e.v.update(1 / 60);
    }
    renderer.render(scene, camera);
  };
}
const clock = new THREE.Timer();
let modeIdx = 0;
let modeClock = 0;
renderer.setAnimationLoop(() => {
  if (params.has('paused')) return;
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  modeClock += dt;
  if (!fixedMode && modeClock > 2.2) {
    modeClock = 0;
    modeIdx = (modeIdx + 1) % MODES.length;
    for (const e of visuals) e.t = 0;
  }
  const mode = fixedMode ?? MODES[modeIdx] ?? 'idle';
  hud.textContent = `mode: ${mode}   models: ${visuals.length}`;
  for (const e of visuals) {
    e.t += dt;
    e.v.setMode(mode, e.t, 1);
    e.v.update(dt);
  }
  renderer.render(scene, camera);
});
(window as unknown as { __ready: boolean }).__ready = true;
