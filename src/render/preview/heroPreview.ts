/**
 * Hero preview: the player's hero model dressed in their current equipment, turning on a small stage,
 * for the Hero screen. Owns one WebGL context and one canvas for the whole session (the screen mounts
 * and unmounts that canvas), and only draws while the screen is open.
 */
import * as THREE from 'three';
import type { EntityVisual, VisualFactory } from '../types';
import { createVisualFactory } from '../models';
import { applyDress, dressOf, type Dress, type WornItem } from '../models/dress';

export type PreviewPose = 'idle' | 'walk' | 'attack' | 'cast';

export interface HeroPreview {
  /** The canvas to put on screen; the same element for the life of the preview. */
  readonly canvas: HTMLCanvasElement;
  /** Show this hero model wearing `equipment` (cheap when nothing changed: call every frame). */
  show(modelId: string, equipment: Readonly<Partial<Record<string, WornItem>>>): void;
  setPose(pose: PreviewPose): void;
  /** Turn the hero by `rad` (dragging); `autoSpin` keeps a slow turn going. */
  turn(rad: number): void;
  setAutoSpin(on: boolean): void;
  /** Size in CSS pixels. */
  resize(width: number, height: number): void;
  /** Draw only while the screen is open. */
  setActive(on: boolean): void;
}

/** One-shot poses replay on this period (seconds). */
const REPLAY_SEC: Partial<Record<PreviewPose, number>> = { attack: 1.4, cast: 1.6 };
const SPIN_RAD_PER_SEC = 0.35;
/** Default three-quarter turn toward the viewer's left. */
const START_YAW = -0.45;
const FOV = 28;
/** Frame margin around the hero (fraction of its height). */
const MARGIN = 0.12;

export function createHeroPreview(): HeroPreview | null {
  let gl: THREE.WebGLRenderer;
  try {
    gl = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return null;
  }
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.setClearColor(0x000000, 0);
  gl.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  const canvas = gl.domElement;
  canvas.classList.add('dte-hero-canvas');

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3428, 1.5));
  const key = new THREE.DirectionalLight(0xfff2d8, 2.4);
  key.position.set(-3, 6, 5);
  const rim = new THREE.DirectionalLight(0x9ad0ff, 1.8);
  rim.position.set(4, 3, -5);
  scene.add(key, rim);
  // A soft pool of light on the floor grounds the hero.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: floorGlow(), transparent: true, depthWrite: false }),
  );
  floor.position.y = 0.005;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const factory: VisualFactory = createVisualFactory({ renderer: gl });
  const stage = new THREE.Group();
  scene.add(stage);

  let visual: EntityVisual | null = null;
  let modelId = '';
  let dress: Dress | null = null;
  let worn: Parameters<HeroPreview['show']>[1] = {};
  let loading = '';
  let pose: PreviewPose = 'idle';
  let poseT = 0;
  let yaw = START_YAW;
  let spin = false;
  let active = false;
  let raf = 0;
  let last = 0;
  // Camera framing follows the hero's size (a tall staff or a big helm zooms out a little).
  let fitTimer = 0;
  let fitHeight = 1.9;
  let viewHeight = 1.9;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();

  const build = (id: string) => {
    if (visual) {
      stage.remove(visual.object);
      visual.dispose();
    }
    visual = factory.create(id);
    stage.add(visual.object);
    poseT = 0;
    visual.setMode(pose, 0, 1);
    dress = dressOf(worn);
    applyDress(visual, dress, null);
    fitTimer = 0;
  };

  const frame = (now: number) => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!visual) return;
    if (spin) yaw += SPIN_RAD_PER_SEC * dt;
    visual.setFacing(Math.PI / 2 - yaw);
    poseT += dt;
    const replay = REPLAY_SEC[pose];
    if (replay && poseT > replay) {
      poseT = 0;
      visual.setMode('idle', 0, 1);
      visual.setMode(pose, 0, 1);
    }
    visual.update(dt);
    fitTimer -= dt;
    if (fitTimer <= 0) {
      fitTimer = 0.3;
      box.setFromObject(visual.object);
      if (!box.isEmpty()) fitHeight = THREE.MathUtils.clamp(box.getSize(size).y, 1, 3.5);
    }
    viewHeight += (fitHeight - viewHeight) * Math.min(1, dt * 4);
    frameCamera();
    gl.render(scene, camera);
  };

  const frameCamera = () => {
    const half = (viewHeight * (1 + MARGIN * 2)) / 2;
    const vFov = THREE.MathUtils.degToRad(FOV);
    // Fit the height, or the width when the stage is narrower than the hero is tall.
    const fitH = half / Math.tan(vFov / 2);
    const fitW = (viewHeight * 0.7) / (Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(fitH, fitW);
    const cy = viewHeight / 2;
    camera.position.set(0, cy + dist * 0.12, dist);
    camera.lookAt(0, cy, 0);
  };

  return {
    canvas,
    show(id, equipment) {
      worn = equipment;
      if (id !== modelId) {
        modelId = id;
        loading = id;
        // Show the placeholder now, then rebuild once the real model has loaded.
        build(id);
        void factory.preload([id]).then(() => {
          if (loading !== id) return;
          loading = '';
          build(id);
        });
        return;
      }
      if (!visual) return;
      const d = dressOf(equipment);
      if (dress && sameDress(d, dress)) return;
      applyDress(visual, d, dress);
      dress = d;
      fitTimer = 0;
    },
    setPose(p) {
      if (p === pose) return;
      pose = p;
      poseT = 0;
      visual?.setMode(p, 0, 1);
    },
    turn(rad) {
      yaw += rad;
    },
    setAutoSpin(on) {
      spin = on;
    },
    resize(width, height) {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      gl.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}

function sameDress(a: Dress, b: Dress): boolean {
  return (
    a.mainHand === b.mainHand &&
    a.offHand === b.offHand &&
    a.head === b.head &&
    a.chest === b.chest &&
    a.gloves === b.gloves &&
    a.boots === b.boots
  );
}

/** Radial glow texture for the floor disc. */
function floorGlow(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 214, 140, 0.45)');
    grad.addColorStop(0.55, 'rgba(255, 190, 110, 0.16)');
    grad.addColorStop(1, 'rgba(255, 190, 110, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
