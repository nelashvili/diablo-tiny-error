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
