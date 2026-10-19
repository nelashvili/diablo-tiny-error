/**
 * Post-processing: scene + toon outline (OutlineRenderPass) -> UnrealBloom (high threshold, only emissive things glow) ->
 * per-act color grade + vignette -> OutputPass (tone mapping + sRGB) -> SMAA (when there is no MSAA)
 * -> sharpen (when rendering below native resolution).
 * Quality: low = no composer (direct render), medium = half-res bloom + SMAA, high = full-res bloom + MSAA.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { QualityLevel } from '../types';
import { GRADE_FRAG, GRADE_VERT, KUWAHARA_FRAG, SHARPEN_FRAG } from '../shaders/vfx';
import { OutlineRenderPass } from './outlinePass';

export interface PostFx {
  render(dt: number): void;
  resize(w: number, h: number, dpr: number): void;
  setQuality(q: QualityLevel): void;
  /** Per-act color grade key (e.g. 'endoor', 'tatoonie'). */
  setGrade(key: string | null): void;
  /** Grade to ease toward (e.g. a level grade tinted by the time of day). The object is copied. */
  setGradeParams(p: GradeParams): void;
  /** Sharpen strength 0..1 (0 = pass off). Used to restore crispness when the resolution scale drops. */
  setSharpen(amount: number): void;
  dispose(): void;
}

export interface GradeParams {
  tint: [number, number, number];
  lift: [number, number, number];
  sat: number;
  contrast: number;
  vignette: number;
}

export const GRADES: Record<string, GradeParams> = {
  neutral: { tint: [1, 1, 1], lift: [0, 0, 0], sat: 1, contrast: 1, vignette: 0.25 },
  town: { tint: [1.05, 1.0, 0.92], lift: [0.008, 0.004, 0], sat: 1.05, contrast: 1.04, vignette: 0.28 },
  endoor: { tint: [0.9, 1.08, 1.0], lift: [0, 0.008, 0.012], sat: 1.12, contrast: 1.05, vignette: 0.32 },
  tatoonie: { tint: [1.14, 1.0, 0.8], lift: [0.012, 0.004, 0], sat: 1.1, contrast: 1.06, vignette: 0.3 },
  kashyyyyyk: { tint: [0.92, 1.1, 0.88], lift: [0, 0.012, 0], sat: 1.15, contrast: 1.05, vignette: 0.36 },
  deafStar: { tint: [0.88, 0.96, 1.1], lift: [0, 0.004, 0.012], sat: 0.8, contrast: 1.1, vignette: 0.42 },
  // Act I areas (data/environments/act1.ts)
  outpost: { tint: [1.05, 1.02, 0.92], lift: [0.008, 0.006, 0], sat: 1.08, contrast: 1.04, vignette: 0.28 },
  mist: { tint: [0.92, 1.06, 1.02], lift: [0.006, 0.012, 0.014], sat: 1.05, contrast: 1.0, vignette: 0.3 },
  smoke: { tint: [1.02, 0.98, 0.9], lift: [0.01, 0.008, 0.004], sat: 0.9, contrast: 1.04, vignette: 0.34 },
  embers: { tint: [1.08, 0.98, 0.88], lift: [0.008, 0.002, 0], sat: 1.08, contrast: 1.06, vignette: 0.34 },
  gloom: { tint: [0.88, 1.02, 0.96], lift: [0, 0.006, 0.008], sat: 0.95, contrast: 1.08, vignette: 0.4 },
  fog: { tint: [0.9, 1.02, 1.0], lift: [0.012, 0.016, 0.016], sat: 0.92, contrast: 0.96, vignette: 0.34 },
  cave: { tint: [1.0, 0.98, 0.94], lift: [0.006, 0.004, 0.004], sat: 0.9, contrast: 1.04, vignette: 0.36 },
  temple: { tint: [0.94, 0.98, 1.08], lift: [0, 0.004, 0.01], sat: 0.95, contrast: 1.06, vignette: 0.4 },
  crypt: { tint: [0.9, 0.95, 1.1], lift: [0, 0.002, 0.012], sat: 0.85, contrast: 1.1, vignette: 0.45 },
};

export function gradeFor(key: string | null): GradeParams {
  return (key && GRADES[key]) || (GRADES['neutral'] as GradeParams);
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  let quality: QualityLevel = 'high';
  let w = 1;
  let h = 1;
  let dpr = 1;
  const size = new THREE.Vector2();
  renderer.getSize(size);
  w = size.x || 1;
  h = size.y || 1;
  dpr = renderer.getPixelRatio();

  // MSAA lives on the outline pass's scene target; the composer's ping-pong targets don't need it.
  const target = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  const scenePass = new OutlineRenderPass(scene, camera as THREE.OrthographicCamera);
  scenePass.cssWidth = w;
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  composer.addPass(scenePass);

  // Strength/radius kept modest: only sabers, bolts and Forse powers should glow, without a haze.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.35, 0.92);
  const bloomSetSize = bloom.setSize.bind(bloom);
  let bloomDivisor = 1;
  bloom.setSize = (bw: number, bh: number) => bloomSetSize(bw / bloomDivisor, bh / bloomDivisor);

  // Painted look: Kuwahara on the lit image (before grading), radius by quality.
  // `step`: texels between samples (1 = dense kernel).
  const paintStep = new Map<ShaderPass, number>();
  const makePaint = (r: number, step: number) => {
    const p = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / (w * dpr), 1 / (h * dpr)) },
        uMix: { value: 0.75 },
      },
      defines: { KUWAHARA_R: r },
      vertexShader: GRADE_VERT,
      fragmentShader: KUWAHARA_FRAG,
    });
    paintStep.set(p, step);
    return p;
  };
  const paintHigh = makePaint(3, 1);
  const paintMed = makePaint(2, 1);
  composer.addPass(paintHigh);
  composer.addPass(paintMed);
  // Bloom after the paint pass: it reads the actor mask in alpha, which bloom's additive blend breaks.
  composer.addPass(bloom);

  const cur: GradeParams = structuredClone(gradeFor(null));
  let tgt: GradeParams = cur;
  const custom: GradeParams = structuredClone(cur);
  const gradePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uVignette: { value: 0.25 },
    },
    vertexShader: GRADE_VERT,
    fragmentShader: GRADE_FRAG,
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
  // SMAA runs on the final sRGB image (where edge detection works best) whenever MSAA is off.
  const smaa = new SMAAPass();
  composer.addPass(smaa);
  const sharpen = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2(1 / (w * dpr), 1 / (h * dpr)) },
      uAmount: { value: 0 },
    },
    vertexShader: GRADE_VERT,
    fragmentShader: SHARPEN_FRAG,
  });
  sharpen.enabled = false;
  composer.addPass(sharpen);
  const setTexel = () => {
    for (const p of [sharpen, paintHigh, paintMed]) {
      const k = paintStep.get(p) ?? 1;
      (p.uniforms['uTexel']!.value as THREE.Vector2).set(k / Math.max(1, w * dpr), k / Math.max(1, h * dpr));
    }
  };

  setTexel();

  function applyUniforms(): void {
    const u = gradePass.uniforms as Record<string, { value: unknown }>;
    (u['uTint']!.value as THREE.Vector3).set(cur.tint[0], cur.tint[1], cur.tint[2]);
    (u['uLift']!.value as THREE.Vector3).set(cur.lift[0], cur.lift[1], cur.lift[2]);
    u['uSat']!.value = cur.sat;
    u['uContrast']!.value = cur.contrast;
    u['uVignette']!.value = cur.vignette;
  }
  applyUniforms();

  function applyQuality(): void {
    bloom.enabled = quality !== 'low';
    bloomDivisor = quality === 'medium' ? 2 : 1;
    scenePass.samples = quality === 'high' ? 4 : 0;
    smaa.enabled = quality !== 'high';
    paintHigh.enabled = quality === 'high';
    paintMed.enabled = quality === 'medium';
    composer.setSize(w, h);
  }
  applyQuality();

  const lerpStep = (a: number, b: number, k: number): number => a + (b - a) * k;

  return {
    render(dt: number): void {
      if (quality === 'low') {
        renderer.render(scene, camera);
        return;
      }
      if (tgt !== cur) {
        const k = Math.min(1, dt * 2.5);
        for (let i = 0; i < 3; i++) {
          cur.tint[i] = lerpStep(cur.tint[i]!, tgt.tint[i]!, k);
          cur.lift[i] = lerpStep(cur.lift[i]!, tgt.lift[i]!, k);
        }
        cur.sat = lerpStep(cur.sat, tgt.sat, k);
        cur.contrast = lerpStep(cur.contrast, tgt.contrast, k);
        cur.vignette = lerpStep(cur.vignette, tgt.vignette, k);
        applyUniforms();
      }
      composer.render(dt);
    },
    resize(nw: number, nh: number, ndpr: number): void {
      w = nw;
      h = nh;
      dpr = ndpr;
      scenePass.cssWidth = w;
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      setTexel();
    },
    setQuality(q: QualityLevel): void {
      if (q === quality) return;
      quality = q;
      applyQuality();
    },
    setGrade(key: string | null): void {
      tgt = gradeFor(key);
    },
    setGradeParams(p: GradeParams): void {
      for (let i = 0; i < 3; i++) {
        custom.tint[i] = p.tint[i]!;
        custom.lift[i] = p.lift[i]!;
      }
      custom.sat = p.sat;
      custom.contrast = p.contrast;
      custom.vignette = p.vignette;
      tgt = custom;
    },
    setSharpen(amount: number): void {
      sharpen.enabled = amount > 0;
      sharpen.uniforms['uAmount']!.value = Math.min(1, Math.max(0, amount));
    },
    dispose(): void {
      composer.dispose();
      scenePass.dispose();
      smaa.dispose();
      target.dispose();
      bloom.dispose();
    },
  };
}
