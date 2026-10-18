/**
 * VFX system. Fully procedural, pooled, and draw-call frugal (4 draw calls total):
 *   1. additive particles  (instanced camera-facing quads, CPU-simulated, soft procedural sprites)
 *   2. alpha particles     (smoke, dust, scrap)
 *   3. ground quads        (rings / discs / swirls drawn flat on the ground, immediate mode)
 *   4. ribbons             (beams, trails, light pillars, camera-facing strips, immediate mode)
 * All buffers are preallocated; update loops allocate nothing.
 *
 * Param conventions per VfxDef field (see data/vfx/*.ts): size = scale/width/radius depending on the
 * primitive, durationSec = lifetime (persistent primitives live until stopped when attached),
 * particles = burst count or emission rate. Variants are chosen by id in ./styles.ts.
 * `spawn(...).radius` means: area radius for nova/aoeZone/aura, travel distance for bolt, length for
 * beam, arc radius for saberTrail, scale for impact/dissolve/levelUp.
 */
import * as THREE from 'three';
import type { Vec2 } from '../../core/types';
import type { GameEvent } from '../../core/sim/events';
import type { WorldView } from '../../core/sim/world';
import type { QualityLevel, VfxDef, VfxSystem } from '../types';
import { DB } from '../../data/db';
import {
  GROUND_FRAG,
  GROUND_VERT,
  PARTICLE_FRAG,
  PARTICLE_VERT,
  RIBBON_FRAG,
  RIBBON_VERT,
} from '../shaders/vfx';
import { ParticleSet, SHAPE_SCRAP, SHAPE_SOFT, SHAPE_SPARK, SlotPool } from './pool';
import { mapEvents, type EffectSink, type SpawnOpts } from './mapping';
import { styleOf, type VfxStyle } from './styles';

export interface VfxSystemOptions {
  /** Override the def table (tests / dev tools). Defaults to DB.vfx. */
  defs?: ReadonlyMap<string, VfxDef>;
}

const MAX_FX = 256;
const MAX_PARTICLES_ADD = 4096;
const MAX_PARTICLES_ALPHA = 2048;
const MAX_GROUND = 256;
const R_SLOTS = 48;
const R_PTS = 24;
const QUALITY_MUL: Record<QualityLevel, number> = { low: 0.35, medium: 0.7, high: 1 };
const FADE_OUT_SEC = 0.35;
const TAU = Math.PI * 2;
const rnd = Math.random;
const rr = (a: number, b: number): number => a + (b - a) * rnd();
const hr = (c: number): number => ((c >> 16) & 255) / 255;
const hg = (c: number): number => ((c >> 8) & 255) / 255;
const hb = (c: number): number => (c & 255) / 255;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Blastur bolts whose body is drawn as a solid mesh by entitySync. */
const LASER_IDS = new Set(['vfx.bolt.blastur', 'vfx.bolt.blasturBlue']);

const FALLBACK: VfxDef = {
  id: 'vfx.fallback',
  primitive: 'impact',
  color: 0xb36bff,
  color2: 0xffffff,
  size: 1,
  particles: 10,
};

class Fx {
  idx = 0;
  active = false;
  gen = 0;
  def: VfxDef = FALLBACK;
  style: VfxStyle = 'default';
  t = 0;
  dur = 1;
  /** Position (world), height offset, facing and radius/length. */
  x = 0;
  y = 0;
  z = 0;
  dir = 0;
  rad = 1;
  target: THREE.Object3D | null = null;
  stopping = false;
  stopT = 0;
  fade = 1;
  acc = 0;
  histAcc = 0;
  n = 0;
  sx = 0;
  sz = 0;
  hist = new Float32Array(R_PTS * 3);
  histT = new Float32Array(R_PTS);
  jit = new Float32Array(R_PTS * 2);
  strikes = new Float32Array(12);
}

function makeParticleMesh(
  cap: number,
  additive: boolean,
): {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  pos: Float32Array;
  col: Float32Array;
  misc: Float32Array;
  aPos: THREE.InstancedBufferAttribute;
  aCol: THREE.InstancedBufferAttribute;
  aMisc: THREE.InstancedBufferAttribute;
} {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3),
  );
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const pos = new Float32Array(cap * 4);
  const col = new Float32Array(cap * 4);
  const misc = new Float32Array(cap * 2);
  const aPos = new THREE.InstancedBufferAttribute(pos, 4).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aMisc = new THREE.InstancedBufferAttribute(misc, 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aCol', aCol);
  geo.setAttribute('aMisc', aMisc);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    defines: additive ? { ADDITIVE: '' } : {},
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: THREE.OneFactor,
    blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
  });
  if (!additive) {
    // straight alpha output (rgb, a): use classic src-alpha blending
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendSrcAlpha = THREE.OneFactor;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 11 : 10;
  return { mesh, geo, pos, col, misc, aPos, aCol, aMisc };
}

export function createVfxSystem(options?: VfxSystemOptions): VfxSystem {
  const defs: ReadonlyMap<string, VfxDef> = options?.defs ?? DB.vfx;
  const root = new THREE.Group();
  root.name = 'vfx';

  // ---------------------------------------------------------------- particle layers
  const pAdd = new ParticleSet(MAX_PARTICLES_ADD);
  const pAlpha = new ParticleSet(MAX_PARTICLES_ALPHA);
  const addMesh = makeParticleMesh(MAX_PARTICLES_ADD, true);
  const alphaMesh = makeParticleMesh(MAX_PARTICLES_ALPHA, false);
  root.add(alphaMesh.mesh, addMesh.mesh);

  // ---------------------------------------------------------------- ground quads (immediate)
  const gC = new Float32Array(MAX_GROUND * 4);
  const gP = new Float32Array(MAX_GROUND * 4);
  const gCol = new Float32Array(MAX_GROUND * 4);
  const gGeo = new THREE.InstancedBufferGeometry();
  gGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5]), 3),
  );
  gGeo.setIndex([0, 2, 1, 1, 2, 3]);
  const gAttrC = new THREE.InstancedBufferAttribute(gC, 4).setUsage(THREE.DynamicDrawUsage);
  const gAttrP = new THREE.InstancedBufferAttribute(gP, 4).setUsage(THREE.DynamicDrawUsage);
  const gAttrCol = new THREE.InstancedBufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage);
  gGeo.setAttribute('aC', gAttrC);
  gGeo.setAttribute('aP', gAttrP);
  gGeo.setAttribute('aCol', gAttrCol);
  gGeo.instanceCount = 0;
  const gMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
  });
  const gMesh = new THREE.Mesh(gGeo, gMat);
  gMesh.frustumCulled = false;
  gMesh.renderOrder = 9;
  root.add(gMesh);
  let gN = 0;

  // ---------------------------------------------------------------- ribbons (immediate)
  const RV = R_SLOTS * R_PTS * 2;
  const rPos = new Float32Array(RV * 3);
  const rTan = new Float32Array(RV * 3);
  const rInfo = new Float32Array(RV * 3);
  const rCol = new Float32Array(RV * 4);
  const rIdx = new Uint16Array(R_SLOTS * (R_PTS - 1) * 6);
  for (let s = 0; s < R_SLOTS; s++) {
    for (let i = 0; i < R_PTS - 1; i++) {
      const a = s * R_PTS * 2 + i * 2;
      const o = (s * (R_PTS - 1) + i) * 6;
      rIdx[o] = a;
      rIdx[o + 1] = a + 1;
      rIdx[o + 2] = a + 2;
      rIdx[o + 3] = a + 1;
      rIdx[o + 4] = a + 3;
      rIdx[o + 5] = a + 2;
    }
  }
  const rGeo = new THREE.BufferGeometry();
  const rAttrPos = new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage);
  const rAttrTan = new THREE.BufferAttribute(rTan, 3).setUsage(THREE.DynamicDrawUsage);
  const rAttrInfo = new THREE.BufferAttribute(rInfo, 3).setUsage(THREE.DynamicDrawUsage);
  const rAttrCol = new THREE.BufferAttribute(rCol, 4).setUsage(THREE.DynamicDrawUsage);
  rGeo.setAttribute('position', rAttrPos);
  rGeo.setAttribute('aTan', rAttrTan);
  rGeo.setAttribute('aInfo', rAttrInfo);
  rGeo.setAttribute('aCol', rAttrCol);
  rGeo.setIndex(new THREE.BufferAttribute(rIdx, 1));
  rGeo.setDrawRange(0, 0);
  const rMat = new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const rMesh = new THREE.Mesh(rGeo, rMat);
  rMesh.frustumCulled = false;
  rMesh.renderOrder = 12;
  root.add(rMesh);
  let rbN = 0;

  // ---------------------------------------------------------------- effect instances
  const fxPool = new SlotPool(MAX_FX);
  const fxs: Fx[] = [];
  for (let i = 0; i < MAX_FX; i++) {
    const f = new Fx();
    f.idx = i;
    fxs.push(f);
  }
  const pts = new Float32Array(R_PTS * 3);
  const tmpV = new THREE.Vector3();
  const warned = new Set<string>();
  let qm = 1;
  let frameLife = 1 / 40;
  let disposed = false;

  function lookup(id: string): VfxDef {
    const d = defs.get(id);
    if (d) return d;
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`[vfx] unknown vfx id "${id}", using fallback`);
    }
    return FALLBACK;
  }

  const cnt = (n: number): number => Math.max(1, Math.round(n * qm));

  // ------------------------------------------------------------ emit helpers
  function addP(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    s0: number,
    s1: number,
    c0: number,
    c1: number,
    a0: number,
    a1: number,
    drag = 0,
    grav = 0,
    shape = SHAPE_SOFT,
    rot = 0,
    rotV = 0,
  ): void {
    pAdd.emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, a1, drag, grav, shape, rot, rotV);
  }
  function alphaP(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    s0: number,
    s1: number,
    c0: number,
    c1: number,
    a0: number,
    a1: number,
    drag = 0,
    grav = 0,
    shape = SHAPE_SOFT,
    rot = 0,
    rotV = 0,
  ): void {
    pAlpha.emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, a1, drag, grav, shape, rot, rotV);
  }
  /** One-frame soft glow (re-emitted every frame by persistent effects). */
  function glow(x: number, y: number, z: number, size: number, color: number, alpha: number): void {
    if (alpha <= 0.004) return;
    pAdd.emit(x, y, z, 0, 0, 0, frameLife, size, size, color, color, alpha, alpha, 0, 0, SHAPE_SOFT, 0, 0);
  }
  function gq(
    x: number,
    y: number,
    z: number,
    radius: number,
    type: number,
    thick: number,
    phase: number,
    color: number,
    alpha: number,
  ): void {
    if (gN >= MAX_GROUND || alpha <= 0.004 || radius <= 0.001) return;
    const o = gN++ * 4;
    gC[o] = x;
    gC[o + 1] = y;
    gC[o + 2] = z;
    gC[o + 3] = radius;
    gP[o] = type;
    gP[o + 1] = thick;
    gP[o + 2] = phase;
    gCol[o] = hr(color);
    gCol[o + 1] = hg(color);
    gCol[o + 2] = hb(color);
    gCol[o + 3] = alpha;
  }
  /** Writes pts[0..n) as a camera-facing ribbon; width/alpha lerp from head (0) to tail (n-1). */
  function ribbon(
    src: Float32Array,
    n: number,
    w0: number,
    w1: number,
    a0: number,
    a1: number,
    color: number,
  ): void {
    if (n < 2 || rbN >= R_SLOTS) return;
    if (n > R_PTS) n = R_PTS;
    const base = rbN++ * R_PTS * 2;
    const r = hr(color);
    const g = hg(color);
    const b = hb(color);
    let ltx = 1,
      lty = 0,
      ltz = 0;
    for (let i = 0; i < R_PTS; i++) {
      const live = i < n;
      const j = live ? i : n - 1;
      const j0 = j > 0 ? j - 1 : 0;
      const j1 = j < n - 1 ? j + 1 : n - 1;
      let tx = (src[j1 * 3] as number) - (src[j0 * 3] as number);
      let ty = (src[j1 * 3 + 1] as number) - (src[j0 * 3 + 1] as number);
      let tz = (src[j1 * 3 + 2] as number) - (src[j0 * 3 + 2] as number);
      const l = Math.hypot(tx, ty, tz);
      if (l > 1e-6) {
        tx /= l;
        ty /= l;
        tz /= l;
      } else {
        tx = ltx;
        ty = lty;
        tz = ltz;
      }
      const t = n > 1 ? j / (n - 1) : 0;
      const w = live ? w0 + (w1 - w0) * t : 0;
      const a = live ? a0 + (a1 - a0) * t : 0;
      const x = src[j * 3] as number;
      const y = src[j * 3 + 1] as number;
      const z = src[j * 3 + 2] as number;
      ltx = tx;
      lty = ty;
      ltz = tz;
      for (let s = 0; s < 2; s++) {
        const v = base + i * 2 + s;
        const p = v * 3;
        rPos[p] = x;
        rPos[p + 1] = y;
        rPos[p + 2] = z;
        rTan[p] = tx;
        rTan[p + 1] = ty;
        rTan[p + 2] = tz;
        rInfo[p] = s === 0 ? -1 : 1;
        rInfo[p + 1] = w;
        rInfo[p + 2] = t;
        const c = v * 4;
        rCol[c] = r;
        rCol[c + 1] = g;
        rCol[c + 2] = b;
        rCol[c + 3] = a;
      }
    }
  }
  /** Vertical pillar ribbon from (x,y0,z) up to y1, fading to the top. */
  function pillar(x: number, y0: number, y1: number, z: number, width: number, alpha: number, color: number) {
    for (let i = 0; i < 6; i++) {
      pts[i * 3] = x;
      pts[i * 3 + 1] = y0 + ((y1 - y0) * i) / 5;
      pts[i * 3 + 2] = z;
    }
    ribbon(pts, 6, width, width * 0.7, alpha, 0, color);
  }

  // ------------------------------------------------------------ fx lifecycle
  function release(fx: Fx): void {
    if (!fx.active) return;
    fx.active = false;
    fx.gen++;
    fx.target = null;
    fxPool.release(fx.idx);
  }

  function anchor(fx: Fx): void {
    const t = fx.target;
    if (!t) return;
    t.getWorldPosition(tmpV);
    fx.x = tmpV.x;
    fx.z = tmpV.z;
  }

  const DEFAULT_DUR: Record<string, number> = {
    bolt: 0.5,
    beam: 0.4,
    nova: 0.55,
    aoeZone: 4,
    aura: 3,
    buffGlow: 2.5,
    saberTrail: 0.3,
    impact: 0.2,
    dissolveSmoke: 0,
    dissolveSparks: 0,
    levelUp: 2.2,
    lootBeam: 60,
    portal: 30,
  };
  const PERSISTENT = new Set([
    'aura',
    'buffGlow',
    'lootBeam',
    'portal',
    'aoeZone',
    'bolt',
    'beam',
    'saberTrail',
  ]);

  function start(
    def: VfxDef,
    x: number,
    z: number,
    o: SpawnOpts | undefined,
    target: THREE.Object3D | null,
  ): Fx | null {
    const slot = fxPool.alloc();
    if (slot < 0) return null;
    const fx = fxs[slot] as Fx;
    fx.active = true;
    fx.def = def;
    fx.style = styleOf(def.id);
    fx.t = 0;
    fx.stopping = false;
    fx.stopT = 0;
    fx.fade = 1;
    fx.acc = 0;
    fx.histAcc = 0;
    fx.n = 0;
    fx.target = target;
    fx.x = x;
    fx.z = z;
    fx.sx = x;
    fx.sz = z;
    fx.dir = o?.dir ?? 0;
    const prim = def.primitive;
    fx.dur =
      o?.durationSec ??
      (target && PERSISTENT.has(prim) ? Infinity : (def.durationSec ?? DEFAULT_DUR[prim] ?? 1));
    fx.y =
      o?.height ??
      (prim === 'impact' ? 0.8 : prim === 'bolt' ? 0.9 : prim === 'beam' ? 1 : prim === 'saberTrail' ? 1 : 0);
    fx.rad = o?.radius ?? 0;
    if (target) {
      anchor(fx);
      fx.sx = fx.x;
      fx.sz = fx.z;
      if (prim === 'beam') fx.dir = -target.rotation.y;
    }
    for (let i = 0; i < 12; i++) fx.strikes[i] = 0;
    switch (prim) {
      case 'impact':
        burstImpact(fx);
        break;
      case 'dissolveSmoke':
        burstSmoke(fx);
        break;
      case 'dissolveSparks':
        burstSparks(fx);
        break;
      case 'nova':
        burstNova(fx);
        break;
      default:
        break;
    }
    return fx;
  }

  // ------------------------------------------------------------ burst primitives
  function burstImpact(fx: Fx): void {
    const d = fx.def;
    const sc = (d.size ?? 1) * (fx.rad > 0 ? fx.rad : 1);
    const n = cnt((d.particles ?? 14) * Math.min(2, sc));
    const c2 = d.color2 ?? d.color;
    if (fx.style === 'dust') {
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU;
        const sp = rr(0.8, 2.6) * sc;
        alphaP(
          fx.x,
          0.1,
          fx.z,
          Math.cos(a) * sp,
          rr(0.2, 0.9),
          Math.sin(a) * sp,
          rr(0.45, 0.8),
          0.35 * sc,
          1.1 * sc,
          d.color,
          c2,
          0.7,
          0,
          3,
          0,
        );
      }
      fx.dur = 0.05;
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const e = rr(-0.2, 1) * 0.9;
      const sp = rr(2.2, 6) * sc;
      const ch = Math.sqrt(1 - e * e);
      addP(
        fx.x,
        fx.y,
        fx.z,
        Math.cos(a) * ch * sp,
        e * sp + 1.2,
        Math.sin(a) * ch * sp,
        rr(0.22, 0.5),
        0.14 * sc,
        0.03,
        d.color,
        c2,
        1,
        0,
        2.2,
        7,
        SHAPE_SPARK,
      );
    }
    addP(fx.x, fx.y, fx.z, 0, 0, 0, 0.13, 1.1 * sc, 0.4 * sc, c2, d.color, 0.95, 0);
    addP(fx.x, fx.y, fx.z, 0, 0, 0, 0.22, 0.6 * sc, 1.8 * sc, d.color, d.color, 0.55, 0);
  }

  function burstSmoke(fx: Fx): void {
    const d = fx.def;
    const sc = (d.size ?? 1) * (fx.rad > 0 ? fx.rad : 1);
    const c2 = d.color2 ?? d.color;
    const life = d.durationSec ?? 1.4;
    const n = cnt(d.particles ?? 18);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const r = rr(0, 0.4) * sc;
      alphaP(
        fx.x + Math.cos(a) * r,
        rr(0.15, 1.2) * sc,
        fx.z + Math.sin(a) * r,
        Math.cos(a) * 0.3,
        rr(0.5, 1.3),
        Math.sin(a) * 0.3,
        life * rr(0.6, 1),
        rr(0.5, 0.8) * sc,
        rr(1.3, 2.0) * sc,
        d.color,
        c2,
        0.85,
        0,
        1.1,
        0,
        SHAPE_SOFT,
        0,
        0,
      );
    }
    const m = cnt(8);
    for (let i = 0; i < m; i++) {
      const a = rnd() * TAU;
      addP(
        fx.x + Math.cos(a) * 0.3,
        rr(0.2, 1),
        fx.z + Math.sin(a) * 0.3,
        0,
        rr(0.8, 1.8),
        0,
        life * rr(0.5, 0.9),
        0.18 * sc,
        0.02,
        c2,
        d.color,
        0.8,
        0,
        0.5,
        0,
      );
    }
    fx.dur = 0;
  }

  function burstSparks(fx: Fx): void {
    const d = fx.def;
    const sc = (d.size ?? 1) * (fx.rad > 0 ? fx.rad : 1);
    const c2 = d.color2 ?? 0x8a93a3;
    const n = cnt(d.particles ?? 26);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const sp = rr(1.5, 5.5) * sc;
      addP(
        fx.x,
        rr(0.3, 1) * sc,
        fx.z,
        Math.cos(a) * sp,
        rr(1.5, 5),
        Math.sin(a) * sp,
        rr(0.4, 0.95),
        0.13 * sc,
        0.02,
        d.color,
        0xff5a1a,
        1,
        0,
        1.2,
        9,
        SHAPE_SPARK,
      );
    }
    const m = cnt(Math.round((d.particles ?? 26) * 0.35));
    for (let i = 0; i < m; i++) {
      const a = rnd() * TAU;
      const sp = rr(1, 3.6) * sc;
      alphaP(
        fx.x,
        rr(0.4, 1.1) * sc,
        fx.z,
        Math.cos(a) * sp,
        rr(2.5, 6),
        Math.sin(a) * sp,
        rr(0.9, 1.4),
        rr(0.1, 0.2) * sc,
        0.1 * sc,
        c2,
        0x2a2e36,
        1,
        0,
        0.4,
        15,
        SHAPE_SCRAP,
        rnd() * TAU,
        rr(-14, 14),
      );
    }
    for (let i = 0; i < 4; i++) {
      alphaP(
        fx.x,
        rr(0.3, 0.9),
        fx.z,
        rr(-0.3, 0.3),
        rr(0.6, 1.2),
        rr(-0.3, 0.3),
        rr(0.7, 1.1),
        0.4 * sc,
        1.1 * sc,
        0x3a3d45,
        0x14151a,
        0.45,
        0,
        1,
        0,
      );
    }
    addP(fx.x, 0.6 * sc, fx.z, 0, 0, 0, 0.16, 1.4 * sc, 0.5 * sc, 0xffe0a0, d.color, 0.9, 0);
    fx.dur = 0;
  }

  function burstNova(fx: Fx): void {
    const d = fx.def;
    const R = fx.rad > 0 ? fx.rad : (d.size ?? 4);
    const n = cnt(d.particles ?? 28);
    const c2 = d.color2 ?? d.color;
    if (fx.style === 'flash') {
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU;
        const r = rr(0.1, 0.6) * R;
        addP(
          fx.x + Math.cos(a) * r,
          0.1,
          fx.z + Math.sin(a) * r,
          0,
          rr(2, 6),
          0,
          rr(0.25, 0.5),
          0.14,
          0.02,
          c2,
          d.color,
          1,
          0,
          1,
          0,
          SHAPE_SPARK,
        );
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rr(-0.05, 0.05);
      const sp = (R / fx.dur) * rr(1.1, 1.7);
      addP(
        fx.x,
        0.15,
        fx.z,
        Math.cos(a) * sp,
        rr(0.3, 1),
        Math.sin(a) * sp,
        fx.dur * 1.05,
        0.16,
        0.03,
        d.color,
        c2,
        1,
        0,
        2.4,
        1.5,
        SHAPE_SPARK,
      );
    }
    if (fx.style === 'ringUp') {
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU;
        const r = rr(0.6, 1) * R * 0.5;
        addP(
          fx.x + Math.cos(a) * r,
          0.1,
          fx.z + Math.sin(a) * r,
          0,
          rr(1.2, 2.6),
          0,
          rr(0.6, 1.1),
          0.18,
          0.02,
          c2,
          d.color,
          0.9,
          0,
          0.5,
          0,
        );
      }
    }
  }

  // ------------------------------------------------------------ continuous primitives
  function updBolt(fx: Fx, dt: number): void {
    const d = fx.def;
    const size = d.size ?? 0.25;
    const blastur = fx.style === 'blastur';
    let hx: number, hz: number;
    if (fx.target) {
      anchor(fx);
      hx = fx.x;
      hz = fx.z;
    } else {
      const dist = fx.rad > 0 ? fx.rad : 6;
      const u = fx.dur > 0 ? clamp01(fx.t / fx.dur) : 1;
      hx = fx.sx + Math.cos(fx.dir) * dist * u;
      hz = fx.sz + Math.sin(fx.dir) * dist * u;
    }
    const hy = fx.y;
    const maxN = blastur ? 6 : 14;
    fx.histAcc += dt;
    if (fx.n === 0 || fx.histAcc >= 0.012) {
      fx.hist.copyWithin(3, 0, (R_PTS - 1) * 3);
      fx.histAcc = 0;
      if (fx.n < maxN) fx.n++;
    }
    fx.hist[0] = hx;
    fx.hist[1] = hy;
    fx.hist[2] = hz;
    const f = fx.fade;
    if (blastur) {
      // Streak. Laser bolts get a solid body mesh on the missile (entitySync) instead of a ribbon:
      // ribbons blend to white at the center, which washes the bolt's color out.
      if (!LASER_IDS.has(d.id)) ribbon(fx.hist, fx.n, size * 1.5, 0, 0.95 * f, 0, d.color);
      glow(hx, hy, hz, size * 3, d.color, 0.55 * f);
      gq(hx, 0.04, hz, size * 3.5, 1, 1, 0, d.color, 0.22 * f);
    } else {
      ribbon(fx.hist, fx.n, size * 1.8, 0, 0.95 * f, 0, d.color);
      glow(hx, hy, hz, size * 6, d.color, 0.8 * f);
      glow(hx, hy, hz, size * 2.2, d.color2 ?? 0xffffff, 0.95 * f);
      gq(hx, 0.04, hz, size * 4.5, 1, 1, 0, d.color, 0.28 * f);
    }
    if (!blastur) {
      fx.acc += (d.particles ?? 40) * qm * dt;
      while (fx.acc >= 1) {
        fx.acc -= 1;
        addP(
          hx + rr(-0.05, 0.05),
          hy + rr(-0.05, 0.05),
          hz + rr(-0.05, 0.05),
          rr(-0.4, 0.4),
          rr(-0.2, 0.5),
          rr(-0.4, 0.4),
          rr(0.2, 0.4),
          size * 0.7,
          0.02,
          d.color,
          d.color2 ?? d.color,
          0.9,
          0,
          1,
          0,
          SHAPE_SPARK,
        );
      }
    }
  }

  function updBeam(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) {
      anchor(fx);
      fx.dir = -fx.target.rotation.y;
    }
    const L = fx.rad > 0 ? fx.rad : 6;
    const smooth = d.particles === 0;
    const N = smooth ? 16 : Math.min(R_PTS, Math.max(3, d.particles ?? 14));
    const width = d.size ?? 0.3;
    const dx = Math.cos(fx.dir);
    const dz = Math.sin(fx.dir);
    // re-roll the jitter ~20x/s
    fx.histAcc += dt;
    if (fx.n !== N || fx.histAcc >= 0.05) {
      fx.histAcc = 0;
      fx.n = N;
      for (let i = 0; i < N; i++) {
        fx.jit[i * 2] = rr(-1, 1);
        fx.jit[i * 2 + 1] = rr(-0.5, 0.5);
      }
    }
    const env =
      fx.dur === Infinity
        ? clamp01(fx.t * 8)
        : Math.min(clamp01(fx.t * 12), clamp01((fx.dur - fx.t) / (fx.dur * 0.3)));
    const f = env * fx.fade;
    const amp = Math.max(0.12, width * 1.1) * (1 + L * 0.04);
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const taper = Math.sin(Math.PI * s);
      const off = smooth
        ? Math.sin(s * TAU * 1.5 + fx.t * 16) * amp * 0.35 * taper
        : (fx.jit[i * 2] as number) * amp * taper;
      const hy = smooth ? 0 : (fx.jit[i * 2 + 1] as number) * amp * taper;
      pts[i * 3] = fx.x + dx * L * s - dz * off;
      pts[i * 3 + 1] = fx.y + hy;
      pts[i * 3 + 2] = fx.z + dz * L * s + dx * off;
    }
    ribbon(pts, N, width * 1.2, width * 1.2, 0.95 * f, 0.95 * f, d.color);
    const ex = fx.x + dx * L;
    const ez = fx.z + dz * L;
    glow(fx.x, fx.y, fx.z, width * 4, d.color, 0.7 * f);
    glow(ex, fx.y, ez, width * 5, d.color2 ?? d.color, 0.8 * f);
    gq(ex, 0.04, ez, width * 5, 1, 1, 0, d.color, 0.3 * f);
    fx.acc += 60 * qm * dt * f;
    while (fx.acc >= 1) {
      fx.acc -= 1;
      addP(
        ex,
        fx.y,
        ez,
        rr(-2, 2),
        rr(0.5, 3),
        rr(-2, 2),
        rr(0.15, 0.35),
        0.1,
        0.02,
        d.color2 ?? d.color,
        d.color,
        1,
        0,
        1.5,
        6,
        SHAPE_SPARK,
      );
    }
  }

  function updNova(fx: Fx): void {
    const d = fx.def;
    const R = fx.rad > 0 ? fx.rad : (d.size ?? 4);
    const u = clamp01(fx.t / fx.dur);
    const e = 1 - (1 - u) * (1 - u) * (1 - u);
    const c2 = d.color2 ?? d.color;
    if (fx.style === 'flash') {
      const a = (1 - u) * (1 - u);
      pillar(fx.x, 0, 3.2, fx.z, R * 0.7 * (1 - u * 0.5), 0.9 * a, c2);
      gq(fx.x, 0.05, fx.z, R * (0.4 + e * 0.8), 0, 0.2, 0, d.color, a);
      glow(fx.x, 0.8, fx.z, R * 1.6, d.color, 0.6 * a);
      return;
    }
    const a = Math.pow(1 - u, 1.3);
    const r = R * e;
    gq(fx.x, 0.05, fx.z, r, 0, Math.min(0.5, Math.max(0.05, 0.3 / Math.max(r, 0.01))), 0, d.color, a);
    gq(
      fx.x,
      0.05,
      fx.z,
      r * 0.75,
      0,
      Math.min(0.5, Math.max(0.05, 0.2 / Math.max(r * 0.75, 0.01))),
      0,
      c2,
      a * 0.5,
    );
    gq(fx.x, 0.04, fx.z, r, 1, 1, 0, d.color, a * 0.22);
    if (u < 0.25) glow(fx.x, 0.6, fx.z, R * 0.8 * (1 - u * 4), c2, 0.7);
  }

  function updZone(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) anchor(fx);
    const R = fx.rad > 0 ? fx.rad : (d.size ?? 3);
    const env =
      fx.dur === Infinity ? clamp01(fx.t * 4) : Math.min(clamp01(fx.t * 4), clamp01((fx.dur - fx.t) / 0.5));
    const f = env * fx.fade;
    const c2 = d.color2 ?? d.color;
    gq(fx.x, 0.03, fx.z, R, 4, 0.06, 0, d.color, 0.55 * f);
    gq(fx.x, 0.035, fx.z, R * 0.95, 2, 0.1, fx.t, c2, 0.22 * f);
    const rate = (((d.particles ?? 60) * qm * (R * R)) / 12) * f;
    fx.acc += rate * dt;
    while (fx.acc >= 1) {
      fx.acc -= 1;
      const a = rnd() * TAU;
      const r = Math.sqrt(rnd()) * R * 0.95;
      const px = fx.x + Math.cos(a) * r;
      const pz = fx.z + Math.sin(a) * r;
      if (fx.style === 'cloud') {
        alphaP(
          px,
          0.1,
          pz,
          rr(-0.2, 0.2),
          rr(0.3, 0.8),
          rr(-0.2, 0.2),
          rr(1.2, 2),
          0.9,
          2.4,
          d.color,
          c2,
          0.3,
          0,
          0.5,
          0,
        );
      } else if (fx.style === 'falling') {
        const h = rr(3.4, 4.6);
        const vy = rr(-10, -7);
        addP(
          px,
          h,
          pz,
          rr(-1.5, -0.6),
          vy,
          rr(-0.4, 0.4),
          h / -vy,
          0.16,
          0.08,
          c2,
          d.color,
          0.9,
          0.3,
          0,
          0,
          SHAPE_SPARK,
        );
        if (rnd() < 0.25)
          addP(
            px,
            0.05,
            pz,
            rr(-0.5, 0.5),
            rr(1, 2.2),
            rr(-0.5, 0.5),
            0.3,
            0.1,
            0.02,
            d.color,
            c2,
            0.8,
            0,
            1,
            7,
            SHAPE_SPARK,
          );
      } else if (fx.style === 'strikes') {
        // schedule a falling star that lands in 0.25s
        for (let k = 0; k < 4; k++) {
          if ((fx.strikes[k * 3 + 2] as number) <= 0) {
            fx.strikes[k * 3] = px;
            fx.strikes[k * 3 + 1] = pz;
            fx.strikes[k * 3 + 2] = 0.25;
            addP(
              px - 2.6,
              7,
              pz - 2.6,
              10.4,
              -28,
              10.4,
              0.25,
              0.5,
              0.35,
              c2,
              d.color,
              1,
              1,
              0,
              0,
              SHAPE_SPARK,
            );
            break;
          }
        }
      } else {
        addP(px, 0.1, pz, 0, rr(0.5, 1.2), 0, 0.8, 0.14, 0.02, c2, d.color, 0.8, 0, 0.3, 0, SHAPE_SPARK);
      }
    }
    if (fx.style === 'strikes') {
      for (let k = 0; k < 4; k++) {
        const tt = fx.strikes[k * 3 + 2] as number;
        if (tt > 0) {
          const nt = tt - dt;
          fx.strikes[k * 3 + 2] = nt;
          if (nt <= 0) {
            const sx = fx.strikes[k * 3] as number;
            const sz = fx.strikes[k * 3 + 1] as number;
            fx.strikes[k * 3 + 2] = -1;
            const n = cnt(14);
            for (let i = 0; i < n; i++) {
              const a = rnd() * TAU;
              const sp = rr(1.5, 5);
              addP(
                sx,
                0.1,
                sz,
                Math.cos(a) * sp,
                rr(1, 4),
                Math.sin(a) * sp,
                rr(0.25, 0.5),
                0.12,
                0.02,
                c2,
                d.color,
                1,
                0,
                2,
                9,
                SHAPE_SPARK,
              );
            }
            addP(sx, 0.4, sz, 0, 0, 0, 0.18, 1.8, 0.6, c2, d.color, 0.95, 0);
            addP(sx, 0.06, sz, 0, 0, 0, 0.3, 0.6, 2.4, d.color, d.color, 0.5, 0);
          }
        }
      }
    }
  }

  function updAura(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) anchor(fx);
    const R = fx.rad > 0 ? fx.rad : (d.size ?? 2);
    const env = Math.min(clamp01(fx.t * 3), fx.dur === Infinity ? 1 : clamp01((fx.dur - fx.t) / 0.4));
    const f = env * fx.fade;
    const c2 = d.color2 ?? d.color;
    gq(fx.x, 0.035, fx.z, R, 3, 0.07, fx.t * 1.6, d.color, 0.65 * f);
    gq(fx.x, 0.03, fx.z, R, 1, 1, 0, d.color, 0.1 * f);
    gq(fx.x, 0.032, fx.z, R * 0.6, 3, 0.07, -fx.t * 1.1, c2, 0.3 * f);
    fx.acc += 10 * qm * dt * f;
    while (fx.acc >= 1) {
      fx.acc -= 1;
      const a = rnd() * TAU;
      addP(
        fx.x + Math.cos(a) * R * 0.9,
        0.05,
        fx.z + Math.sin(a) * R * 0.9,
        0,
        rr(0.5, 1.1),
        0,
        rr(0.8, 1.3),
        0.14,
        0.02,
        c2,
        d.color,
        0.8,
        0,
        0.3,
        0,
        SHAPE_SPARK,
      );
    }
  }

  function updBuff(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) anchor(fx);
    const S = d.size ?? 1;
    const env = Math.min(clamp01(fx.t * 4), fx.dur === Infinity ? 1 : clamp01((fx.dur - fx.t) / 0.4));
    const f = env * fx.fade;
    const c2 = d.color2 ?? d.color;
    const pulse = 0.75 + 0.25 * Math.sin(fx.t * 4);
    gq(fx.x, 0.04, fx.z, S * 0.9, 0, 0.14, 0, d.color, 0.55 * pulse * f);
    gq(fx.x, 0.035, fx.z, S * 0.8, 1, 1, 0, d.color, 0.15 * f);
    for (let i = 0; i < 4; i++) {
      const a = fx.t * 2.2 + (i * TAU) / 4;
      const h = 0.9 + 0.55 * Math.sin(fx.t * 1.7 + i * 1.6);
      glow(fx.x + Math.cos(a) * S * 0.7, h, fx.z + Math.sin(a) * S * 0.7, 0.26, c2, 0.95 * f);
      glow(fx.x + Math.cos(a) * S * 0.7, h, fx.z + Math.sin(a) * S * 0.7, 0.6, d.color, 0.35 * f);
    }
    glow(fx.x, 0.9, fx.z, S * 2.4, d.color, 0.1 * f);
    fx.acc += 12 * qm * dt * f;
    while (fx.acc >= 1) {
      fx.acc -= 1;
      const a = rnd() * TAU;
      addP(
        fx.x + Math.cos(a) * S * 0.55,
        0.05,
        fx.z + Math.sin(a) * S * 0.55,
        0,
        rr(0.9, 1.6),
        0,
        rr(0.6, 1),
        0.1,
        0.02,
        c2,
        d.color,
        0.9,
        0,
        0,
        0,
        SHAPE_SPARK,
      );
    }
  }

  function updSaber(fx: Fx, dt: number): void {
    const d = fx.def;
    const w = d.size ?? 0.3;
    const life = Math.max(0.05, d.durationSec ?? 0.3);
    if (!fx.target) {
      // one-shot swing arc around fx.x/z, facing fx.dir
      const R = fx.rad > 0 ? fx.rad : 1.6;
      const sweep = life * 0.6;
      const head = clamp01(fx.t / sweep);
      const e = head * (2 - head);
      const a0 = fx.dir - 1.25;
      const aHead = a0 + 2.5 * e;
      const n = 10;
      const fadeOut = fx.t <= sweep ? 1 : clamp01(1 - (fx.t - sweep) / (life * 0.9));
      for (let i = 0; i < n; i++) {
        const a = Math.max(a0, aHead - i * 0.16);
        pts[i * 3] = fx.x + Math.cos(a) * R;
        pts[i * 3 + 1] = fx.y;
        pts[i * 3 + 2] = fx.z + Math.sin(a) * R;
      }
      ribbon(pts, n, w, w * 0.2, 0.95 * fadeOut * fx.fade, 0.05, d.color);
      glow(pts[0] as number, fx.y, pts[2] as number, w * 3, d.color2 ?? d.color, 0.7 * fadeOut);
      return;
    }
    // attached: follow the target's world position
    fx.target.getWorldPosition(tmpV);
    const age = fx.histT;
    for (let i = 0; i < fx.n; i++) age[i] = (age[i] as number) + dt;
    while (fx.n > 0 && (age[fx.n - 1] as number) > life) fx.n--;
    const moved =
      fx.n === 0 ||
      Math.hypot(
        tmpV.x - (fx.hist[0] as number),
        tmpV.y - (fx.hist[1] as number),
        tmpV.z - (fx.hist[2] as number),
      ) > 0.03;
    if (moved && !fx.stopping && fx.n < R_PTS) {
      fx.hist.copyWithin(3, 0, (R_PTS - 1) * 3);
      age.copyWithin(1, 0, R_PTS - 1);
      fx.hist[0] = tmpV.x;
      fx.hist[1] = tmpV.y;
      fx.hist[2] = tmpV.z;
      age[0] = 0;
      fx.n++;
    } else if (!fx.stopping && fx.n > 0) {
      fx.hist[0] = tmpV.x;
      fx.hist[1] = tmpV.y;
      fx.hist[2] = tmpV.z;
      age[0] = 0;
    }
    if (fx.n >= 2) {
      const tail = 1 - (age[fx.n - 1] as number) / life;
      ribbon(fx.hist, fx.n, w, w * 0.3, 0.9, 0.9 * clamp01(tail) * 0.2, d.color);
      glow(
        fx.hist[0] as number,
        fx.hist[1] as number,
        fx.hist[2] as number,
        w * 2.6,
        d.color2 ?? d.color,
        0.6,
      );
    }
  }

  function updLevelUp(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) anchor(fx);
    const S = (d.size ?? 1) * (fx.rad > 0 ? fx.rad : 1);
    const u = fx.dur === Infinity ? 0.3 : clamp01(fx.t / fx.dur);
    const env = Math.sin(Math.PI * Math.min(1, u * 1.15)) * fx.fade;
    const c2 = d.color2 ?? d.color;
    pillar(fx.x, 0, 6.5, fx.z, 1.5 * S, 0.7 * env, d.color);
    pillar(fx.x, 0, 6.5, fx.z, 0.7 * S, 0.8 * env, c2);
    glow(fx.x, 0.5, fx.z, 3 * S, d.color, 0.5 * env);
    for (let k = 0; k < 3; k++) {
      const ut = clamp01((fx.t - k * 0.25) / 1.3);
      if (ut > 0 && ut < 1)
        gq(
          fx.x,
          0.1 + ut * 3.2,
          fx.z,
          S * (1.1 - ut * 0.3),
          0,
          0.12,
          0,
          k === 1 ? c2 : d.color,
          (1 - ut) * 0.9,
        );
    }
    if (u < 0.75) {
      fx.acc += (d.particles ?? 30) * 1.4 * qm * dt;
      while (fx.acc >= 1) {
        fx.acc -= 1;
        const a = rnd() * TAU;
        const r = rr(0.3, 0.9) * S;
        addP(
          fx.x + Math.cos(a) * r,
          0.1,
          fx.z + Math.sin(a) * r,
          0,
          rr(1.8, 3.4),
          0,
          rr(0.7, 1.2),
          0.16,
          0.02,
          c2,
          d.color,
          1,
          0,
          0.2,
          0,
          SHAPE_SPARK,
        );
      }
    }
  }

  function updLoot(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) anchor(fx);
    const W = d.size ?? 0.4;
    const env =
      Math.min(clamp01(fx.t * 3), fx.dur === Infinity ? 1 : clamp01((fx.dur - fx.t) / 0.4)) * fx.fade;
    const pulse = 0.8 + 0.2 * Math.sin(fx.t * 3.2);
    pillar(fx.x, 0, 4.5, fx.z, W * 1.6, 0.6 * env * pulse, d.color);
    pillar(fx.x, 0, 4.5, fx.z, W * 0.6, 0.9 * env, 0xffffff);
    gq(fx.x, 0.04, fx.z, W * 2.6, 1, 1, 0, d.color, 0.4 * env);
    gq(fx.x, 0.045, fx.z, W * (1.6 + 0.6 * Math.sin(fx.t * 2.5)), 0, 0.18, 0, d.color, 0.6 * env);
    fx.acc += 7 * qm * dt * env;
    while (fx.acc >= 1) {
      fx.acc -= 1;
      const a = rnd() * TAU;
      const r = rr(0.1, 0.7);
      addP(
        fx.x + Math.cos(a) * r,
        0.1,
        fx.z + Math.sin(a) * r,
        0,
        rr(0.8, 1.6),
        0,
        rr(0.8, 1.4),
        0.1,
        0.02,
        d.color,
        0xffffff,
        0.9,
        0,
        0.2,
        0,
        SHAPE_SPARK,
      );
    }
  }

  function updPortal(fx: Fx, dt: number): void {
    const d = fx.def;
    if (fx.target) anchor(fx);
    const S = d.size ?? 1;
    const env =
      Math.min(clamp01(fx.t * 2.5), fx.dur === Infinity ? 1 : clamp01((fx.dur - fx.t) / 0.5)) * fx.fade;
    const c2 = d.color2 ?? d.color;
    const hx = 0.7071;
    const rx = 0.85 * S;
    const ry = 1.45 * S;
    const cy = ry + 0.1;
    gq(fx.x, 0.04, fx.z, S * 1.3, 2, 0.1, fx.t * 2, d.color, 0.55 * env);
    glow(fx.x, cy, fx.z, S * 2.8, d.color, 0.28 * env);
    glow(fx.x, cy, fx.z, S * 1.6, c2, 0.2 * env);
    const N = Math.round(26 * Math.max(0.5, qm));
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + fx.t * 1.8;
      const c = Math.cos(a);
      const s = Math.sin(a);
      glow(fx.x + hx * c * rx, cy + s * ry, fx.z - hx * c * rx, 0.28 * S, c2, 0.95 * env);
      const a2 = -(i / N) * TAU * 2 + fx.t * 2.6;
      const k = 0.62 + 0.12 * Math.sin(fx.t * 3 + i);
      glow(
        fx.x + hx * Math.cos(a2) * rx * k,
        cy + Math.sin(a2) * ry * k,
        fx.z - hx * Math.cos(a2) * rx * k,
        0.2 * S,
        d.color,
        0.7 * env,
      );
    }
    fx.acc += (d.particles ?? 40) * 0.5 * qm * dt * env;
    while (fx.acc >= 1) {
      fx.acc -= 1;
      const a = rnd() * TAU;
      const c = Math.cos(a);
      addP(
        fx.x + hx * c * rx,
        cy + Math.sin(a) * ry,
        fx.z - hx * c * rx,
        -hx * c * 0.7,
        0.2,
        hx * c * 0.7,
        0.6,
        0.12,
        0.02,
        c2,
        d.color,
        0.9,
        0,
        0,
        0,
        SHAPE_SPARK,
      );
    }
  }

  function updateFx(fx: Fx, dt: number): void {
    fx.t += dt;
    if (fx.stopping) {
      fx.stopT += dt;
      fx.fade = clamp01(1 - fx.stopT / FADE_OUT_SEC);
      if (fx.fade <= 0) {
        release(fx);
        return;
      }
    }
    if (fx.t >= fx.dur && fx.dur !== Infinity) {
      release(fx);
      return;
    }
    switch (fx.def.primitive) {
      case 'bolt':
        updBolt(fx, dt);
        break;
      case 'beam':
        updBeam(fx, dt);
        break;
      case 'nova':
        updNova(fx);
        break;
      case 'aoeZone':
        updZone(fx, dt);
        break;
      case 'aura':
        updAura(fx, dt);
        break;
      case 'buffGlow':
        updBuff(fx, dt);
        break;
      case 'saberTrail':
        updSaber(fx, dt);
        break;
      case 'levelUp':
        updLevelUp(fx, dt);
        break;
      case 'lootBeam':
        updLoot(fx, dt);
        break;
      case 'portal':
        updPortal(fx, dt);
        break;
      default:
        break; // bursts (impact, dissolve*) are fire-and-forget; impact draws its flash ring below
    }
    if (fx.def.primitive === 'impact' && fx.style !== 'dust') {
      const u = clamp01(fx.t / fx.dur);
      const sc = (fx.def.size ?? 1) * (fx.rad > 0 ? fx.rad : 1);
      gq(fx.x, 0.06, fx.z, sc * (0.2 + 0.6 * u), 0, 0.2, 0, fx.def.color, (1 - u) * 0.6);
    }
  }

  // ------------------------------------------------------------ public API
  function spawn(vfxId: string, pos: Vec2, o?: SpawnOpts): void {
    if (disposed) return;
    start(lookup(vfxId), pos.x, pos.y, o, null);
  }

  function handleFor(fx: Fx | null): { stop(): void } {
    if (!fx) return { stop() {} };
    const gen = fx.gen;
    return {
      stop() {
        if (fx.active && fx.gen === gen) fx.stopping = true;
      },
    };
  }

  function attach(vfxId: string, target: THREE.Object3D, o?: { radius?: number }): { stop(): void } {
    if (disposed) return { stop() {} };
    const def = lookup(vfxId);
    const fx = start(def, 0, 0, o, target);
    if (fx && fx.dur === 0) fx.dur = 0.001;
    return handleFor(fx);
  }

  const loot = new Map<number, { stop(): void }>();
  const sink: EffectSink = {
    spawn,
    startLoot(entityId, vfxId, pos) {
      loot.get(entityId)?.stop();
      loot.set(entityId, handleFor(start(lookup(vfxId), pos.x, pos.y, { durationSec: Infinity }, null)));
    },
    stopLoot(entityId) {
      const h = loot.get(entityId);
      if (h) {
        h.stop();
        loot.delete(entityId);
      }
    },
    clearLoot() {
      for (const h of loot.values()) h.stop();
      loot.clear();
    },
  };

  function handleEvents(events: readonly GameEvent[], view: WorldView): void {
    if (disposed) return;
    mapEvents(events, view, sink);
  }

  function update(dt: number): void {
    if (disposed) return;
    if (dt > 0.1) dt = 0.1;
    if (dt < 1 / 240) dt = 1 / 240;
    frameLife = dt * 1.6;
    gN = 0;
    rbN = 0;
    for (let i = 0; i < MAX_FX; i++) {
      const fx = fxs[i] as Fx;
      if (fx.active) updateFx(fx, dt);
    }
    const na = pAdd.update(dt, addMesh.pos, addMesh.col, addMesh.misc);
    addMesh.geo.instanceCount = na;
    addMesh.aPos.needsUpdate = addMesh.aCol.needsUpdate = addMesh.aMisc.needsUpdate = na > 0;
    const nb = pAlpha.update(dt, alphaMesh.pos, alphaMesh.col, alphaMesh.misc);
    alphaMesh.geo.instanceCount = nb;
    alphaMesh.aPos.needsUpdate = alphaMesh.aCol.needsUpdate = alphaMesh.aMisc.needsUpdate = nb > 0;
    gGeo.instanceCount = gN;
    gAttrC.needsUpdate = gAttrP.needsUpdate = gAttrCol.needsUpdate = gN > 0;
    rGeo.setDrawRange(0, rbN * (R_PTS - 1) * 6);
    rAttrPos.needsUpdate = rAttrTan.needsUpdate = rAttrInfo.needsUpdate = rAttrCol.needsUpdate = rbN > 0;
  }

  function setQuality(q: QualityLevel): void {
    qm = QUALITY_MUL[q];
    pAdd.limit = Math.floor(MAX_PARTICLES_ADD * qm);
    pAlpha.limit = Math.floor(MAX_PARTICLES_ALPHA * qm);
  }
  setQuality('high');

  function dispose(): void {
    disposed = true;
    for (const fx of fxs) fx.active = false;
    loot.clear();
    for (const m of [addMesh, alphaMesh]) {
      m.geo.dispose();
      (m.mesh.material as THREE.Material).dispose();
    }
    gGeo.dispose();
    gMat.dispose();
    rGeo.dispose();
    rMat.dispose();
    root.removeFromParent();
  }

  return { root, spawn, attach, handleEvents, update, setQuality, dispose };
}
