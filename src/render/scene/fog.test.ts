import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FOG_MAX, NO_FOG, installWorldFog } from './fog';

describe('world fog', () => {
  it('measures ground distance from the view center and never fully hides the world', () => {
    installWorldFog();
    installWorldFog(); // idempotent
    expect(THREE.ShaderChunk.fog_vertex).toContain('fogCenter');
    expect(THREE.ShaderChunk.fog_vertex).toContain('vFogDepth');
    expect(THREE.ShaderChunk.fog_fragment).toContain(FOG_MAX.toFixed(3));
    expect(FOG_MAX).toBeLessThan(1);
    expect(NO_FOG.near).toBeLessThan(NO_FOG.far);
  });
});
