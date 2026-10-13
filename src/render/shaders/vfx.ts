/** GLSL for the VFX system. Everything is procedural: no texture files. */

/** Instanced camera-facing particle quads. Define ADDITIVE for additive output. */
export const PARTICLE_VERT = /* glsl */ `
attribute vec4 aPos;   // xyz, size (diameter in tiles)
attribute vec4 aCol;   // rgba
attribute vec2 aMisc;  // rotation, shape
varying vec4 vCol;
varying vec2 vUv;
varying float vShape;
void main() {
  vCol = aCol;
  vShape = aMisc.y;
  vUv = position.xy * 2.0;
  float c = cos(aMisc.x);
  float s = sin(aMisc.x);
  vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  mv.xy += p * aPos.w;
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAG = /* glsl */ `
varying vec4 vCol;
varying vec2 vUv;
varying float vShape;
void main() {
  float r2 = dot(vUv, vUv);
  float a;
  vec3 col = vCol.rgb;
  if (vShape < 0.5) {
    a = pow(max(1.0 - r2, 0.0), 1.6);
  } else if (vShape < 1.5) {
    float m = max(abs(vUv.x), abs(vUv.y));
    a = 1.0 - smoothstep(0.8, 1.0, m);
    col *= 0.75 + 0.25 * vUv.x;
  } else {
    float core = pow(max(1.0 - r2, 0.0), 5.0);
    a = pow(max(1.0 - r2, 0.0), 2.2);
    col = mix(col, vec3(1.0), core);
  }
  a *= vCol.a;
  if (a < 0.003) discard;
#ifdef ADDITIVE
  gl_FragColor = vec4(col * a, a);
#else
  gl_FragColor = vec4(col, a);
#endif
}
`;

/** Instanced flat quads on the ground plane drawing rings / discs / swirls. */
export const GROUND_VERT = /* glsl */ `
attribute vec4 aC;    // center xyz, radius
attribute vec4 aP;    // type, thickness, phase, unused
attribute vec4 aCol;
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vP;
void main() {
  vUv = position.xz * 2.0;
  vCol = aCol;
  vP = aP.xyz;
  vec3 w = aC.xyz + vec3(position.x, 0.0, position.z) * aC.w * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
}
`;

export const GROUND_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vP;
void main() {
  float d = length(vUv);
  float th = max(vP.y, 0.02);
  float ring = exp(-pow((d - (1.0 - th)) / (th * 0.7), 2.0)) * (1.0 - smoothstep(0.96, 1.0, d));
  float disc = 1.0 - smoothstep(0.55, 1.0, d);
  float ang = atan(vUv.y, vUv.x);
  float a;
  float t = vP.x;
  if (t < 0.5) {
    a = ring;
  } else if (t < 1.5) {
    a = disc;
  } else if (t < 2.5) {
    a = disc * (0.45 + 0.55 * sin(ang * 5.0 + d * 9.0 - vP.z * 3.0)) + ring * 0.6;
  } else if (t < 3.5) {
    float dash = smoothstep(0.25, 0.6, 0.5 + 0.5 * sin(ang * 8.0 + vP.z));
    a = ring * dash;
  } else {
    a = disc * 0.35 + ring;
  }
  a *= vCol.a;
  if (a < 0.003) discard;
  vec3 col = mix(vCol.rgb, vec3(1.0), ring * 0.35);
  gl_FragColor = vec4(col * a, a);
}
`;

/** Camera-facing ribbon strips (beams, trails, light pillars). Side expansion happens on the GPU. */
export const RIBBON_VERT = /* glsl */ `
attribute vec3 aTan;
attribute vec3 aInfo;  // side (+-1), width, u
attribute vec4 aCol;
varying vec4 vCol;
varying float vSide;
varying float vU;
void main() {
  vCol = aCol;
  vSide = aInfo.x;
  vU = aInfo.z;
  vec3 viewDir = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 side = cross(aTan, viewDir);
  float l = length(side);
  side = l > 1e-4 ? side / l : vec3(1.0, 0.0, 0.0);
  vec3 w = position + side * (aInfo.x * aInfo.y * 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
}
`;

export const RIBBON_FRAG = /* glsl */ `
varying vec4 vCol;
varying float vSide;
varying float vU;
void main() {
  float e = 1.0 - abs(vSide);
  float a = vCol.a * smoothstep(0.0, 0.55, e);
  if (a < 0.003) discard;
  vec3 col = mix(vCol.rgb, vec3(1.0), pow(e, 3.0) * 0.8);
  gl_FragColor = vec4(col * a, a);
}
`;

/** Post: color grade + vignette. */
export const GRADE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uSat;
uniform float uContrast;
uniform float uVignette;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 col = c.rgb * uTint + uLift;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.18) * uContrast + 0.18;
  vec2 q = vUv - 0.5;
  float v = 1.0 - smoothstep(0.2, 0.85, length(q * vec2(1.0, 0.9)) * 1.25);
  col *= mix(1.0 - uVignette, 1.0, v);
  gl_FragColor = vec4(max(col, 0.0), c.a);
}
`;
