/**
 * render/models: VisualFactory implementation. Loads glTF (cached, skinned-clone-safe) with a
 * procedural placeholder fallback so the game always runs with zero downloaded assets.
 */
import type * as THREE from 'three';
import type { EntityVisual, ModelEntry, VisualFactory } from '../types';
import { DEFAULT_PLACEHOLDER, MODEL_CATALOG, getModelEntry } from '../assets/catalog';
import { GltfRig } from './gltfRig';
import { AssetLoader } from './loader';
import { buildPlaceholderRig } from './placeholders';
import type { Rig } from './rig';
import { buildStaticPlaceholder, mergeLoadedScene, type StaticPart } from './statics';
import { Visual, type VisualEnv } from './visual';

export interface VisualFactoryOptions {
  /** Needed only to enable KTX2 texture decoding. */
  renderer?: THREE.WebGLRenderer;
  /** Override the catalog (tests, dev tools). */
  catalog?: readonly ModelEntry[];
}

export function createVisualFactory(opts: VisualFactoryOptions = {}): VisualFactory {
  const catalog = new Map<string, ModelEntry>();
  for (const e of opts.catalog ?? MODEL_CATALOG) catalog.set(e.id, e);
  // Unknown ids (e.g. per-NPC model ids) resolve through the catalog's prefix fallbacks.
  const lookup = (id: string): ModelEntry | undefined => {
    let e = catalog.get(id);
    if (!e && !opts.catalog) {
      e = getModelEntry(id);
      if (e.placeholder === DEFAULT_PLACEHOLDER && e.url === null) return undefined;
      catalog.set(id, e);
    }
    return e;
  };
  const loader = new AssetLoader(opts.renderer);
  const staticCache = new Map<string, StaticPart[]>();
  const placeholderStatics = new Map<string, StaticPart[]>();

  const fallbackEntry = (id: string): ModelEntry => ({
    id,
    url: null,
    scale: 1,
    placeholder: DEFAULT_PLACEHOLDER,
  });

  const env: VisualEnv = {
    entryFor: (id) => lookup(id),
    assetFor: (id) => loader.peek(lookup(id)?.url ?? null),
    loadAsset: (id) => {
      const url = lookup(id)?.url ?? null;
      return url && !loader.hasFailed(url) ? loader.load(url) : Promise.resolve(null);
    },
  };

  /** The model and (when it uses one) its animation library, or null until both are loaded. */
  const loadedRig = (entry: ModelEntry): Rig | null => {
    const asset = loader.peek(entry.url);
    if (!asset) return null;
    if (!entry.anims) return new GltfRig(asset, entry);
    const anims = loader.peek(entry.anims);
    return anims ? new GltfRig(asset, entry, anims) : null;
  };

  const buildRig = (id: string, entry: ModelEntry): Rig => loadedRig(entry) ?? buildPlaceholderRig(id, entry);

  function loadFor(entry: ModelEntry): Promise<unknown> {
    if (!entry.url) return Promise.resolve(null);
    return Promise.all([loader.load(entry.url), entry.anims ? loader.load(entry.anims) : null]);
  }

  return {
    async preload(modelIds) {
      await Promise.all(
        modelIds.map((id) => {
          const e = lookup(id);
          return e ? loadFor(e) : Promise.resolve(null);
        }),
      );
    },

    create(modelId): EntityVisual {
      const entry = lookup(modelId) ?? fallbackEntry(modelId);
      const visual = new Visual(env, buildRig(modelId, entry));
      // Not loaded yet: show the placeholder now and hot-swap when the glTF arrives.
      const pending =
        entry.url &&
        !loader.hasFailed(entry.url) &&
        (!loader.peek(entry.url) || (entry.anims && !loader.peek(entry.anims)));
      if (pending) {
        void loadFor(entry).then(() => {
          const rig = loadedRig(entry);
          if (rig) visual.swapRig(rig);
        });
      }
      return visual;
    },

    getStaticMesh(modelId) {
      const entry = lookup(modelId) ?? fallbackEntry(modelId);
      let parts = staticCache.get(modelId);
      if (!parts) {
        const asset = loader.peek(entry.url);
        if (asset) {
          parts = mergeLoadedScene(asset, entry.scale);
          staticCache.set(modelId, parts);
        } else {
          // Kick off the load so a later call (after level reload) gets the real model.
          if (entry.url && !loader.hasFailed(entry.url)) void loader.load(entry.url);
          parts = placeholderStatics.get(modelId);
          if (!parts) {
            parts = buildStaticPlaceholder(modelId, entry.placeholder);
            placeholderStatics.set(modelId, parts);
          }
        }
      }
      return parts.map((p) => ({ ...p }));
    },
  };
}
