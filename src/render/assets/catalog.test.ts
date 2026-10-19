import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PLACEHOLDER, MODEL_CATALOG, getModelEntry } from './catalog';
import { AUDIO_CATALOG, getAudioEntry, pickVariant } from './audio';
import { DB } from '../../data/db';
import { clipSpec } from '../models/gltfRig';

const ROOT = path.resolve(__dirname, '../../..');
const PUBLIC = path.join(ROOT, 'public');

const REQUIRED_MODELS = [
  'hero.yediKnight',
  'hero.bountyHuntur',
  'hero.forseAdept',
  'mon.scrapDroyd',
  'mon.jawwa',
  'mon.tuskinRaider',
  'mon.normtrooper',
  'mon.probeDroyd',
  'mon.mossBeast',
  'mon.nightsistah',
  'mon.shadowWraith',
  'mon.countDooky',
  'obj.waypoint',
  'obj.chest',
  'obj.stash',
  'obj.portal',
  'obj.shrine',
  ...['forest', 'cave', 'temple', 'town'].flatMap((ts) =>
    ['floor', 'wall', 'water', 'road', 'grass', 'rock'].map((k) => `tile.endoor.${ts}.${k}`),
  ),
];

interface GltfJson {
  nodes: { name?: string }[];
  animations?: { name: string }[];
  accessors: {
    bufferView?: number;
    byteOffset?: number;
    count: number;
    componentType: number;
    type: string;
  }[];
  bufferViews: {
    buffer?: number;
    byteOffset?: number;
    byteLength: number;
    extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset?: number; byteLength: number } };
  }[];
  buffers: { byteLength: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
}

function readGlb(file: string): { json: GltfJson; binLength: number } {
  const b = fs.readFileSync(file);
  expect(b.readUInt32LE(0)).toBe(0x46546c67);
  expect(b.readUInt32LE(8)).toBe(b.length);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8')) as GltfJson;
  const binLength = b.readUInt32LE(20 + jsonLen);
  return { json, binLength };
}

describe('model catalog', () => {
  it('has unique ids', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains every required id', () => {
    const have = new Set(MODEL_CATALOG.map((m) => m.id));
    for (const id of REQUIRED_MODELS) expect(have.has(id), id).toBe(true);
  });

  it('every url exists on disk and is a valid GLB with the mapped clips and bones', () => {
    const cache = new Map<string, ReturnType<typeof readGlb>>();
    for (const m of MODEL_CATALOG) {
      expect(m.scale, m.id).toBeGreaterThan(0);
      expect(m.placeholder.height, m.id).toBeGreaterThan(0);
      if (m.url === null) continue;
      expect(m.url.startsWith('/assets/models/'), m.id).toBe(true);
      const file = path.join(PUBLIC, m.url);
      expect(fs.existsSync(file), `${m.id} -> ${m.url}`).toBe(true);
      if (!cache.has(file)) cache.set(file, readGlb(file));
      const { json } = cache.get(file)!;
      // Clips come from the shared animation library when the entry names one.
      let clipJson = json;
      if (m.anims) {
        const lib = path.join(PUBLIC, m.anims);
        expect(fs.existsSync(lib), `${m.id} anims -> ${m.anims}`).toBe(true);
        if (!cache.has(lib)) cache.set(lib, readGlb(lib));
        clipJson = cache.get(lib)!.json;
      }
      const clipNames = new Set((clipJson.animations ?? []).map((a) => a.name));
      for (const [mode, clip] of Object.entries(m.clips ?? {})) {
        expect(clipNames.has(clipSpec(clip as string).name), `${m.id}: clip ${mode} -> ${clip}`).toBe(true);
      }
      const nodeNames = new Set(json.nodes.map((n) => n.name));
      for (const [slot, bone] of Object.entries(m.bones ?? {})) {
        expect(nodeNames.has(bone), `${m.id}: bone ${slot} -> ${bone}`).toBe(true);
      }
    }
  });

  it('every committed GLB is structurally sound (accessors inside buffer)', () => {
    const dir = path.join(PUBLIC, 'assets/models');
    const files = fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.glb'));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      const { json, binLength } = readGlb(path.join(dir, f));
      expect(json.buffers[0]?.byteLength ?? 0, f).toBeLessThanOrEqual(binLength);
      for (const bv of json.bufferViews) {
        // Meshopt-compressed views decode from their extension's range in the GLB buffer; the view's
        // own buffer is an uncompressed fallback that is never stored.
        const m = bv.extensions?.EXT_meshopt_compression;
        const v = m ?? { ...bv, buffer: bv.buffer ?? 0 };
        if (v.buffer !== 0) continue;
        expect((v.byteOffset ?? 0) + v.byteLength, f).toBeLessThanOrEqual(binLength);
      }
      for (const mesh of json.meshes ?? [])
        // the animation library has no meshes
        for (const p of mesh.primitives) {
          expect(json.accessors[p.attributes.POSITION as number], f).toBeDefined();
          if (p.indices !== undefined) expect(json.accessors[p.indices]?.bufferView, f).toBeDefined();
        }
    }
  });

  it('resolves unknown ids through prefix and keyword fallbacks', () => {
    expect(getModelEntry('mon.somethingNew').id).toBe('mon.somethingNew');
    expect(getModelEntry('mon.somethingNew').url).toBe(getModelEntry('mon.default').url);
    expect(getModelEntry('item.scoutBlastur').url).toBe(getModelEntry('item.blastur').url);
    expect(getModelEntry('item.trainingLitesaber').placeholder.shape).toBe('cylinder');
    expect(getModelEntry('item.baktaStim').url).toBe(getModelEntry('item.stim').url);
    expect(getModelEntry('item.blastur.sniper').url).toContain('sniper');
    expect(getModelEntry('item.zzz').id).toBe('item.zzz');
    expect(getModelEntry('tile.endoor.forest.lava').url).toBe(getModelEntry('tile.endoor.forest.floor').url);
    expect(getModelEntry('weird.thing').placeholder).toEqual(DEFAULT_PLACEHOLDER);
  });
});

describe('audio catalog', () => {
  it('has files on disk for every url, and the ids the audio system looks up', () => {
    for (const e of Object.values(AUDIO_CATALOG)) {
      expect(e.urls.length, e.id).toBeGreaterThan(0);
      for (const u of e.urls) expect(fs.existsSync(path.join(PUBLIC, u)), `${e.id} -> ${u}`).toBe(true);
      for (const v of e.variants ?? []) expect(AUDIO_CATALOG[v], `${e.id} variant ${v}`).toBeDefined();
    }
    for (const id of [
      'death.droyd',
      'death.organic',
      'hit.physical',
      'hit.plasma',
      'hit.cryo',
      'hit.storm',
      'hit.toxin',
      'hit.magic',
      'itemDrop.normal',
      'itemDrop.magic',
      'itemDrop.rare',
      'itemDrop.set',
      'itemDrop.unique',
      'music.town',
      'music.wild',
      'music.dungeon',
      'music.boss',
      'skill.default',
    ])
      expect(getAudioEntry(id), id).toBeDefined();
    expect(AUDIO_CATALOG['music.boss']?.loop).toBe(true);
    expect(pickVariant('sfx.blasturShot', 0.99)?.id).toBe('sfx.blasturShot.3');
  });

  it('stays within the size budgets', () => {
    const size = (d: string) =>
      fs
        .readdirSync(path.join(PUBLIC, d), { recursive: true, encoding: 'utf8' })
        .reduce(
          (a, f) =>
            a +
            (fs.statSync(path.join(PUBLIC, d, f)).isFile() ? fs.statSync(path.join(PUBLIC, d, f)).size : 0),
          0,
        );
    expect(size('assets/audio/sfx')).toBeLessThan(5 * 1024 * 1024);
    expect(size('assets/audio/music')).toBeLessThan(6 * 1024 * 1024);
    expect(size('assets')).toBeLessThan(25 * 1024 * 1024);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')) as {
    assets: { path: string; license: string; source: string; pack: string; author: string }[];
  };

  it('has a license, source, pack and author for every entry, and files exist', () => {
    expect(manifest.assets.length).toBeGreaterThan(0);
    for (const a of manifest.assets) {
      expect(a.license, a.path).toMatch(/^CC0|^CC-BY/);
      expect(a.source, a.path).toBeTruthy();
      expect(a.pack, a.path).toBeTruthy();
      expect(a.author, a.path).toBeTruthy();
      expect(fs.existsSync(path.join(ROOT, a.path)), a.path).toBe(true);
    }
  });

  it('covers every file under public/assets', () => {
    const listed = new Set(manifest.assets.map((a) => a.path));
    const dir = path.join(PUBLIC, 'assets');
    const files = fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => fs.statSync(path.join(dir, f)).isFile());
    for (const f of files) expect(listed.has(`public/assets/${f}`), f).toBe(true);
  });
});

describe('monster gear', () => {
  it('every carried weapon is a real item', () => {
    for (const e of MODEL_CATALOG)
      for (const id of [e.gear?.mainHand, e.gear?.offHand])
        if (id) expect(DB.items.has(id), `${e.id}: ${id}`).toBe(true);
  });

  it('armed monsters carry a weapon', () => {
    // Beasts (claws/quills), probe droids and turrets fight with what they're built with.
    const unarmed = new Set(['mon.probeDroyd', 'mon.mossBeast', 'mon.blasturTurret', 'mon.default']);
    for (const e of MODEL_CATALOG)
      if (e.id.startsWith('mon.') && !unarmed.has(e.id)) expect(e.gear?.mainHand, e.id).toBeTruthy();
  });
});
