import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { enableRim, getGradientMap, recolorMaterial, variantMaterial } from './toon';

describe('toon shading', () => {
  it('uses a 3-band ramp with a light shadow band', () => {
    const data = getGradientMap().image.data as Uint8Array;
    expect([...data]).toEqual([110, 185, 255]);
  });

  it('patches the toon shader with the rim light behind a define', () => {
    expect(THREE.ShaderLib['toon']!.fragmentShader).toContain('#ifdef USE_RIM');
  });

  it('enableRim marks toon materials once and keeps other defines', () => {
    const m = new THREE.MeshToonMaterial();
    m.defines = { FOO: '1' };
    const v = m.version;
    enableRim(m);
    expect(m.defines).toEqual({ FOO: '1', USE_RIM: '' });
    expect(m.version).toBe(v + 1);
    enableRim(m);
    expect(m.version).toBe(v + 1);
    const basic = new THREE.MeshBasicMaterial();
    enableRim(basic);
    expect(basic.defines ?? {}).not.toHaveProperty('USE_RIM');
  });

  it('tint and recolor variants keep the rim light (toon copy() would reset defines)', () => {
    const m = new THREE.MeshToonMaterial({ color: 0x808080 });
    enableRim(m);
    expect((variantMaterial(m, 0xff0000, null) as THREE.MeshToonMaterial).defines).toHaveProperty('USE_RIM');
    const r = recolorMaterial(m, [{ hue: [0, 360], color: 0x00ff00 }], 'rimtest');
    expect((r as THREE.MeshToonMaterial).defines).toHaveProperty('USE_RIM');
  });
});
