// Pure-node glTF/GLB utility used to curate third-party packs into single-file GLBs.
//  - embeds external .bin / texture files and data: URIs
//  - drops animations that are not whitelisted, drops named nodes (e.g. baked-in weapons)
//  - garbage-collects unreferenced meshes/accessors/bufferViews/materials/textures/images
//  - measures the rest-pose height (Y extent) of the result
// Usage as a module: `import { processModel } from './glb-tool.mjs'`.
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Read .glb or .gltf into { json, buffers: Buffer[] } with external resources resolved. */
export function readModel(file) {
  const raw = fs.readFileSync(file);
  const dir = path.dirname(file);
  let json;
  const buffers = [];
  if (raw.readUInt32LE(0) === 0x46546c67) {
    let off = 12;
    let glbBin = null;
    while (off < raw.length) {
      const len = raw.readUInt32LE(off);
      const type = raw.readUInt32LE(off + 4);
      const data = raw.subarray(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
      else if (type === 0x004e4942) glbBin = data;
      off += 8 + len;
    }
    for (const [i, b] of (json.buffers ?? []).entries()) {
      buffers[i] = b.uri ? loadUri(b.uri, dir) : glbBin;
    }
  } else {
    json = JSON.parse(raw.toString('utf8'));
    for (const [i, b] of (json.buffers ?? []).entries()) buffers[i] = loadUri(b.uri, dir);
  }
  // resolve images that use uris
  const images = (json.images ?? []).map((img) => {
    if (img.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      return {
        data: buffers[bv.buffer].subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength),
        mime: img.mimeType,
      };
    }
    const data = loadUri(img.uri, dir);
    const mime = img.mimeType ?? MIME[path.extname(img.uri.split('?')[0]).toLowerCase()] ?? 'image/png';
    return { data, mime };
  });
  return { json, buffers, images };
}

function loadUri(uri, dir) {
  if (uri.startsWith('data:')) return Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  return fs.readFileSync(path.join(dir, decodeURIComponent(uri)));
}

/**
 * Rebuild a compact single-buffer model.
 * opts: keepAnimations?: string[] | null (null = keep all), removeNodes?: string[]
 */
export function compact({ json, buffers, images }, opts = {}) {
  const j = structuredClone(json);
  const keepAnim = opts.keepAnimations ?? null;
  const removeNames = new Set(opts.removeNodes ?? []);

  // 1. animations
  if (j.animations) {
    j.animations = keepAnim ? j.animations.filter((a) => keepAnim.includes(a.name)) : j.animations;
    if (keepAnim) {
      const order = new Map(keepAnim.map((n, i) => [n, i]));
      j.animations.sort((a, b) => order.get(a.name) - order.get(b.name));
    }
    if (j.animations.length === 0) delete j.animations;
  }
  // 2. detach removed nodes (and their meshes/subtrees)
  const nodes = j.nodes ?? [];
  const dropNode = (i) => {
    const n = nodes[i];
    delete n.mesh;
    delete n.skin;
    for (const c of n.children ?? []) dropNode(c);
  };
  nodes.forEach((n, i) => {
    if (removeNames.has(n.name)) dropNode(i);
  });
  // animation channels targeting a dropped node are harmless (node still exists)

  // 3. mark used
  const useMesh = new Set(nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh));
  const useSkin = new Set(nodes.filter((n) => n.skin !== undefined).map((n) => n.skin));
  const useAcc = new Set();
  const useMat = new Set();
  for (const mi of useMesh) {
    for (const p of j.meshes[mi].primitives) {
      for (const a of Object.values(p.attributes)) useAcc.add(a);
      if (p.indices !== undefined) useAcc.add(p.indices);
      if (p.material !== undefined) useMat.add(p.material);
      for (const t of p.targets ?? []) for (const a of Object.values(t)) useAcc.add(a);
    }
  }
  for (const si of useSkin) {
    const s = j.skins[si];
    if (s.inverseBindMatrices !== undefined) useAcc.add(s.inverseBindMatrices);
  }
  for (const a of j.animations ?? []) {
    for (const s of a.samplers) {
      useAcc.add(s.input);
      useAcc.add(s.output);
    }
  }
  const useTex = new Set();
  const scanTex = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.index === 'number' && ('texCoord' in o || Object.keys(o).length <= 3)) useTex.add(o.index);
    for (const v of Object.values(o)) if (typeof v === 'object') scanTex(v);
  };
  for (const mi of useMat) scanTex(j.materials[mi]);
  const useImg = new Set();
  const useSampler = new Set();
  for (const ti of useTex) {
    const t = j.textures[ti];
    if (t.source !== undefined) useImg.add(t.source);
    if (t.sampler !== undefined) useSampler.add(t.sampler);
  }

  // 4. rebuild buffer
  const chunks = [];
  let total = 0;
  const addChunk = (buf) => {
    const pad = (4 - (total % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      total += pad;
    }
    const offset = total;
    chunks.push(buf);
    total += buf.length;
    return offset;
  };
  const newBV = [];
  const bvMap = new Map(); // old bv -> new bv
  const getBV = (old) => {
    if (bvMap.has(old)) return bvMap.get(old);
    const bv = j.bufferViews[old];
    const data = buffers[bv.buffer].subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const off = addChunk(Buffer.from(data));
    const nb = { buffer: 0, byteOffset: off, byteLength: bv.byteLength };
    if (bv.byteStride) nb.byteStride = bv.byteStride;
    if (bv.target) nb.target = bv.target;
    newBV.push(nb);
    bvMap.set(old, newBV.length - 1);
    return newBV.length - 1;
  };
  const accMap = new Map();
  const newAcc = [];
  [...useAcc]
    .sort((a, b) => a - b)
    .forEach((old) => {
      const a = { ...j.accessors[old] };
      if (a.sparse) throw new Error('sparse accessors unsupported');
      if (a.bufferView !== undefined) a.bufferView = getBV(a.bufferView);
      newAcc.push(a);
      accMap.set(old, newAcc.length - 1);
    });
  const remap = (set) => new Map([...set].sort((a, b) => a - b).map((o, i) => [o, i]));
  const meshMap = remap(useMesh);
  const skinMap = remap(useSkin);
  const matMap = remap(useMat);
  const texMap = remap(useTex);
  const imgMap = remap(useImg);
  const samplerMap = remap(useSampler);

  const newImages = [...imgMap.keys()].map((old) => {
    const img = images[old];
    const off = addChunk(Buffer.from(img.data));
    newBV.push({ buffer: 0, byteOffset: off, byteLength: img.data.length });
    return { bufferView: newBV.length - 1, mimeType: img.mime, name: j.images[old].name };
  });
  const newTex = [...texMap.keys()].map((old) => {
    const t = { ...j.textures[old] };
    if (t.source !== undefined) t.source = imgMap.get(t.source);
    if (t.sampler !== undefined) t.sampler = samplerMap.get(t.sampler);
    return t;
  });
  const fixTex = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.index === 'number' && ('texCoord' in o || Object.keys(o).length <= 3))
      o.index = texMap.get(o.index);
    for (const v of Object.values(o)) if (typeof v === 'object') fixTex(v);
  };
  const newMat = [...matMap.keys()].map((old) => {
    const m = structuredClone(j.materials[old]);
    fixTex(m);
    return m;
  });
  const newMeshes = [...meshMap.keys()].map((old) => {
    const m = structuredClone(j.meshes[old]);
    for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
      if (p.indices !== undefined) p.indices = accMap.get(p.indices);
      if (p.material !== undefined) p.material = matMap.get(p.material);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
    }
    return m;
  });
  const newSkins = [...skinMap.keys()].map((old) => {
    const s = { ...j.skins[old] };
    if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
    return s;
  });
  const newAnims = (j.animations ?? []).map((a) => ({
    ...a,
    samplers: a.samplers.map((s) => ({ ...s, input: accMap.get(s.input), output: accMap.get(s.output) })),
  }));
  for (const n of nodes) {
    if (n.mesh !== undefined) n.mesh = meshMap.get(n.mesh);
    if (n.skin !== undefined) n.skin = skinMap.get(n.skin);
  }

  const out = {
    asset: { version: '2.0', generator: 'diablo-tiny-error glb-tool' },
    scene: j.scene ?? 0,
    scenes: j.scenes,
    nodes,
    meshes: newMeshes,
    accessors: newAcc,
    bufferViews: newBV,
    buffers: [{ byteLength: total }],
  };
  if (newSkins.length) out.skins = newSkins;
  if (newMat.length) out.materials = newMat;
  if (newTex.length) out.textures = newTex;
  if (newImages.length) out.images = newImages;
  if (samplerMap.size) out.samplers = [...samplerMap.keys()].map((o) => j.samplers[o]);
  if (newAnims.length) out.animations = newAnims;
  if (j.extensionsUsed) out.extensionsUsed = j.extensionsUsed;
  return packGlb(out, Buffer.concat(chunks, total));
}

export function packGlb(json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jp = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jp, 0x20)]);
  const bp = (4 - (bin.length % 4)) % 4;
  const binBuf = Buffer.concat([bin, Buffer.alloc(bp)]);
  const len = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(len, 8);
  const h1 = Buffer.alloc(8);
  h1.writeUInt32LE(jsonBuf.length, 0);
  h1.writeUInt32LE(0x4e4f534a, 4);
  const h2 = Buffer.alloc(8);
  h2.writeUInt32LE(binBuf.length, 0);
  h2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, h1, jsonBuf, h2, binBuf]);
}

// ---- measuring --------------------------------------------------------------------------------
function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
/** Rest-pose world AABB: mesh bboxes through node transforms (static) or joint positions (skinned). */
export function measure(glb) {
  const raw = readModelBuffer(glb);
  const j = raw.json;
  const world = new Map();
  const walk = (i, parent) => {
    const m = matMul(parent, local(j.nodes[i]));
    world.set(i, m);
    for (const c of j.nodes[i].children ?? []) walk(c, m);
  };
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, ident);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const add = (p) => p.forEach((v, i) => ((min[i] = Math.min(min[i], v)), (max[i] = Math.max(max[i], v))));
  const joints = new Set((j.skins ?? []).flatMap((s) => s.joints));
  let skinned = false;
  j.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    if (n.skin !== undefined) {
      skinned = true;
      return;
    }
    const w = world.get(i);
    for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION];
      for (const cx of [a.min[0], a.max[0]])
        for (const cy of [a.min[1], a.max[1]])
          for (const cz of [a.min[2], a.max[2]])
            add([0, 1, 2].map((r) => w[r] * cx + w[4 + r] * cy + w[8 + r] * cz + w[12 + r]));
    }
  });
  if (skinned) for (const jn of joints) add([world.get(jn)[12], world.get(jn)[13], world.get(jn)[14]]);
  return { min, max, size: max.map((v, i) => v - min[i]), skinned };
}
function readModelBuffer(glb) {
  const len = glb.readUInt32LE(12);
  return { json: JSON.parse(glb.subarray(20, 20 + len).toString('utf8')) };
}

export function processModel(src, dest, opts = {}) {
  const model = readModel(src);
  const out = compact(model, opts);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  const m = measure(out);
  return {
    bytes: out.length,
    ...m,
    animations: (readModelBuffer(out).json.animations ?? []).map((a) => a.name),
  };
}
