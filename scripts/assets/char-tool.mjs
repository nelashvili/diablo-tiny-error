// Helpers for building characters from the Quaternius universal-rig packs with glTF-Transform.
// Used by build-chars.mjs. The packs ship .gltf + .bin + loose PNGs, with a few broken image URIs.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
export const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

/**
 * Read a .gltf/.glb, tolerating missing images: a URI like `T_X_png.png` falls back to `T_X.png`;
 * an image that still can't be found is dropped (textures using it are removed).
 */
export async function readLenient(file) {
  if (file.endsWith('.glb')) return io.read(file);
  const dir = path.dirname(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const resources = {};
  for (const b of json.buffers ?? [])
    if (b.uri) resources[b.uri] = new Uint8Array(fs.readFileSync(path.join(dir, b.uri)));
  const dropImages = new Set();
  (json.images ?? []).forEach((img, i) => {
    if (!img.uri) return;
    const tries = [img.uri, img.uri.replace(/_png\.png$/, '.png'), img.uri.replace(/\.png$/, '_png.png')];
    const hit = tries.find((u) => fs.existsSync(path.join(dir, decodeURIComponent(u))));
    if (!hit) return dropImages.add(i);
    img.uri = hit;
    resources[hit] = new Uint8Array(fs.readFileSync(path.join(dir, decodeURIComponent(hit))));
  });
  if (dropImages.size) {
    const dropTex = new Set();
    (json.textures ?? []).forEach((t, i) => dropImages.has(t.source) && dropTex.add(i));
    const strip = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (v && typeof v === 'object' && 'index' in v && k.endsWith('Texture') && dropTex.has(v.index))
          delete o[k];
        else strip(v);
      }
    };
    strip(json.materials);
    // Keep indices stable: point dropped textures at a surviving image (they're no longer referenced).
    const keep = (json.images ?? []).findIndex((_, i) => !dropImages.has(i));
    for (const t of json.textures ?? []) if (dropImages.has(t.source)) t.source = keep;
    for (const i of dropImages) if (keep >= 0) json.images[i] = json.images[keep];
  }
  return io.readJSON({ json, resources });
}
