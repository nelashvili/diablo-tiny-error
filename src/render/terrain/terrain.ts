/**
 * Splat terrain: one continuous ground mesh per 16x16-tile chunk, shaded by a toon material that blends
 * four painted ground layers by a blurred, noise-warped weight map (splat.ts), with anti-tiling and
 * large-scale color variation. Water tiles get an animated surface whose shallow edges foam.
 * Replaces the per-tile floor slabs (one draw call per chunk instead of one per kind per chunk).
 */
import * as THREE from 'three';
import type { GeneratedLevel, TileKind } from '../../core/world/types';
import type { QualityLevel } from '../types';
import { CHUNK_SIZE, chunkGrid, chunkRect } from '../map/chunking';
import { getGradientMap } from '../models/toon';
import { resolveAssetUrl } from '../models/helpers';
import { buildSplat, valueNoise, vertexHeights } from './splat';
import { groundSetFor, layerOfKind, type GroundLayer, type GroundSet } from './groundSets';

/** Tile kinds drawn by the terrain (others keep their instanced meshes on top). */
export const TERRAIN_KINDS: ReadonlySet<TileKind> = new Set<TileKind>([
  'floor',
  'grass',
  'road',
  'sand',
  'water',
  'pit',
]);

const SUB = 2;
const SPLAT_RES = 4;
const WATER_Y = -0.1;

export interface Terrain {
  readonly group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

// ------------------------------------------------------------------ shared textures

const texCache = new Map<string, THREE.Texture>();
let maxAniso = 4;

/** Anisotropy for ground textures (seen at a grazing iso angle); set once from the renderer. */
export function setTerrainAnisotropy(n: number): void {
  maxAniso = Math.max(1, Math.min(8, n));
}

function groundTexture(name: string): THREE.Texture {
  let t = texCache.get(name);
  if (!t) {
    t = new THREE.Texture();
    const tex = t;
    if (typeof Image !== 'undefined') {
      new THREE.TextureLoader().load(resolveAssetUrl(`/assets/textures/ground/${name}.jpg`), (img) => {
        tex.image = img.image;
        tex.needsUpdate = true;
      });
    }
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    texCache.set(name, t);
  }
  return t;
}

let noiseTex: THREE.DataTexture | null = null;
/** 128² tileable-enough value noise (R) for macro variation and anti-tiling blends. */
function noiseTexture(): THREE.DataTexture {
  if (!noiseTex) {
    const n = 128;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        // Two octaves on a 16-cell lattice that wraps (x, y mod 16), so the texture tiles.
        const f = (s: number, o: number) => {
          const p = 16 / s;
          const wx = (x / n) * p;
          const wy = (y / n) * p;
          return valueNoise(wx % p, wy % p, o);
        };
        const v = f(1, 3) * 0.65 + f(0.5, 7) * 0.35;
        const i = (y * n + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255);
        data[i + 3] = 255;
      }
    noiseTex = new THREE.DataTexture(data, n, n);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
    noiseTex.generateMipmaps = true;
    noiseTex.needsUpdate = true;
  }
  return noiseTex;
}

// ------------------------------------------------------------------ ground material

const GROUND_PARS = /* glsl */ `
uniform sampler2D tSplat;
uniform vec2 uSplatSize;
uniform sampler2D tL0;
uniform sampler2D tL1;
uniform sampler2D tL2;
uniform sampler2D tL3;
uniform sampler2D tVar;
uniform sampler2D tNoise;
uniform vec4 uScale;
uniform float uVarScale;
uniform vec3 uTint0;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uTint3;
uniform vec3 uVarTint;
varying vec2 vGround;
// Two differently rotated samples blended by noise: hides the texture's repeat.
vec3 groundLayer(sampler2D t, vec2 uv) {
  vec3 a = texture2D(t, uv).rgb;
#ifdef GROUND_SIMPLE
  return a;
#endif
  vec2 r = mat2(0.766, -0.643, 0.643, 0.766) * uv * 0.93 + vec2(0.37, 0.61);
  vec3 b = texture2D(t, r).rgb;
  float k = smoothstep(0.32, 0.68, texture2D(tNoise, uv * 0.21).r);
  return mix(a, b, k);
}
float groundLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

const GROUND_FRAG = /* glsl */ `
{
  vec2 gp = vGround;
  vec4 sw = texture2D(tSplat, gp / uSplatSize);
  float macro = texture2D(tNoise, gp * 0.031).r;
  float fine = texture2D(tNoise, gp * 0.13 + 0.37).r;
  vec3 c0 = groundLayer(tL0, gp * uScale.x);
  c0 = mix(c0, groundLayer(tVar, gp * uVarScale) * uVarTint, smoothstep(0.45, 0.8, macro) * 0.55) * uTint0;
  vec3 c1 = groundLayer(tL1, gp * uScale.y) * uTint1;
  vec3 c2 = groundLayer(tL2, gp * uScale.z) * uTint2;
  vec3 c3 = groundLayer(tL3, gp * uScale.w) * uTint3;
  // Height blend: brighter (raised) texels win at layer borders, giving crisp, natural edges.
  vec4 h = vec4(groundLum(c0), groundLum(c1), groundLum(c2), groundLum(c3));
  vec4 w = sw * (0.35 + h);
  w = w * w * w;
  w /= max(dot(w, vec4(1.0)), 1e-5);
  vec3 g = c0 * w.x + c1 * w.y + c2 * w.z + c3 * w.w;
  g *= 0.86 + 0.28 * mix(macro, fine, 0.4);
  // Pull the saturated CC0 greens toward a softer, painted palette.
  g = mix(vec3(groundLum(g)), g, 0.68);
  diffuseColor.rgb *= g;
}
`;

function linear(hex: number): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function groundMaterial(
  set: GroundSet,
  splat: THREE.DataTexture,
  w: number,
  h: number,
  quality: QualityLevel,
): THREE.Material {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getGradientMap() });
  // Below high quality: one texture sample per layer (no anti-tiling second sample).
  if (quality !== 'high') m.defines = { ...m.defines, GROUND_SIMPLE: '' };
  // The ground textures are painted already: skip the generic brush strokes.
  m.defines = { ...m.defines, NO_PAINT: '' };
  m.name = 'Ground';
  const L = set.layers;
  const uniforms = {
    tSplat: { value: splat },
    uSplatSize: { value: new THREE.Vector2(w, h) },
    tL0: { value: groundTexture(L[0].tex) },
    tL1: { value: groundTexture(L[1].tex) },
    tL2: { value: groundTexture(L[2].tex) },
    tL3: { value: groundTexture(L[3].tex) },
    tVar: { value: groundTexture(set.variation.tex) },
    tNoise: { value: noiseTexture() },
    uScale: { value: new THREE.Vector4(...L.map((l: GroundLayer) => 1 / l.scale)) },
    uVarScale: { value: 1 / set.variation.scale },
    uTint0: { value: linear(L[0].tint) },
    uTint1: { value: linear(L[1].tint) },
    uTint2: { value: linear(L[2].tint) },
    uTint3: { value: linear(L[3].tint) },
    uVarTint: { value: linear(set.variation.tint) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_PARS}`)
      .replace('#include <map_fragment>', GROUND_FRAG);
  };
  m.customProgramCacheKey = () => `splatGround${quality === 'high' ? '' : 'Simple'}`;
  return m;
}

// ------------------------------------------------------------------ water material

const WATER_VERT = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec2 vXZ;
#include <common>
#include <fog_pars_vertex>
void main() {
  vDepth = aDepth;
  vXZ = (modelMatrix * vec4(position, 1.0)).xz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */ `
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uTime;
uniform sampler2D tNoise;
varying float vDepth;
varying vec2 vXZ;
#include <fog_pars_fragment>
void main() {
  // The surface spans the banks too; it ends where the bank rises above it, along a noisy contour.
  float edgeN = texture2D(tNoise, vXZ * 1.7).r;
  float dep = vDepth + (edgeN - 0.5) * 0.06;
  if (dep < 0.0) discard;
  float d = clamp(dep / 0.22, 0.0, 1.0);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.1, 1.0, d));
  float n1 = texture2D(tNoise, vXZ * 0.35 + vec2(uTime * 0.03, uTime * 0.017)).r;
  float n2 = texture2D(tNoise, vXZ * 0.6 - vec2(uTime * 0.021, -uTime * 0.026)).r;
  // Toon glints: a few bright ripple bands, stepped.
  float glint = step(0.8, n1 * 0.6 + n2 * 0.6);
  col += glint * 0.12;
  // Foam where the water is shallow (along the banks), broken up by noise.
  float foam = 1.0 - smoothstep(0.015, 0.06 + 0.05 * n2, dep);
  col = mix(col, vec3(0.92, 0.96, 1.0), foam * 0.85);
  gl_FragColor = vec4(col, 0.9 - 0.25 * (1.0 - d) + foam * 0.1);
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

function waterMaterial(set: GroundSet): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uShallow: { value: new THREE.Color(set.water[0]) },
      uDeep: { value: new THREE.Color(set.water[1]) },
      uTime: { value: 0 },
      tNoise: { value: noiseTexture() },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
}

// ------------------------------------------------------------------ meshes

/** Build the terrain for a level. */
export function buildTerrain(
  level: GeneratedLevel,
  tileset: string,
  opts: { quality: QualityLevel },
): Terrain {
  const { map } = level;
  const { width: W, height: H, kinds } = map;
  const set = groundSetFor(tileset);
  const group = new THREE.Group();
  group.name = 'terrain';

  const splat = buildSplat(map, (k) => layerOfKind(set, k), { res: SPLAT_RES, seed: level.seed | 0 });
  const splatTex = new THREE.DataTexture(splat.data, splat.width, splat.height);
  splatTex.magFilter = THREE.LinearFilter;
  splatTex.minFilter = THREE.LinearFilter;
  splatTex.needsUpdate = true;
  const heights = vertexHeights(map, SUB);
  const vw = W * SUB + 1;
  const hAt = (i: number, j: number) => heights[Math.min(vw * (H * SUB + 1) - 1, j * vw + i)] ?? 0;

  // Water surface covers water tiles and their neighbours (the shader trims it to the shoreline).
  const nearWater = (tx: number, ty: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && kinds[y * W + x] === 'water') return true;
      }
    return false;
  };
  const ground = groundMaterial(set, splatTex, W, H, opts.quality);
  const water = waterMaterial(set);
  const geos: THREE.BufferGeometry[] = [];
  const grid = chunkGrid(W, H, CHUNK_SIZE);
  for (let ci = 0; ci < grid.cols * grid.rows; ci++) {
    const r = chunkRect(grid, ci, W, H);
    const cw = (r.x1 - r.x0) * SUB + 1;
    const ch = (r.y1 - r.y0) * SUB + 1;
    const pos = new Float32Array(cw * ch * 3);
    const nor = new Float32Array(cw * ch * 3);
    const depth = new Float32Array(cw * ch);
    for (let j = 0; j < ch; j++)
      for (let i = 0; i < cw; i++) {
        const gi = r.x0 * SUB + i;
        const gj = r.y0 * SUB + j;
        const k = (j * cw + i) * 3;
        const y = hAt(gi, gj);
        pos[k] = gi / SUB;
        pos[k + 1] = y;
        pos[k + 2] = gj / SUB;
        // Normal from central differences of the height grid.
        const dx = (hAt(Math.min(vw - 1, gi + 1), gj) - hAt(Math.max(0, gi - 1), gj)) * SUB * 0.5;
        const dz = (hAt(gi, Math.min(H * SUB, gj + 1)) - hAt(gi, Math.max(0, gj - 1))) * SUB * 0.5;
        const len = Math.hypot(dx, 1, dz);
        nor[k] = -dx / len;
        nor[k + 1] = 1 / len;
        nor[k + 2] = -dz / len;
        depth[j * cw + i] = WATER_Y - y;
      }
    const gIdx: number[] = [];
    const wIdx: number[] = [];
    for (let ty = r.y0; ty < r.y1; ty++)
      for (let tx = r.x0; tx < r.x1; tx++) {
        const kind = kinds[ty * W + tx];
        if (!kind || kind === 'void') continue;
        const into = nearWater(tx, ty) ? [gIdx, wIdx] : [gIdx];
        for (let sj = 0; sj < SUB; sj++)
          for (let si = 0; si < SUB; si++) {
            const i0 = (tx - r.x0) * SUB + si;
            const j0 = (ty - r.y0) * SUB + sj;
            const a = j0 * cw + i0;
            const b = a + 1;
            const c = a + cw;
            const d = c + 1;
            for (const list of into) list.push(a, c, b, b, c, d);
          }
      }
    if (gIdx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(gIdx);
      g.computeBoundingSphere();
      geos.push(g);
      const mesh = new THREE.Mesh(g, ground);
      mesh.receiveShadow = opts.quality !== 'low';
      mesh.matrixAutoUpdate = false;
      mesh.name = `ground_${ci}`;
      group.add(mesh);
    }
    if (wIdx.length) {
      const g = new THREE.BufferGeometry();
      const wpos = pos.slice();
      for (let v = 0; v < cw * ch; v++) wpos[v * 3 + 1] = WATER_Y;
      g.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
      g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
      g.setIndex(wIdx);
      g.computeBoundingSphere();
      geos.push(g);
      const mesh = new THREE.Mesh(g, water);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      mesh.name = `water_${ci}`;
      group.add(mesh);
    }
  }

  let time = 0;
  return {
    group,
    update(dt) {
      time += dt;
      water.uniforms['uTime']!.value = time;
    },
    dispose() {
      for (const g of geos) g.dispose();
      ground.dispose();
      water.dispose();
      splatTex.dispose();
      group.removeFromParent();
    },
  };
}
