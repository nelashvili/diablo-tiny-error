/**
 * render/models: VisualFactory implementation. Loads glTF (cached, skinned-clone-safe) with a
 * procedural placeholder fallback so the game always runs with zero downloaded assets.
 */
import type * as THREE from 'three';
import type { EntityVisual, ModelEntry, VisualFactory } from '../types';
import { DEFAULT_PLACEHOLDER, MODEL_CATALOG } from '../assets/catalog';
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
    entryFor: (id) => catalog.get(id),
    assetFor: (id) => loader.peek(catalog.get(id)?.url ?? null),
  };

  const buildRig = (id: string, entry: ModelEntry): Rig => {
    const asset = loader.peek(entry.url);
    if (asset) return new GltfRig(asset, entry);
    return buildPlaceholderRig(id, entry);
  };

  function loadFor(entry: ModelEntry): Promise<unknown> {
    return entry.url ? loader.load(entry.url) : Promise.resolve(null);
  }

  return {
    async preload(modelIds) {
      await Promise.all(
        modelIds.map((id) => {
          const e = catalog.get(id);
          return e ? loadFor(e) : Promise.resolve(null);
        }),
      );
    },

    create(modelId): EntityVisual {
      const entry = catalog.get(modelId) ?? fallbackEntry(modelId);
      const visual = new Visual(env, buildRig(modelId, entry));
      // Not loaded yet: show the placeholder now and hot-swap when the glTF arrives.
      if (entry.url && !loader.peek(entry.url) && !loader.hasFailed(entry.url)) {
        void loader.load(entry.url).then((asset) => {
          if (asset) visual.swapRig(new GltfRig(asset, entry));
        });
      }
      return visual;
    },

    getStaticMesh(modelId) {
      const entry = catalog.get(modelId) ?? fallbackEntry(modelId);
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
