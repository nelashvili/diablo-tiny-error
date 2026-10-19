import * as THREE from 'three';
import type { GeneratedLevel, TileKind } from '../../core/world/types';
import type { QualityLevel, VisualFactory } from '../types';
import { CHUNK_SIZE, chunkGrid, chunkIndexOf, countKindsPerChunk, hash01 } from './chunking';
import { TERRAIN_KINDS, buildTerrain } from '../terrain/terrain';
import { depthInto, dressingFor, propVariant, scatterFor, tileTint } from './dressing';

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material };

export interface MapLightSpec {
  x: number;
  z: number;
  color: number;
  intensity: number;
  radius: number;
}

export interface MapRenderer {
  readonly group: THREE.Group;
  readonly lights: MapLightSpec[];
  /** Number of InstancedMesh batches (upper bound of map draw calls with no culling). */
  readonly batchCount: number;
  /** Update the wall cutaway focus (world x, z). */
  setFocus(x: number, z: number): void;
  setWallCutaway(on: boolean): void;
  /** Animate the terrain (water). */
  update(dt: number): void;
  dispose(): void;
}

interface KindStyle {
  /** 'flat' = footprint-normalised slab with its top at `top`; 'block' = tall block with its base at 0. */
  mode: 'flat' | 'block';
  top?: number;
  height?: number;
  heightJitter?: number;
  shade?: number;
  fade?: boolean;
}

const STYLE: Record<Exclude<TileKind, 'void'>, KindStyle> = {
  floor: { mode: 'flat', top: 0 },
  road: { mode: 'flat', top: 0.005 },
  grass: { mode: 'flat', top: 0 },
  sand: { mode: 'flat', top: 0 },
  bridge: { mode: 'flat', top: 0.04 },
  door: { mode: 'flat', top: 0.01 },
  stairsDown: { mode: 'flat', top: -0.05, shade: 0.8 },
  stairsUp: { mode: 'flat', top: 0.08 },
  water: { mode: 'flat', top: -0.22, shade: 0.9 },
  pit: { mode: 'flat', top: -0.9, shade: 0.3 },
  wall: { mode: 'block', height: 2.4, heightJitter: 0.25, shade: 0.9, fade: true },
  rock: { mode: 'block', height: 1.1, heightJitter: 0.5, shade: 0.95, fade: true },
};

const WALL_MIN_HEIGHT = 0.16;

/** Shared uniforms for the D2-style wall cutaway (walls between camera and player sink). */
function makeWallUniforms(toCamX: number, toCamZ: number) {
  const len = Math.hypot(toCamX, toCamZ) || 1;
  return {
    uFocus: { value: new THREE.Vector2(0, 0) },
    uFwd: { value: new THREE.Vector2(toCamX / len, toCamZ / len) },
    uMinH: { value: 1 },
  };
}
type WallUniforms = ReturnType<typeof makeWallUniforms>;

function makeWallMaterial(src: THREE.Material, u: WallUniforms): THREE.Material {
  const mat = src.clone();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFocus = u.uFocus;
    shader.uniforms.uFwd = u.uFwd;
    shader.uniforms.uMinH = u.uMinH;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'uniform vec2 uFocus;\nuniform vec2 uFwd;\nuniform float uMinH;\nvoid main() {',
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  vec2 wcen = instanceMatrix[3].xz;
  mvPosition = instanceMatrix * mvPosition;
#else
  vec2 wcen = modelMatrix[3].xz;
#endif
  vec2 wd = wcen - uFocus;
  float along = dot( wd, uFwd );
  float side = abs( dot( wd, vec2( -uFwd.y, uFwd.x ) ) );
  float cutF = ( 1.0 - smoothstep( 1.4, 2.8, side ) ) * smoothstep( -0.6, 0.6, along ) * ( 1.0 - smoothstep( 5.0, 6.5, along ) );
  mvPosition.y *= mix( 1.0, uMinH, cutF );
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  mat.customProgramCacheKey = () => 'wallCutaway';
  return mat;
}

interface Norm {
  /** Anchor in source geometry space. */
  ax: number;
  ay: number;
  az: number;
  sx: number;
  sy: number;
  sz: number;
}

function unionBox(parts: Part[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const p of parts) {
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return box;
}

const _size = new THREE.Vector3();
const _ctr = new THREE.Vector3();

export function buildMap(
  level: GeneratedLevel,
  tileset: string,
  visuals: VisualFactory,
  opts: { quality: QualityLevel; toCamX: number; toCamZ: number; maxLights: number },
): MapRenderer {
  const { map } = level;
  const { width, height } = map;
  const group = new THREE.Group();
  group.name = 'map';
  const uniforms = makeWallUniforms(opts.toCamX, opts.toCamZ);
  const ownedMaterials: THREE.Material[] = [];
  const meshes: THREE.InstancedMesh[] = [];

  const partsCache = new Map<string, { parts: Part[]; box: THREE.Box3 }>();
  const getParts = (id: string) => {
    let e = partsCache.get(id);
    if (!e) {
      const parts = visuals.getStaticMesh(id);
      e = { parts, box: unionBox(parts) };
      partsCache.set(id, e);
    }
    return e;
  };
  const wallMats = new Map<THREE.Material, THREE.Material>();

  const grid = chunkGrid(width, height, CHUNK_SIZE);
  // Ground, water and pits are one splat-shaded mesh per chunk; everything else stays instanced on top.
  const terrain = buildTerrain(level, tileset, { quality: opts.quality });
  group.add(terrain.group);
  const counts = countKindsPerChunk(
    map.kinds,
    width,
    height,
    CHUNK_SIZE,
    new Set<string>(['void', ...TERRAIN_KINDS]),
  );
  const dressed = (k: TileKind) => dressingFor(tileset, k) !== undefined;

  // ------------------------------------------------------------------ tiles
  interface Batch {
    meshes: THREE.InstancedMesh[];
    n: number;
    norm: Norm;
    style: KindStyle;
  }
  const batches = new Map<string, Batch>();
  const mkMesh = (parts: Part[], count: number, fade: boolean, cast: boolean, receive: boolean) =>
    parts.map((p) => {
      let material = p.material;
      if (fade) {
        let m = wallMats.get(p.material);
        if (!m) {
          m = makeWallMaterial(p.material, uniforms);
          wallMats.set(p.material, m);
          ownedMaterials.push(m);
        }
        material = m;
      }
      const im = new THREE.InstancedMesh(p.geometry, material, count);
      im.matrixAutoUpdate = false;
      im.castShadow = cast;
      im.receiveShadow = receive;
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      group.add(im);
      meshes.push(im);
      return im;
    });

  for (let ci = 0; ci < counts.length; ci++) {
    const m = counts[ci];
    if (!m) continue;
    for (const [kind, n] of m) {
      const style = STYLE[kind as Exclude<TileKind, 'void'>];
      if (!style || dressed(kind as TileKind)) continue;
      const { parts, box } = getParts(`tile.${tileset}.${kind}`);
      box.getSize(_size);
      box.getCenter(_ctr);
      const sx = 1 / Math.max(_size.x, 1e-4);
      const sz = 1 / Math.max(_size.z, 1e-4);
      let sy = 1;
      let ay = box.max.y;
      if (style.mode === 'block') {
        sy = (style.height ?? 1) / Math.max(_size.y, 1e-4);
        ay = box.min.y;
      }
      batches.set(`${ci}:${kind}`, {
        meshes: mkMesh(parts, n, style.fade === true, false, true),
        n: 0,
        norm: { ax: _ctr.x, ay, az: _ctr.z, sx, sy, sz },
        style,
      });
    }
  }

  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const rotY = new THREE.Quaternion();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const idx = ty * width + tx;
      const kind = map.kinds[idx];
      if (!kind || kind === 'void' || TERRAIN_KINDS.has(kind) || dressed(kind)) continue;
      const ci = chunkIndexOf(grid, tx, ty);
      const b = batches.get(`${ci}:${kind}`);
      if (!b) continue;
      const variant = map.variants[idx] ?? 0;
      const h = hash01(idx, variant);
      const h2 = hash01(variant, idx + 7919);
      const { norm, style } = b;
      let sy = norm.sy;
      let top = style.top ?? 0;
      if (style.mode === 'block') {
        const hj = style.heightJitter ?? 0;
        sy *= 1 + (h - 0.5) * 2 * (hj / (style.height ?? 1));
      }
      top += map.elevation?.[idx] ?? 0;
      rotY.setFromAxisAngle(up, style.mode === 'flat' ? Math.floor(h2 * 4) * (Math.PI / 2) : 0);
      quat.copy(rotY);
      scl.set(norm.sx, sy, norm.sz);
      // M = T(pos) * R * S * T(-anchor)
      pos.set(tx + 0.5, style.mode === 'block' ? (map.elevation?.[idx] ?? 0) : top, ty + 0.5);
      mat.compose(pos, quat, scl);
      mat.multiply(_tmpTranslate.makeTranslation(-norm.ax, -norm.ay, -norm.az));
      const shade = (style.shade ?? 1) * (0.86 + 0.28 * h);
      col.setHex(tileTint(tileset, kind)).multiplyScalar(shade);
      const i = b.n++;
      for (const im of b.meshes) {
        im.setMatrixAt(i, mat);
        im.setColorAt(i, col);
      }
    }
  }

  // ------------------------------------------------------------------ props & lights
  // Every prop instance first, then one InstancedMesh per (chunk, model).
  interface PropInst {
    id: string;
    x: number;
    z: number;
    rot: number;
    scale: number;
    /** Dressed tiles (tree lines, boulders) sink with the wall cutaway; free props don't. */
    fade: boolean;
    cast: boolean;
  }
  const lights: MapLightSpec[] = [];
  const insts: PropInst[] = [];
  const overWet = (x: number, z: number, r: number) => {
    for (let ty = Math.floor(z - r); ty <= Math.floor(z + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        const k = tx >= 0 && ty >= 0 && tx < width && ty < height ? map.kinds[ty * width + tx] : 'void';
        if (k === 'water' || k === 'pit') return true;
      }
    return false;
  };
  const propId = (ref: string) => (ref.startsWith('prop.') ? ref : `prop.${ref}`);
  for (const p of level.placements) {
    if (p.kind === 'light') {
      lights.push({
        x: p.pos.x,
        z: p.pos.y,
        color: typeof p.data?.color === 'number' ? p.data.color : 0xffb060,
        intensity: typeof p.data?.intensity === 'number' ? p.data.intensity : 1,
        radius: typeof p.data?.radius === 'number' ? p.data.radius : 7,
      });
    } else if (p.kind === 'prop' && p.ref) {
      const tx = Math.floor(p.pos.x);
      const ty = Math.floor(p.pos.y);
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      const id = propVariant(propId(p.ref), hash01(tx * 31 + 7, ty * 17 + 3));
      // Decorative only: drop a prop whose footprint would hang over water or a pit.
      getParts(id).box.getSize(_size);
      if (overWet(p.pos.x, p.pos.y, Math.max(_size.x, _size.z) * 0.45)) continue;
      insts.push({
        id,
        x: p.pos.x,
        z: p.pos.y,
        rot: p.facing ?? hash01(tx, ty) * Math.PI * 2,
        scale: 1,
        fade: false,
        cast: opts.quality !== 'low',
      });
    }
  }
  // Dressed tile kinds: one jittered prop per tile (thinned deep inside solid masses).
  const solid = (k: TileKind) => k === 'void' || k === 'wall' || k === 'rock';
  const depth = depthInto(map.kinds, width, height, solid);
  for (let ty = 0; ty < height; ty++)
    for (let tx = 0; tx < width; tx++) {
      const idx = ty * width + tx;
      const kind = map.kinds[idx];
      const d = kind && kind !== 'void' ? dressingFor(tileset, kind) : undefined;
      if (!d) continue;
      if (d.thinBeyond && depth[idx]! > d.thinBeyond && (tx + ty) % 2 === 1) continue;
      const h1 = hash01(idx, 11);
      const h2 = hash01(idx, 23);
      const h3 = hash01(idx, 37);
      insts.push({
        id: d.props[Math.floor(hash01(idx, 5) * d.props.length)]!,
        x: tx + 0.5 + (h1 - 0.5) * 2 * d.jitter,
        z: ty + 0.5 + (h2 - 0.5) * 2 * d.jitter,
        rot: h3 * Math.PI * 2,
        scale: d.scale[0] + (d.scale[1] - d.scale[0]) * hash01(idx, 51),
        fade: true,
        cast: d.castShadow === true && opts.quality === 'high',
      });
    }
  // Ground scatter: small render-only detail on open tiles, by quality.
  const scatterK = opts.quality === 'high' ? 1 : opts.quality === 'medium' ? 0.5 : 0;
  if (scatterK > 0)
    for (let ty = 0; ty < height; ty++)
      for (let tx = 0; tx < width; tx++) {
        const idx = ty * width + tx;
        const kind = map.kinds[idx];
        const sc = kind ? scatterFor(tileset, kind) : undefined;
        if (!sc) continue;
        // Up to two spots per tile, each kept with probability density/2 * quality.
        for (let k = 0; k < 2; k++) {
          if (hash01(idx * 2 + k, 71) >= (sc.density / 2) * scatterK) continue;
          const x = tx + 0.1 + 0.8 * hash01(idx * 2 + k, 79);
          const z = ty + 0.1 + 0.8 * hash01(idx * 2 + k, 83);
          // Shorelines curve into the banks: keep tufts off any tile touching water.
          if (overWet(x, z, 0.6)) continue;
          insts.push({
            id: sc.props[Math.floor(hash01(idx * 2 + k, 73) * sc.props.length)]!,
            x,
            z,
            rot: hash01(idx * 2 + k, 89) * Math.PI * 2,
            scale: sc.scale[0] + (sc.scale[1] - sc.scale[0]) * hash01(idx * 2 + k, 97),
            fade: false,
            cast: false,
          });
        }
      }

  const propBatches = new Map<
    string,
    { meshes: THREE.InstancedMesh[]; n: number; ax: number; ay: number; az: number }
  >();
  const propKey = (inst: PropInst) =>
    `${chunkIndexOf(grid, Math.floor(inst.x), Math.floor(inst.z))}|${inst.fade ? 1 : 0}|${inst.cast ? 1 : 0}|${inst.id}`;
  const propCounts = new Map<string, { n: number; first: PropInst }>();
  for (const inst of insts) {
    const k = propKey(inst);
    const c = propCounts.get(k);
    if (c) c.n++;
    else propCounts.set(k, { n: 1, first: inst });
  }
  for (const [k, { n, first }] of propCounts) {
    const { parts, box } = getParts(first.id);
    box.getCenter(_ctr);
    propBatches.set(k, {
      meshes: mkMesh(parts, n, first.fade, first.cast, true),
      n: 0,
      ax: _ctr.x,
      ay: box.min.y,
      az: _ctr.z,
    });
  }
  for (const inst of insts) {
    const b = propBatches.get(propKey(inst));
    if (!b) continue;
    const tx = Math.min(width - 1, Math.max(0, Math.floor(inst.x)));
    const ty = Math.min(height - 1, Math.max(0, Math.floor(inst.z)));
    pos.set(inst.x, map.elevation?.[ty * width + tx] ?? 0, inst.z);
    rotY.setFromAxisAngle(up, -inst.rot);
    mat.compose(pos, rotY, scl.set(inst.scale, inst.scale, inst.scale));
    mat.multiply(_tmpTranslate.makeTranslation(-b.ax, -b.ay, -b.az));
    const shade = inst.fade ? 0.82 + 0.3 * hash01(Math.floor(inst.x * 7), Math.floor(inst.z * 7)) : 1;
    col.setRGB(shade, shade, shade);
    const i = b.n++;
    for (const im of b.meshes) {
      im.setMatrixAt(i, mat);
      im.setColorAt(i, col);
    }
  }

  for (const im of meshes) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }

  return {
    group,
    lights,
    batchCount: meshes.length,
    setFocus(x, z) {
      uniforms.uFocus.value.set(x, z);
    },
    setWallCutaway(on) {
      uniforms.uMinH.value = on ? WALL_MIN_HEIGHT : 1;
    },
    update(dt) {
      terrain.update(dt);
    },
    dispose() {
      terrain.dispose();
      for (const im of meshes) im.dispose();
      for (const m of ownedMaterials) m.dispose();
      group.removeFromParent();
      meshes.length = 0;
    },
  };
}

const _tmpTranslate = new THREE.Matrix4();
