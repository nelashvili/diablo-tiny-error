import * as THREE from 'three';
import type { QualityLevel } from '../types';
import type { MapLightSpec } from '../map/mapRenderer';
import { hash01 } from '../map/chunking';

export interface LightPreset {
  sky: number;
  ground: number;
  hemi: number;
  sun: number;
  sunI: number;
  bg: number;
  playerLight: number;
  playerLightI: number;
}

const PRESETS: { match: RegExp; preset: LightPreset }[] = [
  {
    match: /desert|sand|tatoo|dune|oasis/i,
    preset: {
      sky: 0xffe2b0,
      ground: 0x6b4a2a,
      hemi: 1.1,
      sun: 0xffd9a0,
      sunI: 2.4,
      bg: 0x1a120a,
      playerLight: 0xffc890,
      playerLightI: 8,
    },
  },
  {
    match: /moss|swamp|jungle|forest|endoor|bog|grass/i,
    preset: {
      sky: 0xbfe6c0,
      ground: 0x24301c,
      hemi: 1.0,
      sun: 0xe8f2c0,
      sunI: 2.0,
      bg: 0x0a120b,
      playerLight: 0xd8ffc0,
      playerLightI: 8,
    },
  },
  {
    match: /ice|snow|frost|hoth|glacier|cryo/i,
    preset: {
      sky: 0xcfe6ff,
      ground: 0x30445c,
      hemi: 1.2,
      sun: 0xe6f1ff,
      sunI: 2.2,
      bg: 0x0a1018,
      playerLight: 0xbfe0ff,
      playerLightI: 7,
    },
  },
  {
    match: /lava|fire|volcan|mustaf|magma|forge|plasma/i,
    preset: {
      sky: 0xff9a60,
      ground: 0x3a120a,
      hemi: 0.8,
      sun: 0xff8a50,
      sunI: 1.8,
      bg: 0x120504,
      playerLight: 0xffa070,
      playerLightI: 10,
    },
  },
  {
    match: /dungeon|cave|crypt|station|deaf|metal|ship|base|ruin|hangar/i,
    preset: {
      sky: 0x8aa0d0,
      ground: 0x1a1c28,
      hemi: 0.75,
      sun: 0xa8bce8,
      sunI: 1.4,
      bg: 0x06070d,
      playerLight: 0xbad0ff,
      playerLightI: 10,
    },
  },
];

const DEFAULT_PRESET: LightPreset = {
  sky: 0xbcd0f0,
  ground: 0x2a2a30,
  hemi: 1.0,
  sun: 0xfff0dc,
  sunI: 2.0,
  bg: 0x0b0d17,
  playerLight: 0xffe0b0,
  playerLightI: 8,
};

export function presetFor(tileset: string): LightPreset {
  for (const p of PRESETS) if (p.match.test(tileset)) return p.preset;
  // unknown tileset: deterministic tweak of the default so different areas still differ
  let h = 0;
  for (let i = 0; i < tileset.length; i++) h = (h * 31 + tileset.charCodeAt(i)) | 0;
  const t = hash01(h);
  const c = new THREE.Color(DEFAULT_PRESET.sky).offsetHSL(t - 0.5, 0.05, 0);
  return { ...DEFAULT_PRESET, sky: c.getHex() };
}

export const POINT_LIGHT_LIMIT: Record<QualityLevel, number> = { low: 0, medium: 4, high: 8 };
const SHADOW_HALF = 17;
const SUN_DIR = new THREE.Vector3(-0.55, 1.0, 0.35).normalize();

/** Hemisphere + one shadow-casting directional light that follows the camera target + point-light pool. */
export class SceneLighting {
  readonly group = new THREE.Group();
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly playerLight = new THREE.PointLight(0xffffff, 8, 9, 1.6);
  private pool: THREE.PointLight[] = [];
  private poolTimer = 0;
  private specs: MapLightSpec[] = [];
  private used = new Uint8Array(0);
  private quality: QualityLevel = 'medium';
  private shadows = false;

  constructor() {
    this.sun.castShadow = false;
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_HALF;
    sc.right = SHADOW_HALF;
    sc.top = SHADOW_HALF;
    sc.bottom = -SHADOW_HALF;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.hemi, this.sun, this.sun.target, this.playerLight);
  }

  apply(p: LightPreset): void {
    this.hemi.color.setHex(p.sky);
    this.hemi.groundColor.setHex(p.ground);
    this.hemi.intensity = p.hemi;
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunI;
    this.playerLight.color.setHex(p.playerLight);
    // Kept subtle: a strong point light washes out light ground (and blooms) around the hero.
    this.playerLight.intensity = p.playerLightI * 0.2;
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.shadows = q !== 'low';
    this.sun.castShadow = this.shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.playerLight.visible = true;
    const n = POINT_LIGHT_LIMIT[q];
    while (this.pool.length < n) {
      const l = new THREE.PointLight(0xffa060, 0, 8, 1.8);
      this.pool.push(l);
      this.group.add(l);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      if (l) l.visible = i < n;
    }
  }

  get shadowsEnabled(): boolean {
    return this.shadows;
  }

  setMapLights(specs: MapLightSpec[]): void {
    this.specs = specs;
    this.used = new Uint8Array(specs.length);
    this.poolTimer = 99;
  }

  follow(tx: number, tz: number, px: number, pz: number, dt: number): void {
    const sx = Math.round(tx * 4) / 4;
    const sz = Math.round(tz * 4) / 4;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + SUN_DIR.x * 45, SUN_DIR.y * 45, sz + SUN_DIR.z * 45);
    this.sun.target.updateMatrixWorld();
    this.playerLight.position.set(px, 3.2, pz);

    this.poolTimer += dt;
    if (this.poolTimer < 0.25) return;
    this.poolTimer = 0;
    const n = POINT_LIGHT_LIMIT[this.quality];
    this.used.fill(0);
    for (let slot = 0; slot < this.pool.length; slot++) {
      const l = this.pool[slot];
      if (!l) continue;
      let best = -1;
      let bestD = Infinity;
      if (slot < n) {
        for (let i = 0; i < this.specs.length; i++) {
          if (this.used[i]) continue;
          const s = this.specs[i];
          if (!s) continue;
          const d = (s.x - tx) * (s.x - tx) + (s.z - tz) * (s.z - tz);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      const s = best >= 0 && bestD < 28 * 28 ? this.specs[best] : undefined;
      if (s) {
        this.used[best] = 1;
        l.position.set(s.x, 1.6, s.z);
        l.color.setHex(s.color);
        l.intensity = 6 * s.intensity;
        l.distance = s.radius;
      } else {
        l.intensity = 0;
      }
    }
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.group.removeFromParent();
  }
}
