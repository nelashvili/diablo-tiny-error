/**
 * Ground mist: one or two large translucent sheets just above the ground that follow the view, with
 * world-space noise drifting through them, so mist pools around ankles and trees and slowly moves.
 */
import * as THREE from 'three';
import type { QualityLevel } from '../types';

/** Sheet heights (world units) and how strong each is. */
const SHEETS = [
  { y: 0.25, alpha: 1, scale: 0.09, speed: [0.12, 0.05] },
  { y: 0.7, alpha: 0.6, scale: 0.06, speed: [-0.07, 0.09] },
] as const;
const SIZE = 60;

/** Sheets drawn per quality (low has no mist). */
export const MIST_SHEETS: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };

const VERT = /* glsl */ `
varying vec2 vXZ;
varying vec2 vLocal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  vLocal = position.xy / ${(SIZE / 2).toFixed(1)};
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDensity;
uniform float uTime;
uniform float uScale;
uniform vec2 uSpeed;
varying vec2 vXZ;
varying vec2 vLocal;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vXZ * uScale + uSpeed * uTime;
  float n = vnoise(p) * 0.6 + vnoise(p * 2.3 + 7.1) * 0.3 + vnoise(p * 5.1 - 3.7) * 0.1;
  float a = smoothstep(0.38, 0.8, n) * uDensity;
  // Fade toward the sheet's edges so its border never shows.
  a *= 1.0 - smoothstep(0.7, 1.0, max(abs(vLocal.x), abs(vLocal.y)));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export class GroundMist {
  readonly group = new THREE.Group();
  private readonly sheets: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private count = MIST_SHEETS.medium;

  constructor() {
    this.group.name = 'mist';
    const geo = new THREE.PlaneGeometry(SIZE, SIZE);
    geo.rotateX(-Math.PI / 2);
    // Local xy for the edge fade: the rotated plane's x and -z.
    for (const s of SHEETS) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color() },
          uDensity: { value: 0 },
          uTime: { value: 0 },
          uScale: { value: s.scale },
          uSpeed: { value: new THREE.Vector2(...s.speed) },
        },
        vertexShader: VERT.replace('position.xy', 'vec2(position.x, -position.z)'),
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        // Keep the paint mask (scene alpha) as it is: mist is painted like the ground under it.
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = s.y;
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      this.sheets.push(mesh);
      this.group.add(mesh);
    }
    this.group.visible = false;
  }

  setQuality(q: QualityLevel): void {
    this.count = MIST_SHEETS[q];
  }

  /** Mist of `density` (0..1) and `color` around the view center at time `time` (seconds). */
  update(density: number, color: number, cx: number, cz: number, time: number): void {
    const on = density > 0.01 && this.count > 0;
    this.group.visible = on;
    if (!on) return;
    for (let i = 0; i < this.sheets.length; i++) {
      const mesh = this.sheets[i]!;
      mesh.visible = i < this.count;
      if (!mesh.visible) continue;
      mesh.position.x = cx;
      mesh.position.z = cz;
      const u = mesh.material.uniforms;
      (u['uColor']!.value as THREE.Color).setHex(color);
      u['uDensity']!.value = density * SHEETS[i]!.alpha * 0.55;
      u['uTime']!.value = time % 1000;
    }
  }

  dispose(): void {
    this.sheets[0]?.geometry.dispose();
    for (const s of this.sheets) s.material.dispose();
    this.group.removeFromParent();
  }
}
