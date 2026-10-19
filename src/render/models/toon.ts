/** Shared toon material helpers: one gradient map, cached materials, tint/highlight variants. */
import * as THREE from 'three';
import { MATERIAL_PALETTE } from '../assets/palette';

let gradient: THREE.DataTexture | null = null;

/**
 * 3-step gradient map shared by every toon material. The shadow band is kept fairly light (~43%) so
 * dark cloth and robes still read as shapes instead of blobs.
 */
export function getGradientMap(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([110, 185, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

// Rim light: toon materials compiled with the USE_RIM define add a soft cool light along their
// silhouette (view-facing edges), which separates characters from the ground under the iso camera.
const toonLib = THREE.ShaderLib['toon']!;

// Painted look: every toon surface (unless NO_PAINT) gets procedural brush strokes in world space,
// projected along the three axes and blended by the surface normal, so walls, props and bodies read
// as hand-painted rather than flat-filled. Pure ALU (no texture), stable under camera motion.
toonLib.vertexShader = toonLib.vertexShader
  .replace('#include <common>', '#include <common>\nvarying vec3 vPaintP;\nvarying vec3 vPaintN;')
  .replace(
    '#include <skinning_vertex>',
    `
#ifdef USE_RIM
  // Actors: strokes keyed to the bind pose, so they stay painted on the body as it animates.
  vec4 paintBindP = vec4( transformed, 1.0 );
  vec3 paintBindN = objectNormal;
#endif
#include <skinning_vertex>
{
#ifdef USE_RIM
  vec4 pp = paintBindP;
  vec3 pn = paintBindN;
#else
  vec4 pp = vec4( transformed, 1.0 );
  vec3 pn = objectNormal;
#endif
#ifdef USE_INSTANCING
  pp = instanceMatrix * pp;
  pn = mat3( instanceMatrix ) * pn;
#endif
  vPaintP = ( modelMatrix * pp ).xyz;
  vPaintN = normalize( mat3( modelMatrix ) * pn );
}`,
  );
toonLib.fragmentShader = toonLib.fragmentShader
  .replace(
    '#include <common>',
    `#include <common>
varying vec3 vPaintP;
varying vec3 vPaintN;
// Brush jitter of the light/shadow terminator (see getGradientIrradiance), set per fragment in main.
float paintEdge;
float paintHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float paintNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( paintHash( i ), paintHash( i + vec2( 1.0, 0.0 ) ), u.x ),
              mix( paintHash( i + vec2( 0.0, 1.0 ) ), paintHash( i + 1.0 ), u.x ), u.y );
}
// Streaky noise: long thin dabs along a slanted stroke direction, two sizes.
float paintStrokes( vec2 p ) {
  vec2 q = mat2( 0.8, -0.6, 0.6, 0.8 ) * p;
  return paintNoise( vec2( q.x * 2.0, q.y * 8.0 ) ) * 0.6 + paintNoise( vec2( q.x * 4.3, q.y * 17.0 ) + 7.3 ) * 0.4;
}`,
  )
  .replace(
    '#include <alphamap_fragment>',
    `paintEdge = 0.0;
#ifndef NO_PAINT
{
  vec3 bw = pow( abs( normalize( vPaintN ) ), vec3( 4.0 ) );
  bw /= bw.x + bw.y + bw.z + 1e-5;
#ifdef USE_RIM
  // Finer strokes on bodies (a character is under two units tall).
  vec3 pq = vPaintP * 2.6;
#else
  vec3 pq = vPaintP;
#endif
  float st = paintStrokes( pq.zy ) * bw.x + paintStrokes( pq.xz ) * bw.y + paintStrokes( pq.xy ) * bw.z;
#ifdef USE_RIM
  diffuseColor.rgb *= 0.9 + 0.2 * st;
  paintEdge = ( st - 0.5 ) * 0.55;
#else
  diffuseColor.rgb *= 0.86 + 0.28 * st;
  paintEdge = ( st - 0.5 ) * 0.3;
#endif
}
#endif
#include <alphamap_fragment>`,
  );
toonLib.fragmentShader = toonLib.fragmentShader.replace(
  '#include <opaque_fragment>',
  `#ifdef USE_RIM
{
  vec3 rimV = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );
  float rimF = smoothstep( 0.5, 0.95, 1.0 - max( dot( normal, rimV ), 0.0 ) );
  outgoingLight += vec3( 0.26, 0.28, 0.34 ) * rimF * ( 0.35 + 0.65 * diffuseColor.rgb );
}
#endif
#include <opaque_fragment>
// Paint mask in the scene target's alpha, read by the screen paint pass: actors 0 (they stay crisp),
// already-painted ground 0.35 (a light touch: the full filter turns its texture into square mosaic).
#if defined( USE_RIM ) && defined( OPAQUE )
  gl_FragColor.a = 0.0;
#elif defined( NO_PAINT ) && defined( OPAQUE )
  gl_FragColor.a = 0.35;
#endif`,
);
// Ragged, brushed light/shadow edges: the toon ramp lookup is nudged by the stroke pattern.
toonLib.fragmentShader = toonLib.fragmentShader.replace(
  '#include <gradientmap_pars_fragment>',
  THREE.ShaderChunk.gradientmap_pars_fragment.replace(
    'float dotNL = dot( normal, lightDirection );',
    'float dotNL = dot( normal, lightDirection ) + paintEdge;',
  ),
);

/**
 * Clone a material keeping its shader defines: MeshToonMaterial.copy() resets `defines` to
 * { TOON: '' }, which would drop USE_RIM from every tint / outfit variant.
 */
function cloneKeepingDefines<T extends THREE.Material>(m: T): T {
  const c = m.clone() as T;
  const d = (m as unknown as THREE.MeshToonMaterial).defines;
  if (d) (c as unknown as THREE.MeshToonMaterial).defines = { ...d };
  return c;
}

/** Give a material the actor rim light (see USE_RIM above). Idempotent. */
export function enableRim(m: THREE.Material): void {
  const t = m as THREE.MeshToonMaterial;
  if (!t.isMeshToonMaterial || (t.defines && 'USE_RIM' in t.defines)) return;
  t.defines = { ...t.defines, USE_RIM: '' };
  t.needsUpdate = true;
}

export interface ToonOpts {
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  doubleSide?: boolean;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

/** Cached toon material for a flat color (shared between all instances). */
export function toonMaterial(color: number, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `${color}|${o.emissive ?? -1}|${o.emissiveIntensity ?? 1}|${o.opacity ?? 1}|${o.doubleSide ? 1 : 0}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() });
    if (o.emissive !== undefined) {
      m.emissive.setHex(o.emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? 1;
    }
    if (o.opacity !== undefined && o.opacity < 1) {
      m.transparent = true;
      m.opacity = o.opacity;
      m.depthWrite = false;
    }
    if (o.doubleSide) m.side = THREE.DoubleSide;
    toonCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();

/** Unlit glowing material (bloom-friendly: not tone mapped). Cached per color/opacity/mode. */
export function glowMaterial(color: number, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}|${additive ? 1 : 0}`;
  let m = glowCache.get(key);
  if (!m) {
    // Light sources shine through fog.
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
    if (opacity < 1 || additive) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
    if (additive) m.blending = THREE.AdditiveBlending;
    glowCache.set(key, m);
  }
  return m;
}

const converted = new WeakMap<THREE.Material, THREE.Material>();

/** Convert a loaded glTF material to a (cached) toon material keeping color/maps. */
export function toToon(src: THREE.Material): THREE.Material {
  const hit = converted.get(src);
  if (hit) return hit;
  const s = src as THREE.MeshStandardMaterial;
  let out: THREE.Material;
  if (s.isMeshStandardMaterial || (src as THREE.MeshPhongMaterial).isMeshPhongMaterial) {
    const painted = MATERIAL_PALETTE[s.name];
    const m = new THREE.MeshToonMaterial({
      color: painted !== undefined ? new THREE.Color(painted) : s.color,
      map: s.map,
      gradientMap: getGradientMap(),
      emissive: s.emissive,
      emissiveMap: s.emissiveMap,
      emissiveIntensity: s.emissiveIntensity,
      transparent: s.transparent,
      opacity: s.opacity,
      side: s.side,
      alphaTest: s.alphaTest,
      vertexColors: s.vertexColors,
    });
    m.name = s.name;
    out = m;
  } else {
    out = src; // basic/unlit materials (glows) are kept as is
  }
  converted.set(src, out);
  return out;
}

const variantCache = new WeakMap<THREE.Material, Map<string, THREE.Material>>();
const scratchTint = new THREE.Color();
const scratchHl = new THREE.Color();

/** Cached material variant with a blended tint and/or highlight rim-glow. Base must be a toon material. */
export function variantMaterial(
  base: THREE.Material,
  tint: number | null,
  hl: number | null,
): THREE.Material {
  if (tint === null && hl === null) return base;
  let per = variantCache.get(base);
  if (!per) {
    per = new Map();
    variantCache.set(base, per);
  }
  const key = `${tint ?? -1}|${hl ?? -1}`;
  let v = per.get(key);
  if (!v) {
    v = cloneKeepingDefines(base);
    // Keep shader patches (e.g. palette swaps) on hit-flash / status variants.
    v.onBeforeCompile = base.onBeforeCompile;
    v.customProgramCacheKey = base.customProgramCacheKey;
    const m = v as THREE.MeshToonMaterial;
    if (m.color && m.emissive) {
      if (tint !== null) {
        scratchTint.setHex(tint);
        // Mostly a color shift; a little glow so tinted packs read in shadow without going flat.
        m.color.lerp(scratchTint, 0.45);
        m.emissive.copy(scratchTint).multiplyScalar(0.1);
      }
      if (hl !== null) {
        scratchHl.setHex(hl).multiplyScalar(0.5);
        m.emissive.add(scratchHl);
      }
    }
    per.set(key, v);
  }
  return v;
}

/** Palette swap: texels whose hue lies in [from, to] (degrees, may wrap) become `color`. */
export interface RecolorRule {
  hue: [number, number];
  /** Ignore greys/skin below this saturation (0..1). Default 0.25. */
  minSat?: number;
  /** Instead target greys (metal): texels at or below this saturation, ignoring hue. */
  maxSat?: number;
  /** Grey rules: lowest texel brightness affected (default 0.12, which spares blacks like eyes). */
  minVal?: number;
  /** 0 = keep the texel's own brightness (default), 1 = paint the target color nearly flat. */
  flat?: number;
  color: number;
}

const recolorCache = new Map<string, THREE.Material>();

/**
 * Toon material with a hue-targeted palette swap (keeps each texel's brightness), so a model's
 * clothing can change color while skin, metal and faces stay as they are. Cached per key.
 */
export function recolorMaterial(
  base: THREE.Material,
  rules: readonly RecolorRule[],
  key: string,
): THREE.Material {
  const m0 = base as THREE.MeshToonMaterial;
  if (!m0.isMeshToonMaterial || !rules.length) return base;
  const k = `${key}|${base.uuid}`;
  let m = recolorCache.get(k);
  if (m) return m;
  const out = cloneKeepingDefines(m0);
  const n = Math.min(rules.length, 4);
  const lin = (hex: number) => new THREE.Color(hex); // Color stores linear components
  const uniforms = {
    rcHue: { value: rules.slice(0, n).map((r) => new THREE.Vector2(r.hue[0] / 360, r.hue[1] / 360)) },
    // x = min saturation (hue rules) or -max saturation (grey rules, ignoring hue).
    rcSat: { value: rules.slice(0, n).map((r) => (r.maxSat !== undefined ? -r.maxSat : (r.minSat ?? 0.25))) },
    rcCol: { value: rules.slice(0, n).map((r) => lin(r.color)) },
    rcMinV: { value: rules.slice(0, n).map((r) => r.minVal ?? (r.maxSat !== undefined ? 0.12 : -1)) },
    rcFlat: { value: rules.slice(0, n).map((r) => r.flat ?? 0) },
  };
  out.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 rcHue[${n}];
uniform float rcSat[${n}];
uniform vec3 rcCol[${n}];
uniform float rcMinV[${n}];
uniform float rcFlat[${n}];
vec3 rcHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 srgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
  vec3 hsv = rcHsv(srgb);
  for (int i = 0; i < ${n}; i++) {
    vec2 r = rcHue[i];
    bool inside = r.x <= r.y ? (hsv.x >= r.x && hsv.x <= r.y) : (hsv.x >= r.x || hsv.x <= r.y);
    bool grey = rcSat[i] < 0.0;
    if (grey ? (hsv.y <= -rcSat[i] && hsv.z > rcMinV[i] && hsv.z < 0.97) : (inside && hsv.y >= rcSat[i] && hsv.z > rcMinV[i])) {
      vec3 tgt = pow(rcCol[i], vec3(1.0 / 2.2));
      float tv = max(max(tgt.r, tgt.g), max(tgt.b, 1e-3));
      // Keep the texel's shading (its value relative to the palette's brightest) on the new color,
      // or (flat) mostly the target color itself with a little of the texel's shading.
      float k = mix((hsv.z / tv) * (0.45 + 0.55 * tv), 0.72 + 0.28 * hsv.z, rcFlat[i]);
      diffuseColor.rgb = pow(clamp(tgt * k, 0.0, 1.0), vec3(2.2));
      break;
    }
  }
}`,
      );
  };
  out.customProgramCacheKey = () => `recolor:${k}`;
  recolorCache.set(k, out);
  m = out;
  return m;
}
