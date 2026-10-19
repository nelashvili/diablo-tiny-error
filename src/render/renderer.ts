/**
 * Three.js renderer: isometric ortho camera, chunked instanced map, entity visuals, lighting,
 * picking. Reads WorldView only. Construct with createRenderer(), then init() with a canvas.
 */
import * as THREE from 'three';
import type { EntityId, Vec2 } from '../core/types';
import type { WorldView } from '../core/sim/world';
import type { GameEvent } from '../core/sim/events';
import type { GeneratedLevel, TileKind } from '../core/world/types';
import type { QualityLevel, Renderer, VfxSystem, VisualFactory } from './types';
import { createVisualFactory } from './models';
import { createVfxSystem } from './vfx';
import { createPostFx, type PostFx } from './vfx/post';
import { DB } from '../data/db';
import { IsoCamera } from './camera/isoCamera';
import { buildMap, type MapRenderer } from './map/mapRenderer';
import { dressingFor, propVariants, scatterFor } from './map/dressing';
import { SceneLighting, SUN_DIR, presetFor } from './scene/lighting';
import { EnvironmentClock, keyLightDir, parseTimeParam } from './scene/environment';
import { NO_FOG, installWorldFog } from './scene/fog';
import { WeatherFx } from './scene/weather';
import { applyWeather, parseWeatherParam, weatherAt, type WeatherState } from './scene/weatherState';
import type { WeatherKind } from '../data/schema';
import { EntitySync } from './scene/entitySync';
import { AdaptiveScale } from './scene/adaptiveScale';
import { StatsOverlay, type RenderStats } from './scene/statsOverlay';
import { makeRect, type GroundRect } from './culling/viewRect';
import { setTerrainAnisotropy } from './terrain/terrain';

const SABER_SPARKS = 'vfx.saber.sparks';
const SABER_CLASSES = new Set(['litesaber', 'doubleLitesaber']);

/** Is the attacker swinging a litesaber? (its hits throw sparks) */
function wieldsSaber(view: WorldView, id: EntityId): boolean {
  const e = view.get(id);
  const base = e && 'equipment' in e ? e.equipment.mainHand?.base : undefined;
  const wc = base ? DB.items.get(base)?.weaponClass : undefined;
  return wc !== undefined && SABER_CLASSES.has(wc);
}

const SABER_SWING = 'vfx.saber.attack';

/** Melee attacks with a litesaber leave a glowing arc in front of the wielder (both ends for doubles). */
function saberSwingArcs(
  view: WorldView,
  casterId: EntityId,
  skillId: string,
  targetPos: { x: number; y: number } | undefined,
): { pos: { x: number; y: number }; dir: number }[] {
  if (DB.skills.get(skillId)?.kind !== 'meleeAttack' || !wieldsSaber(view, casterId)) return [];
  const e = view.get(casterId);
  if (!e) return [];
  const dir =
    targetPos && Math.hypot(targetPos.x - e.pos.x, targetPos.y - e.pos.y) > 0.05
      ? Math.atan2(targetPos.y - e.pos.y, targetPos.x - e.pos.x)
      : 'facing' in e && typeof e.facing === 'number'
        ? e.facing
        : 0;
  const base = 'equipment' in e ? e.equipment.mainHand?.base : undefined;
  const double = base ? DB.items.get(base)?.weaponClass === 'doubleLitesaber' : false;
  return double
    ? [
        { pos: e.pos, dir },
        { pos: e.pos, dir: dir + Math.PI },
      ]
    : [{ pos: e.pos, dir }];
}

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
  /** Play-time clock (seconds) that drives the day/night cycle. */
  setClock(seconds: number): void;
  /** Toggle the D2-style wall cutaway near the player. */
  setWallCutaway(on: boolean): void;
  getStats(): RenderStats;
}

export function createRenderer(deps: RendererDeps = {}): RenderController {
  const visuals = deps.visuals ?? createVisualFactory();
  const vfx = deps.vfx ?? createVfxSystem();
  const postFactory = deps.post ?? createPostFx;

  installWorldFog();
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0x000000, NO_FOG.near, NO_FOG.far);
  scene.fog = fog;
  const iso = new IsoCamera();
  const lighting = new SceneLighting();
  const env = new EnvironmentClock();
  const keyDir = new THREE.Vector3();
  let clock = 0;
  const weather = new WeatherFx();
  const weatherState: WeatherState = { kind: 'clear', intensity: 0, flash: 0 };
  let pinnedWeather: WeatherKind | null = null;
  const entityRoot = new THREE.Group();
  entityRoot.name = 'entities';
  const sync = new EntitySync(entityRoot, visuals, vfx);
  scene.add(lighting.group, entityRoot, vfx.root, weather.group);

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
  const viewCorners = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
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
    // Below native resolution, sharpen to win back crispness lost to upscaling.
    post?.setSharpen(adaptive.scale < 1 ? (1 - adaptive.scale) * 2.5 : 0);
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

  const saberSwing = (
    view: WorldView,
    casterId: EntityId,
    skillId: string,
    targetPos: { x: number; y: number } | undefined,
  ): void => {
    for (const arc of saberSwingArcs(view, casterId, skillId, targetPos))
      vfx.spawn(SABER_SWING, arc.pos, { dir: arc.dir, radius: 1.05, height: 0.85 });
  };

  const scanEvents = (events: readonly GameEvent[], view: WorldView): void => {
    const local = view.localPlayerId;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      if (e.type === 'bossIntro') iso.shake.add(0.55);
      else if (e.type === 'skillCast') saberSwing(view, e.casterId, e.skillId, e.targetPos);
      else if (e.type === 'attackResult') {
        if (e.outcome === 'hit') {
          sync.onHit(e.targetId, e.attackerId, false);
          const target = view.get(e.targetId);
          if (target && wieldsSaber(view, e.attackerId))
            vfx.spawn(SABER_SPARKS, target.pos, { height: 0.9, radius: 1 });
        }
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

  /** Light the scene for the current time of day and weather. False when the level has no EnvDef. */
  const applyEnvironment = (): boolean => {
    const fr = env.eval(clock);
    if (!fr) {
      weather.update(weatherAt(null, clock, null, weatherState), 0, 0, clock);
      return false;
    }
    weatherAt(env.def, clock, pinnedWeather, weatherState);
    applyWeather(fr.light, fr.grade, weatherState);
    weather.update(weatherState, iso.target.x, iso.target.z, clock);
    lighting.apply(fr.light);
    lighting.setKeyDir(keyLightDir(fr.f, SUN_DIR, keyDir));
    (scene.background as THREE.Color).setHex(fr.light.bg);
    const f = fr.light.fog;
    fog.color.setHex(f?.color ?? fr.light.bg);
    fog.near = f?.near ?? NO_FOG.near;
    fog.far = f?.far ?? NO_FOG.far;
    post?.setGradeParams(fr.grade);
    return true;
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
      // Neutral keeps the toon palette saturated (ACES desaturated and darkened it) while still
      // rolling off bright glows.
      gl.toneMapping = THREE.NeutralToneMapping;
      gl.toneMappingExposure = 1.0;
      gl.shadowMap.type = THREE.PCFShadowMap;
      gl.shadowMap.autoUpdate = true;
      // Count every pass of a frame (the composer renders several), reset once per frame in render().
      gl.info.autoReset = false;
      setTerrainAnisotropy(gl.capabilities.getMaxAnisotropy());
      touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      post = postFactory(gl, scene, iso.camera);
      dpr = window.devicePixelRatio || 1;
      cssW = cv.clientWidth || cv.width || 1;
      cssH = cv.clientHeight || cv.height || 1;
      iso.resize(cssW, cssH);
      api.setQuality(quality);
      // Debug: ?time=night|dawn|dusk|day|<0..1> pins the time of day; ?daylen=<s> speeds the cycle up.
      if (typeof location !== 'undefined') {
        const q = new URLSearchParams(location.search);
        env.pinned = parseTimeParam(q.get('time'));
        const len = Number(q.get('daylen'));
        if (len > 0) env.dayLength = len;
        pinnedWeather = parseWeatherParam(q.get('weather'));
      }
      if (import.meta.env.DEV && cv.parentElement) stats = new StatsOverlay(cv.parentElement);
    },

    async loadLevel(level: GeneratedLevel, tileset: string) {
      sync.clear();
      map?.dispose();
      map = null;
      const ids = new Set<string>();
      for (const p of level.placements) {
        if (p.kind === 'prop' && p.ref)
          for (const v of propVariants(p.ref.startsWith('prop.') ? p.ref : `prop.${p.ref}`)) ids.add(v);
      }
      const kinds = new Set<string>(level.map.kinds);
      for (const k of kinds) {
        if (k === 'void') continue;
        ids.add(`tile.${tileset}.${k}`);
        for (const v of dressingFor(tileset, k as TileKind)?.props ?? []) ids.add(v);
        for (const v of scatterFor(tileset, k as TileKind)?.props ?? []) ids.add(v);
      }
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
      const envId = DB.levels.get(level.levelId)?.ambientLight;
      env.setEnv((envId && DB.environments.get(envId)) || null, envId ?? tileset);
      if (!applyEnvironment()) {
        const preset = presetFor(tileset);
        lighting.apply(preset);
        lighting.setKeyDir(SUN_DIR);
        (scene.background as THREE.Color).setHex(preset.bg);
        fog.near = NO_FOG.near;
        fog.far = NO_FOG.far;
        post?.setGrade(envId ?? tileset);
      }
      snapCamera = true;
      bigRect();
    },

    render(view, events, alpha, realDt) {
      if (!gl || !post) return;
      gl.info.reset();
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
      if (env.def) applyEnvironment();
      iso.groundBounds(3.5, rect);
      lighting.follow(iso.target.x, iso.target.z, lp.x, lp.z, dt);
      iso.groundCorners(2, viewCorners);
      lighting.fitShadow(viewCorners);
      map?.setFocus(lp.x, lp.z);
      map?.update(dt);

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
      weather.setQuality(q);
    },

    setScreenShake(enabled) {
      shakeEnabled = enabled;
      iso.shake.setEnabled(enabled);
    },

    setClock(seconds) {
      clock = seconds;
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
      weather.dispose();
      post?.dispose();
      post = null;
      gl?.dispose();
      gl = null;
    },
  };
  return api;
}
