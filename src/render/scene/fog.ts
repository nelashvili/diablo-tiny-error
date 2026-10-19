/**
 * World fog: three's fog chunks patched so fog grows with ground distance from the view center (the
 * hero, whom the camera follows) instead of camera depth, which is nearly constant for the iso camera.
 * Every material with `fog: true` picks it up; scene.fog (a THREE.Fog) supplies color and near/far radii.
 */
import * as THREE from 'three';

/** Fog never fully hides the world: the far edge keeps this much of the lit color. */
export const FOG_MAX = 0.88;

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  // World position from view space (the view matrix is rigid: world = R^T (mv - t)).
  vec3 fogWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
  // Ground point under the screen center: the camera ray hits y = 0.
  vec3 fogFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 fogCenter = cameraPosition + fogFwd * (-cameraPosition.y / min(fogFwd.y, -1e-3));
  vFogDepth = length(fogWorld.xz - fogCenter.xz);
#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * ${FOG_MAX.toFixed(3)} );
#endif
`;

let installed = false;

/** Patch the fog chunks. Call once before any material compiles. */
export function installWorldFog(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_vertex = FOG_VERTEX;
  THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT;
}

/** "No fog" radii, used when an environment doesn't set any. */
export const NO_FOG = { near: 60, far: 120 } as const;
