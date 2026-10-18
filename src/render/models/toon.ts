/** Shared toon material helpers: one gradient map, cached materials, tint/highlight variants. */
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 4-step gradient map shared by every toon material. */
export function getGradientMap(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([70, 140, 205, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
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
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
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
    const m = new THREE.MeshToonMaterial({
      color: s.color,
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
    v = base.clone();
    // Keep shader patches (e.g. palette swaps) on hit-flash / status variants.
    v.onBeforeCompile = base.onBeforeCompile;
    v.customProgramCacheKey = base.customProgramCacheKey;
    const m = v as THREE.MeshToonMaterial;
    if (m.color && m.emissive) {
      if (tint !== null) {
        scratchTint.setHex(tint);
        m.color.lerp(scratchTint, 0.5);
        m.emissive.copy(scratchTint).multiplyScalar(0.22);
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
  const out = m0.clone();
  const n = Math.min(rules.length, 4);
  const lin = (hex: number) => new THREE.Color(hex); // Color stores linear components
  const uniforms = {
    rcHue: { value: rules.slice(0, n).map((r) => new THREE.Vector2(r.hue[0] / 360, r.hue[1] / 360)) },
    // x = min saturation (hue rules) or -max saturation (grey rules, ignoring hue).
    rcSat: { value: rules.slice(0, n).map((r) => (r.maxSat !== undefined ? -r.maxSat : (r.minSat ?? 0.25))) },
    rcCol: { value: rules.slice(0, n).map((r) => lin(r.color)) },
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
    if (grey ? (hsv.y <= -rcSat[i] && hsv.z > 0.12 && hsv.z < 0.97) : (inside && hsv.y >= rcSat[i])) {
      vec3 tgt = pow(rcCol[i], vec3(1.0 / 2.2));
      float tv = max(max(tgt.r, tgt.g), max(tgt.b, 1e-3));
      // Keep the texel's shading (its value relative to the palette's brightest) on the new color.
      diffuseColor.rgb = pow(clamp(tgt * (hsv.z / tv) * (0.45 + 0.55 * tv), 0.0, 1.0), vec3(2.2));
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
