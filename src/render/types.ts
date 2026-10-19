/**
 * Renderer contracts. render/ reads WorldView + frame events and draws with Three.js.
 * It never mutates the simulation.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { EntityId, Vec2 } from '../core/types';
import type { WorldView } from '../core/sim/world';
import type { GameEvent } from '../core/sim/events';
import type { GeneratedLevel } from '../core/world/types';
import type { ActorMode } from '../core/sim/entities';
import type { BufferGeometry, Material, Object3D } from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface Renderer {
  /** Attach to a canvas; must work on WebGL2 (fallback WebGL1 where possible). */
  init(canvas: HTMLCanvasElement, opts: { quality: QualityLevel }): Promise<void>;
  /** Build static geometry for a level (instanced tiles, props). Called on level change. */
  loadLevel(level: GeneratedLevel, tileset: string): Promise<void>;
  /** Called every animation frame. alpha = sim interpolation factor (0..1). */
  render(view: WorldView, events: readonly GameEvent[], alpha: number, realDt: number): void;
  resize(width: number, height: number, dpr: number): void;
  /** Screen pixel -> sim ground position (tiles). */
  screenToWorld(px: number, py: number): Vec2 | null;
  /** Topmost pickable entity under the screen pixel (monsters, npcs, items, objects). */
  pick(px: number, py: number): EntityId | null;
  /** Sim position -> screen pixel (for DOM overlays: damage numbers, labels, health bars). */
  worldToScreen(p: Vec2, heightTiles?: number): { x: number; y: number } | null;
  setQuality(q: QualityLevel): void;
  setScreenShake(enabled: boolean): void;
  dispose(): void;
}

/**
 * Model registry entry. Every model id used in data/ resolves here. If a real asset is missing,
 * the renderer MUST fall back to a procedural placeholder (colored capsule/box) so the game
 * always runs without downloaded assets.
 */
export interface ModelEntry {
  id: string;
  /** Path under /assets (glb) or null for procedural. */
  url: string | null;
  scale: number;
  /** Clip name mapping: ActorMode/anim key -> clip name in the glb. */
  clips?: Partial<Record<string, string>>;
  /** Bone names for attachments. */
  bones?: { rightHand?: string; leftHand?: string; head?: string };
  /** Placeholder description when url is null or fails to load. */
  placeholder: {
    shape: 'capsule' | 'box' | 'sphere' | 'cone' | 'cylinder';
    color: number;
    height: number;
    radius: number;
  };
  /** Tint/glow color for litesaber blades, droyd eyes, etc. */
  accent?: number;
  /** Palette swaps applied to the model's materials (see toon.recolorMaterial). */
  recolor?: {
    hue: [number, number];
    minSat?: number;
    maxSat?: number;
    minVal?: number;
    flat?: number;
    color: number;
  }[];
  /** Mesh nodes to hide (e.g. a wizard hat). */
  hide?: string[];
  /** Per-bone scale held over the animation (e.g. a stretched droid head), as [x, y, z]. */
  boneScale?: Record<string, [number, number, number]>;
  /** What a monster/NPC carries: an item base id per hand (e.g. a trooper's carbine), blade color. */
  gear?: { mainHand?: string; offHand?: string; accent?: number };
}

/** VFX toolkit keys referenced from SkillDef.vfx / MissileDef.vfx. */
export type VfxPrimitive =
  | 'bolt'
  | 'beam'
  | 'nova'
  | 'aoeZone'
  | 'aura'
  | 'buffGlow'
  | 'saberTrail'
  | 'impact'
  | 'dissolveSmoke'
  | 'dissolveSparks'
  | 'levelUp'
  | 'lootBeam'
  | 'portal';

export interface VfxDef {
  id: string;
  primitive: VfxPrimitive;
  color: number;
  color2?: number;
  size?: number;
  durationSec?: number;
  particles?: number;
}

// ------------------------------------------------------------------ cross-module render contracts

/** A live visual for one entity, produced by render/models. */
/** Armor palette for a body part (see render/models/outfit.ts). */
export interface ArmorLookRef {
  key: string;
  primary: number;
  trim: number;
  glow: number;
}

export interface EntityVisual {
  readonly object: Object3D;
  /** Play the clip for an actor mode; `t` = seconds in mode (for sync), speedMul for IAS/FCR. */
  setMode(mode: ActorMode, t: number, speedMul?: number): void;
  /** Facing angle (sim radians, atan2 convention). */
  setFacing(rad: number): void;
  /** Attach/replace an equipment model at a slot (null = remove). accent = blade/glow color. */
  setAttachment(
    slot: 'mainHand' | 'offHand' | 'head' | 'chest',
    modelId: string | null,
    accent?: number,
  ): void;
  /** Armor look for a body part (glTF heroes only; placeholders ignore it). null = the hero's own. */
  setOutfit?(part: 'head' | 'body' | 'arms' | 'legs', look: ArmorLookRef | null): void;
  /** Hover/target highlight (outline) on/off. */
  setHighlight(on: boolean, color?: number): void;
  /** Tint for champions/uniques/status (frozen blue, toxin green). null = clear. */
  setTint(color: number | null): void;
  update(dt: number): void;
  dispose(): void;
}

/** render/models implements this. */
export interface VisualFactory {
  preload(modelIds: string[]): Promise<void>;
  create(modelId: string): EntityVisual;
  /** Static environment piece (tile/prop) for instancing: returns geometry+material sets. */
  getStaticMesh(modelId: string): { geometry: BufferGeometry; material: Material }[];
}

/** render/vfx implements this. */
export interface VfxSystem {
  readonly root: Object3D;
  /** One-shot effect at a sim position (tiles). */
  spawn(
    vfxId: string,
    pos: Vec2,
    opts?: { radius?: number; dir?: number; durationSec?: number; height?: number },
  ): void;
  /** Persistent effect following an object (missiles, buffs, areas). Returns handle to stop. */
  attach(vfxId: string, target: Object3D, opts?: { radius?: number }): { stop(): void };
  /** Translate frame events into effects (impacts, dissolves, level-up, loot beams). */
  handleEvents(events: readonly GameEvent[], view: WorldView): void;
  update(dt: number): void;
  setQuality(q: QualityLevel): void;
  dispose(): void;
}
