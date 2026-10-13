/**
 * M0 composition root (owned by the lead). Wires sim + a minimal placeholder iso view so the
 * deploy shows something. Wave 1 replaces the placeholder renderer with render/ modules.
 */
import * as THREE from 'three';
import { SimWorld } from '@/core/sim/world';
import { FixedLoop } from '@/core/sim/loop';
import { t } from '@/data/names';

export function bootstrap(canvas: HTMLCanvasElement, uiRoot: HTMLElement): void {
  const world = new SimWorld(Date.now() >>> 0);
  const loop = new FixedLoop(world, []);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d17);

  // Orthographic isometric camera (D2/D2R-style angle).
  const viewTiles = 14;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x302018, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(10, 20, 5);
  scene.add(sun);

  // Test map: checkerboard floor + a few pillars.
  const tile = new THREE.BoxGeometry(1, 0.2, 1);
  const matA = new THREE.MeshStandardMaterial({ color: 0x3c5a3a });
  const matB = new THREE.MeshStandardMaterial({ color: 0x46683f });
  const size = 24;
  const floorA = new THREE.InstancedMesh(tile, matA, size * size);
  const floorB = new THREE.InstancedMesh(tile, matB, size * size);
  const m = new THREE.Matrix4();
  let ia = 0;
  let ib = 0;
  for (let x = 0; x < size; x++)
    for (let y = 0; y < size; y++) {
      m.makeTranslation(x - size / 2, -0.1, y - size / 2);
      if ((x + y) % 2) floorA.setMatrixAt(ia++, m);
      else floorB.setMatrixAt(ib++, m);
    }
  floorA.count = ia;
  floorB.count = ib;
  scene.add(floorA, floorB);

  const hero = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.8, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xd9c8a0 }),
  );
  hero.position.y = 0.7;
  scene.add(hero);
  const saber = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8),
    new THREE.MeshBasicMaterial({ color: 0x4fc3ff }),
  );
  saber.position.set(0.4, 0.9, 0);
  saber.rotation.z = -0.6;
  scene.add(saber);

  const title = document.createElement('div');
  title.style.cssText =
    'position:absolute;top:16px;left:0;right:0;text-align:center;font-size:28px;font-weight:700;letter-spacing:1px;text-shadow:0 2px 6px #000';
  title.textContent = t('game.title');
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:14px;font-weight:400;opacity:.8;margin-top:4px';
  sub.textContent = t('game.subtitle');
  title.appendChild(sub);
  uiRoot.appendChild(title);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -viewTiles * aspect * 0.5;
    camera.right = viewTiles * aspect * 0.5;
    camera.top = viewTiles * 0.5;
    camera.bottom = -viewTiles * 0.5;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    loop.advance(dt);
    saber.rotation.y += dt * 2;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
