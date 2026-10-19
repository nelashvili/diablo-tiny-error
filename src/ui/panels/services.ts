/**
 * Everything the panels need besides the UiApi: pluggable lookups (defaults read the real DB and
 * core helpers) and optional data sources for state that does not live on entities (stash,
 * vendor stock, quest/waypoint progress, dialogue). Integration supplies `data`; the dev harness
 * also overrides `services` with mocks.
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { DB } from '../../data/db';
import { describeItem } from '../../core/items/describe';
import { itemSize } from '../../core/items/grid';
import type { ItemDescription } from '../../core/items/describe';
import type { Equipment, GridContainer, ItemInstance } from '../../core/items/types';
import type { ActId, ClassId, DefId, EntityId, ItemQuality } from '../../core/types';
import type { ClassDef, ItemBaseDef, SkillDef } from '../../data/schema';

export interface PanelServices {
  itemSize(item: ItemInstance): { w: number; h: number };
  describeItem(item: ItemInstance): ItemDescription;
  itemBase(baseId: DefId): ItemBaseDef | undefined;
  classDef(id: ClassId): ClassDef | undefined;
  skillsForClass(id: ClassId): SkillDef[];
  /** Total XP needed to reach `level` (core/player owns the real table). */
  xpForLevel?(level: number): number;
  /** Vendor price for buying an item from a vendor / selling one to it. */
  price(item: ItemInstance, mode: 'buy' | 'sell'): number;
  /** Rendered item art (image URL), or null to use the SVG glyph; `onReady` fires once it exists. */
  itemIcon?(baseId: DefId, onReady: () => void): string | null;
  /** Speak these lines aloud (recorded voices), replacing any current speech; [] stops it. */
  speak?(lineKeys: readonly string[]): void;
}

const QUALITY_PRICE: Record<ItemQuality, number> = {
  inferior: 0.5,
  normal: 1,
  magic: 3,
  rare: 6,
  set: 8,
  unique: 10,
  crafted: 8,
};

export function fallbackPrice(base: ItemBaseDef | undefined, item: ItemInstance, mode: 'buy' | 'sell') {
  const cost = base?.cost ?? 10;
  const buy = Math.max(1, Math.round(cost * QUALITY_PRICE[item.quality] * (1 + item.ilvl / 25)));
  return mode === 'buy' ? buy * Math.max(1, item.quantity ?? 1) : Math.max(1, Math.floor(buy / 4));
}

export const defaultServices: PanelServices = {
  itemSize: (item) => {
    const base = DB.items.get(item.base);
    return base ? base.size : itemSize(item);
  },
  describeItem,
  itemBase: (id) => DB.items.get(id),
  classDef: (id) => DB.classes.get(id),
  skillsForClass: (id) => [...DB.skills.values()].filter((s) => s.classId === id),
  price: (item, mode) => fallbackPrice(DB.items.get(item.base), item, mode),
};

// ------------------------------------------------------------------ data sources (integration)

export interface StashView {
  personal: GridContainer;
  shared: GridContainer[];
}

export interface VendorView {
  npcId: EntityId;
  nameKey: string;
  stock: GridContainer;
  /** Cost to repair everything; 0/undefined hides the button. */
  repairCost?: number;
}

export interface WaypointView {
  currentLevelId?: DefId;
  acts: { act: ActId; unlocked: boolean; levels: { id: DefId; nameKey: string; unlocked: boolean }[] }[];
}

export type QuestState = 'notStarted' | 'active' | 'done' | 'rewardReady';

export interface QuestLogView {
  currentAct: ActId;
  acts: {
    act: ActId;
    unlocked: boolean;
    quests: { id: DefId; nameKey: string; state: QuestState; descKey?: string; stepKey?: string }[];
  }[];
}

export interface DialogueView {
  npcId: EntityId;
  nameKey: string;
  /** Short role line under the name ("Field medic"). */
  roleKey?: string;
  /** Optional portrait image URL; a stylized placeholder is drawn otherwise. */
  portrait?: string;
  lines: string[];
  options: { id: string; labelKey: string }[];
  /** "Ask about..." topics: a button label and the lines answered with. */
  topics?: { labelKey: string; lines: string[] }[];
}

/** Holocron (lore) entries of the current act, in reading order. */
export interface LoreView {
  entries: { id: DefId; titleKey: string; textKey: string; unlocked: boolean }[];
}

export interface MercView {
  name: string;
  typeKey: string;
  level: number;
  life: number;
  lifeMax: number;
  alive: boolean;
  equipment: Equipment;
  /** Extra stat lines (already translated label → value). */
  stats?: { label: string; value: string }[];
  resurrectCost?: number;
}

/** Getters are called during render (each frame while panels are open); keep them cheap. */
export interface PanelDataSource {
  stash?(): StashView | null;
  cube?(): GridContainer | null;
  vendor?(): VendorView | null;
  waypoints?(): WaypointView | null;
  quests?(): QuestLogView | null;
  lore?(): LoreView | null;
  dialogue?(): DialogueView | null;
  merc?(): MercView | null;
}

export interface PanelEnv {
  services: PanelServices;
  data: PanelDataSource;
  onQuitToMenu?: () => void;
}

export const PanelEnvContext = createContext<PanelEnv>({ services: defaultServices, data: {} });
export const usePanelEnv = () => useContext(PanelEnvContext);
