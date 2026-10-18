/**
 * Three.js renderer: isometric ortho camera, chunked instanced map, entity visuals, lighting,
 * picking. Reads WorldView only. Construct with createRenderer(), then init() with a canvas.
 */
import * as THREE from 'three';
import type { EntityId, Vec2 } from '../core/types';
import type { WorldView } from '../core/sim/world';
import type { GameEvent } from '../core/sim/events';
import type { GeneratedLevel } from '../core/world/types';
import type { QualityLevel, Renderer, VfxSystem, VisualFactory } from './types';
import { createVisualFactory } from './models';
import { createVfxSystem } from './vfx';
import { createPostFx, type PostFx } from './vfx/post';
import { DB } from '../data/db';
import { IsoCamera } from './camera/isoCamera';
import { buildMap, type MapRenderer } from './map/mapRenderer';
import { SceneLighting, presetFor } from './scene/lighting';
import { EntitySync } from './scene/entitySync';
import { AdaptiveScale } from './scene/adaptiveScale';
import { StatsOverlay, type RenderStats } from './scene/statsOverlay';
import { makeRect, type GroundRect } from './culling/viewRect';

export const DPR_CAP: Record<QualityLevel, number> = { low: 1, medium: 1.5, high: 2 };

export type PostFactory = (r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.Camera) => PostFx;

export interface RendererDeps {
  visuals?: VisualFactory;
  vfx?: VfxSystem;
  post?: PostFactory;
}

/** Renderer plus the extra controls the game shell needs (additive to the frozen contract). */
export interface RenderController extends Renderer {
  /** Zoom preset 0 (close) or 1 (far). */
  setZoom(level: number): void;
  getZoom(): number;
  /** Entity under the cursor: gets the hover outline. */
  setHovered(id: EntityId | null): void;
  /** Use larger pick radii (touch input). */
  setTouchMode(on: boolean): void;
  /** Add camera shake manually (0..1). */
  shake(amount: number): void;
  /** Toggle the D2-style wall cutaway near the player. */
  setWallCutaway(on: boolean): void;
  getStats(): RenderStats;
}

export function createRenderer(deps: RendererDeps = {}): RenderController {
  const visuals = deps.visuals ?? createVisualFactory();
  const vfx = deps.vfx ?? createVfxSystem();
  const postFactory = deps.post ?? createPostFx;

  const scene = new THREE.Scene();
  const iso = new IsoCamera();
  const lighting = new SceneLighting();
  const entityRoot = new THREE.Group();
  entityRoot.name = 'entities';
  const sync = new EntitySync(entityRoot, visuals, vfx);
  scene.add(lighting.group, entityRoot, vfx.root);

  let gl: THREE.WebGLRenderer | null = null;
  let post: PostFx | null = null;
  let quality: QualityLevel = 'medium';
  let map: MapRenderer | null = null;
  let stats: StatsOverlay | null = null;
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let touch = false;
  let wallCutaway = true;
  let snapCamera = true;
  let shakeEnabled = true;
  const adaptive = new AdaptiveScale();
  const rect: GroundRect = makeRect();
  const bigRect = (): void => {
    rect.minX = rect.minZ = -1e9;
    rect.maxX = rect.maxZ = 1e9;
  };
  bigRect();
  const lp = { x: 0, z: 0 };
  const gnd = { x: 0, z: 0 };
  const scr = { x: 0, y: 0 };
  const frameStats: RenderStats = {
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    entities: 0,
    entitiesDrawn: 0,
    mapBatches: 0,
    resolutionScale: 1,
  };

  scene.background = new THREE.Color(0x0b0d17);

  const applyPixelRatio = (): void => {
    if (!gl) return;
    const pr = Math.max(0.5, Math.min(dpr, DPR_CAP[quality]) * adaptive.scale);
    gl.setPixelRatio(pr);
    gl.setSize(cssW, cssH, false);
    post?.resize(cssW, cssH, pr);
  };

  const collectStats = (): RenderStats => {
    frameStats.drawCalls = gl?.info.render.calls ?? 0;
    frameStats.triangles = gl?.info.render.triangles ?? 0;
    frameStats.geometries = gl?.info.memory.geometries ?? 0;
    frameStats.textures = gl?.info.memory.textures ?? 0;
    frameStats.entities = sync.count;
    frameStats.entitiesDrawn = sync.drawn;
    frameStats.mapBatches = map?.batchCount ?? 0;
    frameStats.resolutionScale = adaptive.scale;
    return frameStats;
  };

  const scanEvents = (events: readonly GameEvent[], view: WorldView): void => {
    const local = view.localPlayerId;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      if (e.type === 'bossIntro') iso.shake.add(0.55);
      else if (e.type === 'attackResult') {
        if (e.outcome === 'hit') sync.onHit(e.targetId, e.attackerId, false);
      } else if (e.type === 'damage') {
        if (e.crit) sync.onHit(e.targetId, e.sourceId, true);
        if (e.targetId === local) {
          const p = view.get(local ?? -1);
          const max = p && 'stats' in p ? p.stats.lifeMax : 0;
          if (max > 0 && e.amount >= max * 0.2) iso.shake.add(Math.min(0.6, (e.amount / max) * 1.2));
        } else if (e.sourceId === local && e.crit) iso.shake.add(0.1);
      } else if (e.type === 'death') {
        const m = view.get(e.id);
        if (m && m.kind === 'monster' && m.rank === 'boss') iso.shake.add(0.5);
      }
    }
  };

  const api: RenderController = {
    async init(cv, opts) {
      quality = opts.quality;
      gl = new THREE.WebGLRenderer({
        canvas: cv,
        antialias: quality !== 'low',
        powerPreference: 'high-performance',
      });
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.0;
      gl.shadowMap.type = THREE.PCFShadowMap;
      gl.shadowMap.autoUpdate = true;
      touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      post = postFactory(gl, scene, iso.camera);
      dpr = window.devicePixelRatio || 1;
      cssW = cv.clientWidth || cv.width || 1;
      cssH = cv.clientHeight || cv.height || 1;
      iso.resize(cssW, cssH);
      api.setQuality(quality);
      if (import.meta.env.DEV && cv.parentElement) stats = new StatsOverlay(cv.parentElement);
    },

    async loadLevel(level: GeneratedLevel, tileset: string) {
      sync.clear();
      map?.dispose();
      map = null;
      const ids = new Set<string>();
      for (const p of level.placements) {
        if (p.kind === 'prop' && p.ref) ids.add(p.ref.startsWith('prop.') ? p.ref : `prop.${p.ref}`);
      }
      const kinds = new Set<string>(level.map.kinds);
      for (const k of kinds) if (k !== 'void') ids.add(`tile.${tileset}.${k}`);
      await visuals.preload([...ids]);
      const b = iso.basis.toCam;
      map = buildMap(level, tileset, visuals, {
        quality,
        toCamX: b.x,
        toCamZ: b.z,
        maxLights: 8,
      });
      map.setWallCutaway(wallCutaway);
      scene.add(map.group);
      lighting.setMapLights(map.lights);
      const preset = presetFor(tileset);
      lighting.apply(preset);
      (scene.background as THREE.Color).setHex(preset.bg);
      post?.setGrade(DB.levels.get(level.levelId)?.ambientLight ?? tileset);
      snapCamera = true;
      bigRect();
    },

    render(view, events, alpha, realDt) {
      if (!gl || !post) return;
      const dt = Math.min(Math.max(realDt, 0), 0.1);
      sync.sync(view, alpha, dt, rect);
      const lid = view.localPlayerId;
      const hasLocal = lid !== null && sync.positionOf(lid, lp);
      if (!hasLocal) {
        lp.x = iso.target.x;
        lp.z = iso.target.z;
      }
      if (snapCamera && hasLocal) {
        iso.snapTo(lp.x, lp.z);
        snapCamera = false;
      }
      iso.update(lp.x, lp.z, dt);
      iso.groundBounds(3.5, rect);
      lighting.follow(iso.target.x, iso.target.z, lp.x, lp.z, dt);
      map?.setFocus(lp.x, lp.z);

      scanEvents(events, view);
      vfx.handleEvents(events, view);
      vfx.update(dt);

      post.render(dt);

      if (adaptive.update(dt * 1000)) applyPixelRatio();
      stats?.update(dt, collectStats);
    },

    resize(width, height, ratio) {
      cssW = Math.max(1, width);
      cssH = Math.max(1, height);
      dpr = ratio || 1;
      iso.resize(cssW, cssH);
      applyPixelRatio();
    },

    screenToWorld(px, py): Vec2 | null {
      if (!iso.screenToGround(px, py, gnd)) return null;
      return { x: gnd.x, y: gnd.z };
    },

    pick(px, py) {
      return sync.pick(px, py, iso, touch);
    },

    worldToScreen(p, heightTiles = 0) {
      if (!iso.worldToScreen(p.x, heightTiles, p.y, scr)) return null;
      return { x: scr.x, y: scr.y };
    },

    setQuality(q) {
      quality = q;
      if (gl) {
        lighting.setQuality(q);
        gl.shadowMap.enabled = lighting.shadowsEnabled;
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
          else if (m) m.needsUpdate = true;
        });
      }
      applyPixelRatio();
      post?.setQuality(q);
      vfx.setQuality(q);
    },

    setScreenShake(enabled) {
      shakeEnabled = enabled;
      iso.shake.setEnabled(enabled);
    },

    setZoom(level) {
      iso.setZoom(level);
    },
    getZoom() {
      return iso.getZoom();
    },
    setHovered(id) {
      sync.hovered = id;
    },
    setTouchMode(on) {
      touch = on;
    },
    shake(amount) {
      if (shakeEnabled) iso.shake.add(amount);
    },
    setWallCutaway(on) {
      wallCutaway = on;
      map?.setWallCutaway(on);
    },
    getStats() {
      return collectStats();
    },

    dispose() {
      stats?.dispose();
      stats = null;
      sync.dispose();
      map?.dispose();
      map = null;
      vfx.dispose();
      lighting.dispose();
      post?.dispose();
      post = null;
      gl?.dispose();
      gl = null;
    },
  };
  return api;
}
