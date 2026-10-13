/** Static environment pieces (tiles, props) as merged geometry+material sets for InstancedMesh. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { classifyModelId } from './helpers';
import type { ModelEntry } from '../types';
import type { LoadedAsset } from './loader';
import { glowMaterial, toonMaterial } from './toon';

export type StaticPart = { geometry: THREE.BufferGeometry; material: THREE.Material };

interface TilesetPalette {
  floor: number;
  floor2: number;
  road: number;
  grass: number;
  sand: number;
  rock: number;
  wall: number;
  wallTop: number;
  water: number;
}

const PALETTES: Record<string, TilesetPalette> = {
  endoor: {
    floor: 0x5a8a3c,
    floor2: 0x4c7a33,
    road: 0x8b6b43,
    grass: 0x4f9a3a,
    sand: 0xc9b57a,
    rock: 0x70685c,
    wall: 0x5b4228,
    wallTop: 0x2f6b2e,
    water: 0x3f8fd2,
  },
  tatoonie: {
    floor: 0xd9b878,
    floor2: 0xcaa86a,
    road: 0xb08a55,
    grass: 0x9c9a4a,
    sand: 0xe6c98a,
    rock: 0x9a7a55,
    wall: 0xb88a56,
    wallTop: 0xd8aa70,
    water: 0x4aa3b8,
  },
  kashyyyyyk: {
    floor: 0x2f6b3a,
    floor2: 0x285c33,
    road: 0x6b5232,
    grass: 0x2f8a40,
    sand: 0x8a8a55,
    rock: 0x4d5a4a,
    wall: 0x4a3524,
    wallTop: 0x1f5a2a,
    water: 0x2f7f7a,
  },
  deafStar: {
    floor: 0x6a7078,
    floor2: 0x5c626a,
    road: 0x474c54,
    grass: 0x586a64,
    sand: 0x80858c,
    rock: 0x50545c,
    wall: 0x8a9098,
    wallTop: 0x4f6a8a,
    water: 0x3a6a9a,
  },
};
const FALLBACK_PALETTE: TilesetPalette = PALETTES.deafStar as TilesetPalette;

export function paletteFor(tileset: string): TilesetPalette {
  const key = tileset.toLowerCase();
  for (const [k, p] of Object.entries(PALETTES)) if (key.includes(k.toLowerCase())) return p;
  return FALLBACK_PALETTE;
}

export type TileShape = 'wall' | 'water' | 'floor';

/** Pick the floor color key / shape from a tile kind string like `floor.grass`, `wall`, `road`. */
export function parseTileKind(kind: string): { shape: TileShape; variant: keyof TilesetPalette } {
  const k = kind.toLowerCase();
  if (/(wall|cliff|pillar|block|tree|bulkhead)/.test(k)) return { shape: 'wall', variant: 'wall' };
  if (/(water|lava|pool|acid|pit)/.test(k)) return { shape: 'water', variant: 'water' };
  if (/road|path|trail|bridge/.test(k)) return { shape: 'floor', variant: 'road' };
  if (/grass|moss|leaf|jungle/.test(k)) return { shape: 'floor', variant: 'grass' };
  if (/sand|dune|dust/.test(k)) return { shape: 'floor', variant: 'sand' };
  if (/rock|stone|gravel|rubble/.test(k)) return { shape: 'floor', variant: 'rock' };
  if (/alt|2|b$/.test(k)) return { shape: 'floor', variant: 'floor2' };
  return { shape: 'floor', variant: 'floor' };
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return m ?? new THREE.BoxGeometry(1, 1, 1);
}

function tilePart(tileset: string, kind: string): StaticPart[] {
  const pal = paletteFor(tileset);
  const { shape, variant } = parseTileKind(kind);
  const col = pal[variant];
  if (shape === 'wall') {
    const body = merge([box(1, 1.6, 1, 0, 0.8, 0)]);
    const top = merge([box(1.04, 0.14, 1.04, 0, 1.67, 0), box(0.9, 0.05, 0.9, 0, 1.76, 0)]);
    const parts: StaticPart[] = [
      { geometry: body, material: toonMaterial(col) },
      { geometry: top, material: toonMaterial(pal.wallTop) },
    ];
    if (tileset.toLowerCase().includes('deaf')) {
      parts.push({
        geometry: merge([box(1.02, 0.06, 1.02, 0, 0.9, 0)]),
        material: glowMaterial(0x4fc3ff, 0.8),
      });
    }
    return parts;
  }
  if (shape === 'water') {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.08, 0);
    const bed = box(1, 0.1, 1, 0, -0.2, 0);
    return [
      { geometry: bed, material: toonMaterial(0x24323f) },
      { geometry: g, material: toonMaterial(col, { opacity: 0.7, doubleSide: true }) },
    ];
  }
  // floor slab: top face at y=0, thin trim and a small detail bump for visual rhythm
  const slab = box(1, 0.2, 1, 0, -0.1, 0);
  const detail = merge([box(0.18, 0.03, 0.18, -0.25, 0.015, 0.22), box(0.12, 0.03, 0.12, 0.28, 0.015, -0.2)]);
  const detailCol = variant === 'road' ? pal.rock : variant === 'grass' ? pal.floor2 : pal.floor2;
  return [
    { geometry: slab, material: toonMaterial(col) },
    { geometry: detail, material: toonMaterial(detailCol) },
  ];
}

function propPart(name: string, ph: ModelEntry['placeholder']): StaticPart[] {
  const n = name.toLowerCase();
  const H = ph.height;
  const R = ph.radius;
  if (/(tree|palm|wroshyr)/.test(n)) {
    const trunk = new THREE.CylinderGeometry(R * 0.25, R * 0.35, H * 0.5, 7);
    trunk.translate(0, H * 0.25, 0);
    const leaves = new THREE.ConeGeometry(R * 1.2, H * 0.7, 8);
    leaves.translate(0, H * 0.65, 0);
    return [
      { geometry: trunk, material: toonMaterial(0x6b4a2a) },
      { geometry: leaves, material: toonMaterial(0x2f7f3a) },
    ];
  }
  if (/(rock|boulder|stone|rubble)/.test(n)) {
    const g = new THREE.IcosahedronGeometry(Math.max(R, 0.3), 0);
    g.scale(1, Math.max(H, 0.3) / (Math.max(R, 0.3) * 2), 1);
    g.translate(0, H * 0.4, 0);
    return [{ geometry: g, material: toonMaterial(ph.color) }];
  }
  if (/(crate|box|cargo|container)/.test(n)) {
    const body = box(R * 2, H, R * 2, 0, H / 2, 0);
    const band = box(R * 2.1, H * 0.12, R * 2.1, 0, H * 0.5, 0);
    return [
      { geometry: body, material: toonMaterial(ph.color) },
      { geometry: band, material: toonMaterial(0x30343c) },
    ];
  }
  const col = new THREE.CylinderGeometry(R * 0.8, R, H, 8);
  col.translate(0, H / 2, 0);
  const cap = box(R * 2.2, H * 0.08, R * 2.2, 0, H, 0);
  return [
    { geometry: col, material: toonMaterial(ph.color) },
    { geometry: cap, material: toonMaterial(0x30343c) },
  ];
}

/** Placeholder static parts for a tile/prop/other id. */
export function buildStaticPlaceholder(id: string, ph: ModelEntry['placeholder']): StaticPart[] {
  const info = classifyModelId(id);
  if (info.kind === 'tile') return tilePart(info.tileset ?? '', info.tileKind ?? '');
  if (info.kind === 'prop') return propPart(info.name, ph);
  return propPart(info.name || id, ph);
}

/**
 * Merge a loaded glTF scene into at most 3 geometry+material parts (grouped by material),
 * baking node transforms and entry scale.
 */
export function mergeLoadedScene(asset: LoadedAsset, scale: number): StaticPart[] {
  asset.scene.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(asset.scene.matrixWorld).invert();
  const scaleM = new THREE.Matrix4().makeScale(scale, scale, scale);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  asset.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat) return;
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(scaleM, rootInv).multiply(m.matrixWorld));
    const list = byMat.get(mat) ?? [];
    list.push(g);
    byMat.set(mat, list);
  });
  const groups = [...byMat.entries()].map(([material, geos]) => ({
    material,
    geos,
    tris: geos.reduce((n, g) => n + g.attributes.position!.count, 0),
  }));
  groups.sort((a, b) => b.tris - a.tris);
  const out: StaticPart[] = [];
  const top = groups.slice(0, 3);
  const rest = groups.slice(3);
  for (const g of rest) top[top.length - 1]?.geos.push(...g.geos);
  for (const g of top) out.push({ geometry: merge(g.geos), material: g.material });
  return out;
}
