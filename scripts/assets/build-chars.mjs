// Builds the universal-rig characters and the shared animation library from the Quaternius packs.
// Usage: ASSET_SRC=/path/to/downloads node scripts/assets/build-chars.mjs [--dry]
// ASSET_SRC layout (see ~/github/diablo-asset-src/SOURCES.md):
//   quaternius/ubc/      Universal Base Characters [Standard] (CC0)
//   quaternius/outfits/  Modular Character Outfits - Fantasy [Standard] (CC0)
//   quaternius/ual1/     Universal Animation Library [Standard] (CC0)
//   quaternius/ual2/     Universal Animation Library 2 [Standard] (CC0)
// Writes public/assets/models/chars/*.glb (one per outfit) and public/assets/models/chars/anims.glb.
//
// A character = an outfit (everything below the neck, "Regular" proportions) + the head cut from a
// Superhero base body (the free tier ships no Regular bodies; head and neck bones sit at the same rest
// positions in both, so the head drops straight onto the outfit's skeleton) + an optional hairstyle.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import {
  compactPrimitive,
  dequantizePrimitive,
  joinPrimitives,
  dedup,
  mergeDocuments,
  meshopt,
  prune,
  resample,
  simplify,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { io, readLenient } from './char-tool.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = process.env.ASSET_SRC;
if (!SRC) throw new Error('set ASSET_SRC');
const OUT = path.join(ROOT, 'public/assets/models/chars');
const dry = process.argv.includes('--dry');

const Q = path.join(SRC, 'quaternius');
const BODY = (f) => `${Q}/ubc/Universal Base Characters[Standard]/Base Characters/Godot - UE/${f}.gltf`;
const OUTFIT = (f) =>
  `${Q}/outfits/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/${f}.gltf`;
const HAIR = (f) =>
  `${Q}/ubc/Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/${f}.gltf`;
const UAL1 = `${Q}/ual1/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb`;
const UAL2 = `${Q}/ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb`;

/** Optional parts kept as separate nodes so catalog entries can `hide` them; the rest is joined. */
const SEPARATE = /Head_Hood|^Hair_/;
/**
 * Hero builds ("<id>Parts.glb") keep one node per body part, named so render/models/outfit.ts can
 * recolor what armor covers (arms / legs / body); the face is left out of outfit recolors.
 */
function partOf(name) {
  if (/Arms/.test(name)) return 'Arms';
  if (/Legs|Feet|Boots/.test(name)) return 'Legs';
  if (/Body|Belt|Pauldron/.test(name)) return 'Body';
  return 'Face';
}
/** Default hair tint: the hair textures are near-white masks meant to be colored. */
const HAIR_COLOR = 0x4a2e1c;

/** Base-color texture size in the game (the packs ship 4096² PBR sets). */
const TEX_SIZE = 1024;
/** Fraction of triangles kept by the simplifier (the packs average ~25k tris per dressed character). */
const KEEP_RATIO = 0.3;

// hairColor: tint of hair and eyebrows (sRGB hex); defaults to HAIR_COLOR.
// heroParts: also build <id>Parts.glb, split by body part for hero armor outfits.
const CHARS = [
  // Rangers carry both a hood and hair: catalog entries hide one (`hide: ['Hair_*']` or the hood).
  {
    id: 'rangerM',
    outfit: 'Male_Ranger',
    body: 'Superhero_Male_FullBody',
    hair: 'Hair_SimpleParted',
    heroParts: true,
  },
  { id: 'rangerF', outfit: 'Female_Ranger', body: 'Superhero_Female_FullBody', hair: 'Hair_Buns' },
  {
    id: 'peasantM',
    outfit: 'Male_Peasant',
    body: 'Superhero_Male_FullBody',
    hair: 'Hair_SimpleParted',
    heroParts: true,
  },
  { id: 'peasantF', outfit: 'Female_Peasant', body: 'Superhero_Female_FullBody', hair: 'Hair_Long' },
];

/** Bones whose skin counts as "head" when cutting the head out of a base body. */
const HEAD_BONES = new Set(['Head', 'neck_01']);

/** UAL1 (Rigify DEF-* names) -> universal rig names. The two libraries share one rig otherwise. */
function ual1Name(n) {
  const side = (s) => (s === 'L' ? 'l' : 'r');
  const fixed = {
    'DEF-hips': 'pelvis',
    'DEF-spine.001': 'spine_01',
    'DEF-spine.002': 'spine_02',
    'DEF-spine.003': 'spine_03',
    'DEF-neck': 'neck_01',
    'DEF-head': 'Head',
  };
  if (fixed[n]) return fixed[n];
  let m = n.match(/^DEF-(shoulder|upper_arm|forearm|hand|thigh|shin|foot|toe)\.([LR])$/);
  if (m) {
    const part = {
      shoulder: 'clavicle',
      upper_arm: 'upperarm',
      forearm: 'lowerarm',
      hand: 'hand',
      thigh: 'thigh',
      shin: 'calf',
      foot: 'foot',
      toe: 'ball',
    }[m[1]];
    return `${part}_${side(m[2])}`;
  }
  m = n.match(/^DEF-(?:f_)?(index|middle|pinky|ring|thumb)\.0(\d)\.([LR])$/);
  if (m) return `${m[1]}_0${m[2]}_${side(m[3])}`;
  return n;
}

/** Clips kept in anims.glb: [source library, clip name]. Everything else is dropped. */
const CLIPS = [
  [1, 'Idle_Loop'],
  [1, 'Idle_Talking_Loop'],
  [1, 'Walk_Loop'],
  [1, 'Jog_Fwd_Loop'],
  [1, 'Sprint_Loop'],
  [1, 'Death01'],
  [1, 'Hit_Chest'],
  [1, 'Hit_Head'],
  [1, 'Spell_Simple_Shoot'],
  [1, 'Spell_Simple_Idle_Loop'],
  [1, 'Pistol_Idle_Loop'],
  [1, 'Pistol_Shoot'],
  [1, 'Sword_Idle'],
  [1, 'Sword_Attack'],
  [1, 'Punch_Jab'],
  [1, 'Punch_Cross'],
  [1, 'Interact'],
  [1, 'PickUp_Table'],
  [1, 'Dance_Loop'],
  [1, 'Roll'],
  [2, 'Sword_Regular_A'],
  [2, 'Sword_Regular_B'],
  [2, 'Sword_Regular_C'],
  [2, 'Sword_Block'],
  [2, 'Hit_Knockback'],
  [2, 'OverhandThrow'],
  [2, 'Idle_FoldArms_Loop'],
  [2, 'Yes'],
  [2, 'Chest_Open'],
];

// ------------------------------------------------------------------ characters

function jointNames(skin) {
  return skin.listJoints().map((j) => j.getName());
}

/** Keep only triangles whose 3 vertices are mostly weighted to `bones`. */
function cutToBones(prim, names, bones) {
  const idx = prim.getIndices();
  const joints = prim.getAttribute('JOINTS_0');
  const weights = prim.getAttribute('WEIGHTS_0');
  const j = [];
  const w = [];
  const isHead = (v) => {
    joints.getElement(v, j);
    weights.getElement(v, w);
    let best = 0;
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
    return bones.has(names[j[best]]);
  };
  const keep = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const a = idx.getScalar(t);
    const b = idx.getScalar(t + 1);
    const c = idx.getScalar(t + 2);
    if (isHead(a) && isHead(b) && isHead(c)) keep.push(a, b, c);
  }
  idx.setArray(new Uint32Array(keep));
  compactPrimitive(prim);
  return keep.length / 3;
}

/**
 * Move the skinned mesh nodes of a merged-in part onto the outfit's skeleton. Joint indices are remapped
 * by bone name (the packs share one rig, but don't rely on identical joint order).
 */
function rebindToSkin(doc, nodes, fromSkin, toSkin, parent) {
  const from = jointNames(fromSkin);
  const to = new Map(jointNames(toSkin).map((n, i) => [n, i]));
  const remap = from.map((n) => {
    const i = to.get(n);
    if (i === undefined) throw new Error(`bone ${n} missing from outfit skeleton`);
    return i;
  });
  const done = new Set();
  for (const node of nodes) {
    for (const prim of node.getMesh().listPrimitives()) {
      const acc = prim.getAttribute('JOINTS_0');
      if (done.has(acc)) continue;
      done.add(acc);
      const el = [];
      for (let v = 0; v < acc.getCount(); v++) {
        acc.getElement(v, el);
        acc.setElement(
          v,
          el.map((x) => remap[x]),
        );
      }
    }
    node.setSkin(toSkin);
    parent.addChild(node);
  }
}

/** Merge a base body's (or hairstyle's) skinned meshes into `doc`, bound to the outfit skeleton. */
async function graft(doc, file, filter) {
  const part = await readLenient(file);
  const skin = doc.getRoot().listSkins()[0];
  const parent = skin.listJoints()[0].getParentNode() ?? doc.getRoot().listScenes()[0];
  const before = new Set(doc.getRoot().listNodes());
  const beforeSkins = new Set(doc.getRoot().listSkins());
  mergeDocuments(doc, part);
  const added = doc
    .getRoot()
    .listNodes()
    .filter((n) => !before.has(n));
  const partSkin = doc
    .getRoot()
    .listSkins()
    .find((s) => !beforeSkins.has(s));
  const meshNodes = added.filter(
    (n) => n.getMesh() && n.getSkin() === partSkin && filter(n, jointNames(partSkin)),
  );
  rebindToSkin(doc, meshNodes, partSkin, skin, parent);
  // Drop the part's own skeleton, scene and leftover meshes.
  for (const n of added) if (!meshNodes.includes(n)) n.dispose();
  partSkin.dispose();
  for (const s of doc.getRoot().listScenes().slice(1)) s.dispose();
}

/** Resize base-color textures, drop the PBR maps the toon shading ignores. */
async function shrinkTextures(doc, tmp) {
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setNormalTexture(null);
    mat.setOcclusionTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setEmissiveTexture(null);
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(1);
  }
  await doc.transform(prune()); // textures no longer referenced
  for (const tex of doc.getRoot().listTextures()) {
    const users = tex.listParents().filter((p) => p.propertyType === 'Material');
    const alpha = users.some((m) => m.getAlphaMode() !== 'OPAQUE');
    const src = path.join(tmp, `${tex.getName() || 'tex'}-${Math.random().toString(36).slice(2)}.png`);
    fs.writeFileSync(src, tex.getImage());
    const ext = alpha ? 'png' : 'jpg';
    const dst = src.replace(/\.png$/, `.${ext}`);
    execFileSync(
      'sips',
      [
        '-Z',
        String(TEX_SIZE),
        ...(alpha ? [] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85']),
        src,
        '--out',
        dst,
      ],
      { stdio: 'ignore' },
    );
    tex.setImage(new Uint8Array(fs.readFileSync(dst)));
    tex.setMimeType(alpha ? 'image/png' : 'image/jpeg');
    tex.setURI(`${path.basename(dst)}`);
  }
}

/**
 * Join the skinned meshes per material into one node (glTF-Transform's join() skips skinned nodes):
 * all parts share the outfit skeleton and identity node transforms, so their primitives can simply be
 * concatenated. Parts matching SEPARATE stay their own nodes. ~13 meshes -> ~5 draw calls.
 */
function joinSkinned(doc, byPart) {
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const parent = skin.listJoints()[0].getParentNode();
  const groups = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getSkin() !== skin) continue;
    const name = node.getName();
    const owner = SEPARATE.test(name) ? name : byPart ? partOf(name) : 'Body';
    for (const prim of mesh.listPrimitives()) {
      dequantizePrimitive(prim);
      for (const sem of prim.listSemantics())
        if (!['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(sem))
          prim.setAttribute(sem, null);
      const j = prim.getAttribute('JOINTS_0');
      if (!(j.getArray() instanceof Uint16Array)) j.setArray(new Uint16Array(j.getArray()));
      const key = `${owner}|${prim.getMaterial()?.getName()}`;
      if (!groups.has(key)) groups.set(key, { owner, prims: [] });
      groups.get(key).prims.push(prim);
    }
    node.dispose();
  }
  const owners = new Map();
  for (const { owner, prims } of groups.values()) {
    let node = owners.get(owner);
    if (!node) {
      node = doc.createNode(owner).setMesh(doc.createMesh(owner)).setSkin(skin);
      parent.addChild(node);
      owners.set(owner, node);
    }
    node.getMesh().addPrimitive(prims.length > 1 ? joinPrimitives(prims) : prims[0]);
  }
}

/** Tint hair/eyebrow materials (their textures are white masks). */
function tintHair(doc, hex) {
  const lin = (c) => Math.pow(c / 255, 2.2);
  const rgb = [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255), 1];
  for (const m of doc.getRoot().listMaterials()) if (/Hair/.test(m.getName())) m.setBaseColorFactor(rgb);
}

async function buildChar(c, tmp, byPart) {
  const doc = await readLenient(OUTFIT(c.outfit));
  // Head (with eyes and eyebrows) cut from the base body.
  let headTris = 0;
  await graft(doc, BODY(c.body), (node, names) => {
    const prims = node.getMesh().listPrimitives();
    const isBody = prims.some((p) => /Superhero/.test(p.getMaterial()?.getName() ?? ''));
    if (isBody) for (const p of prims) headTris += cutToBones(p, names, HEAD_BONES);
    return true;
  });
  if (c.hair) await graft(doc, HAIR(c.hair), () => true);
  tintHair(doc, c.hairColor ?? HAIR_COLOR);
  await shrinkTextures(doc, tmp);
  joinSkinned(doc, byPart);
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: KEEP_RATIO, error: 0.01 }),
    prune(),
    unpartition(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    prune(),
  );
  let tris = 0;
  let prims = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      tris += (p.getIndices()?.getCount() ?? 0) / 3;
      prims++;
    }
  return { doc, report: { headTris, tris, drawCalls: prims } };
}

// ------------------------------------------------------------------ animation library

async function buildAnims() {
  const keep1 = new Set(CLIPS.filter(([l]) => l === 1).map(([, n]) => n));
  const keep2 = new Set(CLIPS.filter(([l]) => l === 2).map(([, n]) => n));
  const a1 = await io.read(UAL1);
  const a2 = await io.read(UAL2);
  for (const n of a1.getRoot().listNodes()) n.setName(ual1Name(n.getName()));
  for (const [doc, keep] of [
    [a1, keep1],
    [a2, keep2],
  ]) {
    // Disposing an Animation leaves its samplers (and their keyframe data) alive: dispose them too.
    for (const a of doc.getRoot().listAnimations()) {
      if (keep.has(a.getName())) continue;
      for (const s of a.listSamplers()) s.dispose();
      for (const c of a.listChannels()) c.dispose();
      a.dispose();
    }
    for (const a of doc.getRoot().listAnimations()) {
      for (const ch of a.listChannels()) {
        const node = ch.getTargetNode()?.getName();
        const p = ch.getTargetPath();
        // Rotations drive the pose; only the pelvis keeps its translation (bob, crouch, falls).
        // Scale and every other translation would fight the character's own proportions.
        if (p === 'scale' || (p === 'translation' && node !== 'pelvis')) {
          ch.getSampler()?.dispose();
          ch.dispose();
        }
      }
    }
    for (const m of doc.getRoot().listMeshes()) m.dispose();
    for (const s of doc.getRoot().listSkins()) s.dispose();
    await doc.transform(prune({ keepLeaves: true }));
  }
  const before = new Set(a2.getRoot().listNodes());
  mergeDocuments(a2, a1);
  // One skeleton only: point UAL1's channels at UAL2's bones of the same name, then drop UAL1's
  // copies (duplicate names would be suffixed by the loader and the tracks would bind to nothing).
  const byName = new Map([...before].map((n) => [n.getName(), n]));
  for (const a of a2.getRoot().listAnimations())
    for (const ch of a.listChannels()) {
      const t = ch.getTargetNode();
      if (t && !before.has(t)) {
        const to = byName.get(t.getName());
        if (to) ch.setTargetNode(to);
        else {
          ch.getSampler()?.dispose();
          ch.dispose();
        }
      }
    }
  for (const n of a2.getRoot().listNodes()) if (!before.has(n)) n.dispose();
  for (const s of a2.getRoot().listScenes().slice(1)) s.dispose();
  await a2.transform(
    resample(),
    prune({ keepLeaves: true }),
    unpartition(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    prune({ keepLeaves: true }),
  );
  const names = a2
    .getRoot()
    .listAnimations()
    .map((a) => a.getName());
  const missing = CLIPS.map(([, n]) => n).filter((n) => !names.includes(n));
  if (missing.length) throw new Error(`clips not found: ${missing.join(', ')}`);
  return { doc: a2, report: { clips: names.length } };
}

// ------------------------------------------------------------------ main

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chars-'));
fs.mkdirSync(OUT, { recursive: true });
const report = {};
for (const c of CHARS) {
  for (const byPart of c.heroParts ? [false, true] : [false]) {
    const id = byPart ? `${c.id}Parts` : c.id;
    const { doc, report: r } = await buildChar(c, tmp, byPart);
    const file = path.join(OUT, `${id}.glb`);
    if (!dry) await io.write(file, doc);
    report[id] = { ...r, bytes: dry ? null : fs.statSync(file).size };
    console.log(id, JSON.stringify(report[id]));
  }
}
{
  const { doc, report: r } = await buildAnims();
  const file = path.join(OUT, 'anims.glb');
  if (!dry) await io.write(file, doc);
  report.anims = { ...r, bytes: dry ? null : fs.statSync(file).size };
  console.log('anims', JSON.stringify(report.anims));
}
fs.rmSync(tmp, { recursive: true, force: true });
