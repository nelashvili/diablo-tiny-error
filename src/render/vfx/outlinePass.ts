/**
 * Scene render + toon outline in one composer pass: renders the scene into its own target (with a
 * depth texture and optional MSAA), then copies it out darkening pixels where the depth jumps by more
 * than a world-space threshold — silhouettes of characters, props and wall tops against what's behind.
 * Flat or gently sloped ground has no jumps, so terrain stays clean. No extra draw calls.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const OUTLINE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uRange;      // camera far - near (ortho depth is linear)
uniform float uThreshold;  // world units of depth jump that count as an edge
uniform float uStrength;
uniform vec3 uColor;
varying vec2 vUv;
float d(vec2 o) { return texture2D(tDepth, vUv + o * uTexel).x * uRange; }
void main() {
  vec4 c = texture2D(tColor, vUv);
  float z = d(vec2(0.0));
  // Only the far side of a jump draws the line, so it hugs the nearer object's silhouette.
  float e = max(max(z - d(vec2(1.0, 0.0)), z - d(vec2(-1.0, 0.0))), max(z - d(vec2(0.0, 1.0)), z - d(vec2(0.0, -1.0))));
  float edge = smoothstep(uThreshold, uThreshold * 2.0, e) * uStrength;
  gl_FragColor = vec4(mix(c.rgb, uColor * c.rgb, edge), c.a);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export class OutlineRenderPass extends Pass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
  ) {
    super();
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uRange: { value: 100 },
        uThreshold: { value: 0.25 },
        uStrength: { value: 0.95 },
        uColor: { value: new THREE.Color(0.08, 0.07, 0.1) },
      },
      vertexShader: VERT,
      fragmentShader: OUTLINE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** MSAA sample count of the scene target (0 = off). */
  set samples(n: number) {
    if (this.target.samples === n) return;
    this.target.samples = n;
    this.target.dispose();
  }

  /** Outline strength 0..1 (0 skips the edge test). */
  set strength(v: number) {
    this.material.uniforms['uStrength']!.value = v;
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    // Line width ~1 CSS px at any pixel ratio: sample neighbours that far apart.
    const dpr = Math.max(1, width / Math.max(1, this.cssWidth));
    (this.material.uniforms['uTexel']!.value as THREE.Vector2).set(dpr / width, dpr / height);
  }

  /** CSS width of the canvas, to keep the outline ~1 CSS px wide on high-DPI screens. */
  cssWidth = 1;

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    const c = this.camera;
    this.material.uniforms['uRange']!.value = c.far - c.near;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, c);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
