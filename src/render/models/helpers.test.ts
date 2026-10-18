import { describe, expect, it } from 'vitest';
import {
  WEAPON_MODEL_IDS,
  classifyItem,
  classifyModelId,
  computePose,
  isDoubleSaberId,
  isLitesaberId,
  makePose,
  modeLoops,
  normalizeClipName,
  resolveAssetUrl,
  resolveClip,
} from './helpers';

describe('classifyModelId', () => {
  it('classifies prefixes', () => {
    expect(classifyModelId('hero.yediKnight').kind).toBe('hero');
    expect(classifyModelId('mon.battleDroyd').kind).toBe('droyd');
    expect(classifyModelId('mon.sandCrawler').kind).toBe('creature');
    expect(classifyModelId('npc.vendor').kind).toBe('npc');
    expect(classifyModelId('obj.waypoint')).toEqual({ kind: 'object', name: 'waypoint' });
    expect(classifyModelId('item.yellowLitesaber').kind).toBe('item');
    expect(classifyModelId('prop.tree').kind).toBe('prop');
    expect(classifyModelId('zzz').kind).toBe('unknown');
  });
  it('parses tiles', () => {
    const t = classifyModelId('tile.endoor.floor.grass');
    expect(t).toMatchObject({ kind: 'tile', tileset: 'endoor', tileKind: 'floor.grass' });
  });
});

describe('items', () => {
  it('classifies base ids', () => {
    expect(classifyItem('item.litesaber')).toBe('litesaber');
    expect(classifyItem('item.doubleLitesaber')).toBe('litesaber');
    expect(classifyItem('item.blasterPistol')).toBe('blaster');
    expect(classifyItem('item.vibroSword')).toBe('blade');
    expect(classifyItem('item.battleHelm')).toBe('helm');
    expect(classifyItem('item.stimPack')).toBe('potion');
    expect(classifyItem('item.mystery')).toBe('generic');
  });
  it('gives every weapon class a model id that classifies as a held weapon', () => {
    const expected: Record<string, string> = {
      litesaber: 'litesaber',
      doubleLitesaber: 'litesaber',
      blasturPistol: 'blaster',
      blasturRifle: 'rifle',
      forseStaff: 'staff',
      vibroAxe: 'axe',
      shockBaton: 'baton',
      vibroPike: 'spear',
      throwingDisc: 'disc',
      javelin: 'javelin',
      kyburFocus: 'focus',
    };
    for (const wc of Object.keys(expected)) {
      const id = WEAPON_MODEL_IDS[wc];
      expect(id, wc).toBeDefined();
      const name = classifyModelId(id as string).name;
      expect(classifyItem(name), wc).toBe(expected[wc]);
    }
  });
  it('detects litesabers', () => {
    expect(isLitesaberId('item.greenLitesaber')).toBe(true);
    expect(isLitesaberId('item.blaster')).toBe(false);
    expect(isDoubleSaberId('item.doubleLitesaber')).toBe(true);
    expect(isDoubleSaberId('item.litesaber')).toBe(false);
  });
});

describe('resolveClip', () => {
  const names = [
    'Armature|Idle',
    'Armature|Walk',
    'Armature|Run',
    'Armature|Attack',
    'Armature|Death',
    'Hit_React',
  ];
  it('matches common names', () => {
    expect(resolveClip('idle', names)).toBe('Armature|Idle');
    expect(resolveClip('run', names)).toBe('Armature|Run');
    expect(resolveClip('dying', names)).toBe('Armature|Death');
    expect(resolveClip('hit', names)).toBe('Hit_React');
  });
  it('falls back along the chain', () => {
    expect(resolveClip('cast', names)).toBe('Armature|Attack');
    expect(resolveClip('frozen', names)).toBe('Armature|Idle');
    expect(resolveClip('run', ['Idle', 'Walk'])).toBe('Walk');
    expect(resolveClip('dead', ['Idle', 'Walk'])).toBe('Idle');
  });
  it('honours explicit maps and handles empty', () => {
    expect(resolveClip('attack', names, { attack: 'Hit_React' })).toBe('Hit_React');
    expect(resolveClip('attack', names, { attack: 'Missing' })).toBe('Armature|Attack');
    expect(resolveClip('idle', [])).toBeNull();
    expect(resolveClip('attack', ['Foo'])).toBeNull();
  });
  it('normalizes', () => {
    expect(normalizeClipName('CharacterArmature|Idle_2')).toBe('idle');
  });
});

describe('modes', () => {
  it('loops only continuous modes', () => {
    expect(modeLoops('walk')).toBe(true);
    expect(modeLoops('attack')).toBe(false);
    expect(modeLoops('dying')).toBe(false);
  });
  it('computes finite poses for every mode', () => {
    const p = makePose();
    for (const m of [
      'idle',
      'walk',
      'run',
      'attack',
      'cast',
      'throw',
      'hit',
      'block',
      'stunned',
      'frozen',
      'dying',
      'dead',
    ] as const) {
      for (const t of [0, 0.2, 0.5, 5]) {
        computePose(m, t, 1.3, p);
        for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  it('dying sinks and dead is fully down', () => {
    const p = makePose();
    expect(computePose('dying', 0, 1, p).sink).toBe(0);
    expect(computePose('dying', 10, 1, p).sink).toBeCloseTo(0.25);
    expect(computePose('dead', 0, 1, p).sink).toBeCloseTo(0.25);
  });
  it('walk swings legs opposite', () => {
    const p = makePose();
    computePose('walk', 0.1, 1, p);
    expect(p.legR).toBeCloseTo(-p.legL);
  });
});

describe('resolveAssetUrl', () => {
  it('prefixes relative paths', () => {
    expect(resolveAssetUrl('models/x.glb')).toBe('/assets/models/x.glb');
    expect(resolveAssetUrl('assets/models/x.glb')).toBe('/assets/models/x.glb');
    expect(resolveAssetUrl('/assets/x.glb')).toBe('/assets/x.glb');
    expect(resolveAssetUrl('https://a/b.glb')).toBe('https://a/b.glb');
  });
});
