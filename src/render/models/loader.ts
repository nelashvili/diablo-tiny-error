/** glTF loading with per-url cache. Failures resolve to null (callers fall back to placeholders). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { resolveAssetUrl } from './helpers';
import { toToon } from './toon';

export interface LoadedAsset {
  /** Template scene (toon materials applied). Clone with SkeletonUtils.clone. */
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  clipNames: string[];
  /** Bounding box height of the template (before entry.scale). */
  height: number;
}

const DRACO_PATH = '/assets/decoders/draco/';
const BASIS_PATH = '/assets/decoders/basis/';

export class AssetLoader {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<LoadedAsset | null>>();
  private readonly done = new Map<string, LoadedAsset>();
  private readonly failed = new Set<string>();

  constructor(renderer?: THREE.WebGLRenderer) {
    // Decoders only fetch their wasm/js when a compressed model actually needs them.
    const d = new DRACOLoader();
    d.setDecoderPath(DRACO_PATH);
    this.loader.setDRACOLoader(d);
    if (renderer) {
      const k = new KTX2Loader();
      k.setTranscoderPath(BASIS_PATH);
      k.detectSupport(renderer);
      this.loader.setKTX2Loader(k);
    }
  }

  /** Already-loaded asset or null (never triggers a load). */
  peek(url: string | null): LoadedAsset | null {
    return url ? (this.done.get(url) ?? null) : null;
  }

  hasFailed(url: string): boolean {
    return this.failed.has(url);
  }

  load(url: string): Promise<LoadedAsset | null> {
    let p = this.cache.get(url);
    if (!p) {
      p = this.doLoad(url);
      this.cache.set(url, p);
    }
    return p;
  }

  private async doLoad(url: string): Promise<LoadedAsset | null> {
    try {
      const gltf = await this.loader.loadAsync(resolveAssetUrl(url));
      const scene = gltf.scene;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = Array.isArray(m.material) ? m.material.map(toToon) : toToon(m.material);
        m.frustumCulled = !(m as THREE.SkinnedMesh).isSkinnedMesh;
      });
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const asset: LoadedAsset = {
        scene,
        animations: gltf.animations,
        clipNames: gltf.animations.map((a) => a.name),
        height: Math.max(0.01, box.max.y - box.min.y),
      };
      this.done.set(url, asset);
      return asset;
    } catch (e) {
      this.failed.add(url);
      console.warn(`[render/models] failed to load ${url}; using placeholder`, e);
      return null;
    }
  }
}
