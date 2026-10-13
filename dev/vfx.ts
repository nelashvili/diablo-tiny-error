/** VFX lab: trigger every VfxDef over a ground plane with the iso ortho camera. */
import * as THREE from 'three';
import { DB } from '../src/data/db';
import { createVfxSystem } from '../src/render/vfx';
import { createPostFx } from '../src/render/vfx/post';
import type { QualityLevel, VfxDef } from '../src/render/types';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14182a);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 100);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);
const VIEW = 12;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshBasicMaterial({ color: 0x2a3050 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x3a4270, 0x232a48);
grid.position.y = 0.01;
scene.add(grid);

const hero = new THREE.Object3D();
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 1, 4, 8),
  new THREE.MeshBasicMaterial({ color: 0x8890b0 }),
);
body.position.y = 0.85;
hero.add(body);
const blade = new THREE.Object3D();
hero.add(blade);
scene.add(hero);

const vfx = createVfxSystem();
scene.add(vfx.root);
const post = createPostFx(renderer, scene, camera);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const a = w / h;
  camera.left = -VIEW * a * 0.5;
  camera.right = VIEW * a * 0.5;
  camera.top = VIEW * 0.5;
  camera.bottom = -VIEW * 0.5;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.resize(w, h, renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

const PERSIST = new Set(['aura', 'buffGlow', 'lootBeam', 'portal']);
const handles = new Map<string, { stop(): void }>();
const ui = document.getElementById('ui') as HTMLElement;
const buttons = new Map<string, HTMLButtonElement>();

let at = { x: 0, y: 0 };
function trigger(def: VfxDef): void {
  const p = def.primitive;
  const prev = handles.get(def.id);
  if (prev) {
    prev.stop();
    handles.delete(def.id);
    buttons.get(def.id)?.classList.remove('on');
    return;
  }
  if (PERSIST.has(p) || p === 'saberTrail') {
    const h = vfx.attach(def.id, p === 'saberTrail' ? blade : hero);
    handles.set(def.id, h);
    buttons.get(def.id)?.classList.add('on');
    if (p === 'saberTrail') vfx.spawn(def.id, { x: 0, y: 0 }, { dir: 0, radius: 1.8 });
    return;
  }
  const o = { dir: Math.PI * 0.25, radius: p === 'bolt' || p === 'beam' ? 6 : undefined };
  vfx.spawn(def.id, at, o);
}

const groups = new Map<string, VfxDef[]>();
for (const d of DB.vfx.values()) {
  const g = groups.get(d.primitive) ?? [];
  g.push(d);
  groups.set(d.primitive, g);
}
for (const [prim, list] of groups) {
  const h = document.createElement('h4');
  h.textContent = prim;
  ui.appendChild(h);
  for (const d of list) {
    const b = document.createElement('button');
    b.textContent = d.id.replace('vfx.', '');
    b.dataset['id'] = d.id;
    b.onclick = () => trigger(d);
    ui.appendChild(b);
    buttons.set(d.id, b);
  }
}

const q = document.getElementById('q') as HTMLSelectElement;
q.onchange = () => {
  vfx.setQuality(q.value as QualityLevel);
  post.setQuality(q.value as QualityLevel);
};
const gr = document.getElementById('grade') as HTMLSelectElement;
gr.onchange = () => post.setGrade(gr.value || null);

// Key: space = fire a salvo of every one-shot primitive.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  let i = 0;
  const list = [...DB.vfx.values()].filter((d) => !PERSIST.has(d.primitive) && d.primitive !== 'saberTrail');
  for (const d of list) {
    const a = (i++ / list.length) * Math.PI * 2;
    at = { x: Math.cos(a) * 5, y: Math.sin(a) * 5 };
    trigger(d);
  }
  at = { x: 0, y: 0 };
});

const info = document.getElementById('info') as HTMLElement;
let last = performance.now();
let frames = 0;
let acc = 0;
let maxCalls = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  blade.position.set(Math.cos(t * 5) * 1.3, 1 + Math.sin(t * 5) * 0.4, Math.sin(t * 5) * 1.3);
  vfx.update(dt);
  post.render(dt);
  maxCalls = Math.max(maxCalls, renderer.info.render.calls);
  frames++;
  acc += dt;
  if (acc > 0.5) {
    info.textContent = `${Math.round(frames / acc)} fps  calls ${renderer.info.render.calls}  `;
    frames = 0;
    acc = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>)['__vfx'] = {
  vfx,
  post,
  trigger: (id: string, x = 0, y = 0) => {
    const d = DB.vfx.get(id);
    at = { x, y };
    if (d) trigger(d);
    at = { x: 0, y: 0 };
  },
  ids: [...DB.vfx.keys()],
  maxCalls: () => maxCalls,
};
