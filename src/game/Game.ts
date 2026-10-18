/**
 * The game shell: owns the simulation, renderer, audio, UI bridge, input and saves, and runs the
 * frame loop. Level travel (exits, waypoints, recall, respawn) is queued and applied between ticks.
 */
import { DB } from '@/data/db';
import { storyHud, storyTalk } from './story';
import type { ClassId, DefId, Vec2 } from '@/core/types';
import { SimWorld, type SimSystem } from '@/core/sim/world';
import { FixedLoop } from '@/core/sim/loop';
import type { Command } from '@/core/sim/commands';
import type { GameEvent } from '@/core/sim/events';
import type { PlayerEntity } from '@/core/sim/entities';
import { CommandHandlers, deathHooks, revivePlayer, createCoreSystems } from '@/core/sim/systems';
import { createAiSystem } from '@/core/ai';
import { createPlayer, itemUseHooks, recomputeStats } from '@/core/player';
import { rollDrops } from '@/core/loot';
import { spawnGroundItem } from '@/core/player';
import { playerToSave, saveToPlayerInit, newCharacterSave, defaultSettings } from '@/core/save';
import type { CharacterSave, Settings } from '@/core/save/types';
import { createRenderer, type RenderController } from '@/render/renderer';
import { createItemIcons, type ItemIconSource } from '@/render/icons/itemIcons';
import { createAudioSystem, type FullAudioSystem, type LoopHandle } from '@/audio';
import { AUDIO_CATALOG } from '@/render/assets/audio';
import { elementForSkill, type BasicAttackSound, type CueContext } from '@/audio/eventMap';
import { basicMissileFor } from '@/core/skills/behaviors';
import { getEquippedWeapon } from '@/core/player/weapon';
import { createInputManager, detectTouch, type InputManager } from '@/ui/input';
import type { InputContext } from '@/ui/input/types';
import {
  autoQuality,
  detectDevice,
  QualityGovernor,
  createIdbSaveStore,
  type PlatformSaveStore,
} from '@/platform';
import { LevelManager } from './levels';
import { createUiBridge, openPanel, type UiBridge } from './ui';
import { QuestTracker } from './quests';
import { isVendor, repairCost } from '@/core/player/vendor';
import { STASH_GRID } from '@/core/player/inventory';
import { emptyGrid } from '@/core/items/grid';
import type { QuestLogView, StashView, VendorView } from '@/ui/panels/services';
import type { DialogueView, WaypointView } from '@/ui/panels/services';
import type { ActId } from '@/core/types';

type Travel = { kind: 'level'; levelId: DefId; from?: DefId; at?: 'waypoint' | Vec2 } | { kind: 'respawn' };

export class Game {
  readonly world: SimWorld;
  readonly levels: LevelManager;
  readonly ui: UiBridge;
  renderer!: RenderController;
  /** Rendered inventory item art (lazy; its own small WebGL context). */
  readonly itemIcons: ItemIconSource = createItemIcons();
  audio!: FullAudioSystem;
  input!: InputManager;
  private loop: FixedLoop;
  private store: PlatformSaveStore;
  private save: CharacterSave | null = null;
  private pending: Travel | null = null;
  private loading = false;
  private governor: QualityGovernor;
  private lastFrame = performance.now();
  private saveTimer = 0;
  private playTime = 0;
  /** Recall portal: where it leads back to. */
  private portalBack: { levelId: DefId; pos: Vec2 } | null = null;
  readonly isTouch: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    settings: Settings = defaultSettings(),
  ) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.world = new SimWorld(seed);
    this.levels = new LevelManager(this.world, seed);
    this.quests = new QuestTracker(this.world, () => this.player);
    const device = detectDevice();
    this.isTouch = detectTouch();
    const quality = settings.quality === 'auto' ? autoQuality(device) : settings.quality;
    this.governor = new QualityGovernor(quality);
    this.store = createIdbSaveStore();

    const core = createCoreSystems();
    const systems: SimSystem[] = [core[0]!, createAiSystem(), ...core.slice(1)];
    this.loop = new FixedLoop(this.world, systems);

    this.ui = createUiBridge({
      dispatch: (cmd) => this.dispatch(cmd),
      settings: { ...settings, quality },
      isTouch: this.isTouch,
      worldToScreen: (p, h) => this.renderer?.worldToScreen(p, h) ?? null,
      onSettingsChanged: (s) => this.applySettings(s),
    });
    this.registerHandlers();
  }

  get player(): PlayerEntity | undefined {
    const id = this.world.localPlayerId;
    return id != null ? (this.world.get(id) as PlayerEntity | undefined) : undefined;
  }

  async init(): Promise<void> {
    const s = this.ui.api.store.settings.value;
    this.renderer = createRenderer();
    await this.renderer.init(this.canvas, { quality: this.governor.level });
    this.renderer.setTouchMode(this.isTouch);
    this.renderer.setScreenShake(s.screenShake);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.audio = createAudioSystem({ catalog: AUDIO_CATALOG });
    this.audio.setVolumes({ master: masterVolume(s), music: s.musicVolume, sfx: s.sfxVolume });

    const ctx: InputContext = {
      dispatch: (cmd) => this.dispatch(cmd),
      pick: (x, y) => this.renderer.pick(x, y),
      screenToWorld: (x, y) => this.renderer.screenToWorld(x, y),
      getSelectedSkills: () => {
        const p = this.player;
        return {
          left: p?.leftSkill ?? 'attack',
          right: p?.rightSkill ?? 'attack',
          hotkeys: p?.hotkeys ?? [],
        };
      },
      togglePanel: (id) => this.ui.api.togglePanel(id),
      isOverUi: (x, y) => {
        const r = this.canvas.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + x, r.top + y);
        // The touch controls' world layer covers the canvas and stands in for it.
        return !!el && el !== this.canvas && !el.classList.contains('tc-world');
      },
    };
    this.inputCtx = ctx;
    this.input = createInputManager(this.canvas, ctx, {
      getView: () => this.world,
      closeAllPanels: () => this.ui.api.closeAllPanels(),
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = this.canvas.getBoundingClientRect();
      const id = this.renderer.pick(e.clientX - r.left, e.clientY - r.top);
      this.renderer.setHovered(id);
      this.ui.api.store.hoveredEntity.value = id;
    });
  }

  inputCtx!: InputContext;
  readonly quests: QuestTracker;
  private saberHum: LoopHandle | null = null;
  /** 1 right after the hero swings, decaying to 0 (bends the hum's pitch up). */
  private saberSwing = 0;

  /** Lit saber in hand: ignite + hum loop; swings bend the hum; put away = stop. */
  private updateSaberHum(events: readonly GameEvent[], dt: number): void {
    const p = this.player;
    const lit = !this.loading && !!p && p.life > 0 && wieldsSaber(this.world, p.id);
    if (lit && !this.saberHum) {
      this.saberHum = this.audio.startLoop('saberHum', { volume: 0.2 });
      this.audio.playSfx('saberIgnite', { volume: 0.7 });
    } else if (!lit && this.saberHum) {
      this.saberHum.stop();
      this.saberHum = null;
    }
    if (!this.saberHum || !p) return;
    for (const e of events) if (e.type === 'skillCast' && e.casterId === p.id) this.saberSwing = 1;
    this.saberSwing = Math.max(0, this.saberSwing - dt / 0.35);
    this.saberHum.setIntensity(this.saberSwing);
  }

  private readonly cueCtx: CueContext = {
    basicAttackSound: (id) => basicAttackSound(this.world, id),
    hitsWithSaber: (id) => wieldsSaber(this.world, id),
    hostileAttackSound: (id, skillId) => hostileAttackSound(this.world, id, skillId),
  };

  questView(): QuestLogView {
    return this.quests.view((this.levels.current?.act ?? 1) as ActId);
  }

  // ------------------------------------------------------------------ start / save

  async listCharacters() {
    await this.store.ready;
    return this.store.listCharacters();
  }

  async lastCharacterId(): Promise<string | undefined> {
    await this.store.ready;
    return (await this.store.loadAccount()).lastCharacterId;
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.store.ready;
    await this.store.deleteCharacter(id);
  }

  /** Save, then tear down the running game so the menu can start another. */
  async quitToMenu(): Promise<void> {
    await this.persist();
    this.resetWorld();
  }

  private resetWorld(): void {
    const w = this.world;
    w.entities.clear();
    w.localPlayerId = null;
    w.level = null;
    w.levelId = null;
    w.commands.length = 0;
    w.drainFrameEvents();
    this.levels.reset((Math.random() * 0xffffffff) >>> 0);
    this.portalBack = null;
    this.dialogue = null;
    this.ui.api.closeAllPanels();
    this.audio.playMusic(null);
  }

  waypointView(): WaypointView {
    const acts = new Map<number, { id: DefId; nameKey: string; unlocked: boolean }[]>();
    for (const l of DB.levels.values()) {
      if (!l.waypoint) continue;
      const list = acts.get(l.act) ?? [];
      list.push({ id: l.id, nameKey: l.name, unlocked: this.levels.waypoints.has(l.id) });
      acts.set(l.act, list);
    }
    return {
      ...(this.world.levelId ? { currentLevelId: this.world.levelId } : {}),
      acts: [...acts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([act, levels]) => ({ act: act as ActId, unlocked: levels.some((l) => l.unlocked), levels })),
    };
  }

  private dialogue: DialogueView | null = null;
  dialogueView(): DialogueView | null {
    return this.dialogue;
  }

  async newCharacter(classId: ClassId, name: string): Promise<void> {
    if (this.player) this.resetWorld();
    const save = newCharacterSave(classId, name, { now: Date.now() });
    this.save = save;
    this.quests.load({}, save.progress[save.currentDifficulty]?.actsUnlocked ?? [1]);
    const town = this.levels.townOf(1);
    this.levels.enter(town);
    createPlayer(this.world, classId, name, { local: true });
    this.levels.enter(town); // re-place the player at the town start
    await this.afterLevelChange();
    this.saveTimer = 0;
    await this.persist();
  }

  async loadCharacter(id: string): Promise<boolean> {
    if (this.player) this.resetWorld();
    await this.store.ready;
    const save = await this.store.loadCharacter(id);
    if (!save) return false;
    this.save = save;
    const init = saveToPlayerInit(save);
    const town = this.levels.townOf(save.progress[save.currentDifficulty]?.currentAct ?? 1);
    this.world.difficulty = save.currentDifficulty;
    const prog = save.progress[save.currentDifficulty];
    this.quests.load(prog?.quests, prog?.actsUnlocked ?? [1]);
    this.levels.enter(town);
    const p = createPlayer(this.world, init.classId, init.name, { local: true, startingItems: [] });
    Object.assign(p, {
      level: init.level,
      xp: init.xp,
      creditz: init.creditz,
      allocated: init.allocated,
      statPointsUnspent: init.statPointsUnspent,
      skillPointsUnspent: init.skillPointsUnspent,
      skills: init.skills,
      leftSkill: init.leftSkill,
      rightSkill: init.rightSkill,
      hotkeys: init.hotkeys,
      equipment: init.equipment,
      inventory: init.inventory,
      belt: init.belt,
      respecs: init.respecs,
      stash: init.extra.stash,
      ...(init.swap ? { swap: init.swap } : {}),
    });
    for (const wp of save.progress[save.currentDifficulty]?.waypoints ?? []) this.levels.waypoints.add(wp);
    recomputeStats(p, this.world.difficulty);
    p.life = p.stats.lifeMax;
    p.mana = p.stats.manaMax;
    this.levels.enter(town);
    this.playTime = save.playTimeSec;
    await this.afterLevelChange();
    return true;
  }

  async persist(): Promise<void> {
    const p = this.player;
    if (!p || !this.save) return;
    const init = saveToPlayerInit(this.save);
    const diff = this.world.difficulty;
    const progress = { ...init.extra.progress };
    const cur = progress[diff];
    if (cur) {
      progress[diff] = {
        ...cur,
        waypoints: [...this.levels.waypoints],
        quests: structuredClone(this.quests.state),
        currentAct: (this.levels.current?.act ?? cur.currentAct) as typeof cur.currentAct,
      };
    }
    this.save = playerToSave(p, {
      ...init.extra,
      ...(p.stash ? { stash: p.stash } : {}),
      progress,
      updatedAt: Date.now(),
      playTimeSec: Math.round(this.playTime),
    });
    try {
      await this.store.saveCharacter(this.save);
      const acc = await this.store.loadAccount();
      if (!acc.characterIds.includes(this.save.id)) acc.characterIds.push(this.save.id);
      acc.lastCharacterId = this.save.id;
      acc.settings = this.ui.api.store.settings.value;
      await this.store.saveAccount(acc);
    } catch (err) {
      console.warn('[save] failed', err);
    }
  }

  // ------------------------------------------------------------------ frame loop

  start(): void {
    const frame = (now: number) => {
      const realDt = Math.min(0.25, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.step(realDt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private step(realDt: number): void {
    const w = this.world;
    this.input?.update(realDt);
    const alpha = this.loading ? 0 : this.loop.advance(realDt);
    if (!this.loading && !w.paused) this.playTime += realDt;
    const events = w.drainFrameEvents();
    if (!this.loading) this.renderer.render(w, events, alpha, realDt);
    const p = this.player;
    if (p) this.audio.setListener?.(p.pos);
    this.audio.handleEvents(events, this.cueCtx);
    this.updateSaberHum(events, realDt);
    this.storyTimer -= realDt;
    if (this.storyTimer <= 0) {
      this.storyTimer = 0.25;
      this.updateStoryHud();
    }
    this.ui.api.store.view.value = w;
    this.ui.publish(events);

    const sug = this.governor.push(realDt * 1000);
    if (sug && this.ui.api.store.settings.value.quality === 'auto') this.renderer.setQuality(sug.to);

    this.saveTimer += realDt;
    if (this.saveTimer > 60) {
      this.saveTimer = 0;
      void this.persist();
    }
    if (this.pending && !this.loading) {
      const tr = this.pending;
      this.pending = null;
      void this.travel(tr);
    }
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.renderer?.resize(r.width, r.height, window.devicePixelRatio || 1);
  }

  private dispatch(cmd: Command): void {
    // Dialogue choices are UI flow, not simulation: "Trade" opens the shop next to the bag.
    if (cmd.type === 'talk' && cmd.option === 'trade') {
      const npc = this.world.get(cmd.npcId);
      if (npc?.kind === 'npc' && isVendor(npc)) {
        this.vendorNpcId = npc.id;
        const api = this.ui.api;
        api.store.openPanels.value = api.store.openPanels.value.filter((id) => id !== 'dialogue');
        openPanel(api, 'vendor');
        openPanel(api, 'inventory');
      }
      return;
    }
    this.world.commands.push(cmd);
  }

  /** Shop shown in the vendor panel (the NPC last traded with). */
  private vendorNpcId: number | null = null;
  vendorView(): VendorView | null {
    const p = this.player;
    const npc = this.vendorNpcId !== null ? this.world.get(this.vendorNpcId) : undefined;
    if (!p || !npc || npc.kind !== 'npc' || !npc.stock) return null;
    const def = DB.npcs.get(npc.defId);
    return {
      npcId: npc.id,
      nameKey: def?.name ?? npc.defId,
      stock: npc.stock,
      ...(def?.roles.includes('smith') ? { repairCost: repairCost(p) } : {}),
    };
  }

  stashView(): StashView | null {
    const p = this.player;
    if (!p) return null;
    p.stash ??= emptyGrid(STASH_GRID.w, STASH_GRID.h);
    return { personal: p.stash, shared: [] };
  }

  private applySettings(s: Settings): void {
    this.audio?.setVolumes({ master: masterVolume(s), music: s.musicVolume, sfx: s.sfxVolume });
    this.renderer?.setScreenShake(s.screenShake);
    if (s.quality !== 'auto') this.renderer?.setQuality(s.quality);
  }

  // ------------------------------------------------------------------ travel

  private async travel(tr: Travel): Promise<void> {
    const p = this.player;
    if (tr.kind === 'respawn') {
      if (p) revivePlayer(this.world, p);
      this.levels.enter(this.levels.townOf(this.levels.current?.act ?? 1));
    } else {
      this.levels.enter(tr.levelId, {
        ...(tr.from ? { from: tr.from } : {}),
        ...(tr.at ? { at: tr.at } : {}),
      });
    }
    await this.afterLevelChange();
    void this.persist();
  }

  private storyTimer = 0;
  private storyKey = '';

  /** Refresh the HUD's objective line and turn-in markers (only when they change). */
  private updateStoryHud(): void {
    const sig = this.ui.api.store.story;
    if (!sig) return;
    const npcs: { id: number; defId: string }[] = [];
    for (const e of this.world.entities.values())
      if (e.kind === 'npc' && e.alive) npcs.push({ id: e.id, defId: e.defId });
    const level = this.world.levelId;
    const next = storyHud(
      this.quests.activeQuests(),
      this.quests.state,
      npcs,
      level ? { level, levels: [...DB.levels.values()] } : undefined,
    );
    const key = JSON.stringify(next);
    if (key === this.storyKey) return;
    this.storyKey = key;
    sig.value = next;
  }

  /** Master Yoduh only waits in camp once he has been rescued (like Cain). */
  private placeStoryNpcs(): void {
    const q = this.quests.state['a1q3'];
    const rescued = !!q && (q.completed || q.step === 'report');
    if (rescued) return;
    for (const e of this.world.entities.values())
      if (e.kind === 'npc' && e.defId === 'masterYoduh') e.alive = false;
  }

  private async afterLevelChange(): Promise<void> {
    const w = this.world;
    const def = this.levels.current;
    if (!w.level || !def) return;
    this.loading = true;
    try {
      await this.renderer.loadLevel(w.level, def.tileset);
    } finally {
      this.loading = false;
    }
    if (def.isTown) this.placeStoryNpcs();
    this.audio.playMusic(def.music ?? (def.isTown ? 'music.town' : 'music.wild'));
    w.emit({ type: 'toast', textKey: def.name });
    this.restorePortal();
  }

  /** Spawn the recall portal pair in town / the origin level if one is active. */
  private restorePortal(): void {
    const w = this.world;
    if (!this.portalBack || !w.levelId) return;
    for (const e of w.entities.values()) if (e.kind === 'object' && e.defId === 'portal') return;
    const def = this.levels.current;
    if (def?.isTown) {
      const start = w.level!.placements.find((q) => q.kind === 'playerStart')?.pos ?? { x: 10, y: 10 };
      this.levels.addObject('portal', { x: start.x + 2, y: start.y }, { target: this.portalBack.levelId });
    } else if (w.levelId === this.portalBack.levelId) {
      const town = this.levels.townOf(def?.act ?? 1);
      this.levels.addObject('portal', this.portalBack.pos, { target: town });
    }
  }

  // ------------------------------------------------------------------ module command handlers

  private registerHandlers(): void {
    const w = this.world;

    CommandHandlers.register('takeExit', (_w, _p, cmd) => {
      const o = w.get(cmd.objectId);
      if (o?.kind !== 'object') return true;
      const target = o.data?.target;
      if (typeof target === 'string')
        this.pending = { kind: 'level', levelId: target, from: w.levelId ?? undefined };
      return true;
    });

    CommandHandlers.register('useWaypoint', (_w, _p, cmd) => {
      if (!this.levels.waypoints.has(cmd.levelId)) return true;
      this.pending = { kind: 'level', levelId: cmd.levelId, at: 'waypoint' };
      this.ui.api.closeAllPanels();
      return true;
    });

    const recall = () => {
      const p = this.player;
      const def = this.levels.current;
      if (!p || !def || def.isTown || !w.levelId) {
        w.emit({ type: 'toast', textKey: 'game.toast.alreadyInTown' });
        return;
      }
      // Remove any older portal pair.
      for (const e of w.entities.values()) if (e.kind === 'object' && e.defId === 'portal') e.alive = false;
      this.portalBack = { levelId: w.levelId, pos: { x: p.pos.x + 1, y: p.pos.y + 1 } };
      this.restorePortal();
      w.emit({ type: 'skillCast', casterId: p.id, skillId: 'recallBeacon', targetPos: p.pos });
    };
    CommandHandlers.register('castRecall', () => {
      recall();
      return true;
    });
    itemUseHooks.recall = () => recall();

    deathHooks.respawn = (_w, p) => {
      revivePlayer(w, p);
      w.emit({ type: 'toast', textKey: 'game.toast.defeated' });
      this.pending = { kind: 'respawn' };
    };

    w.bus.on('objectUsed', (e) => {
      const o = w.get(e.id);
      if (!o || o.kind !== 'object') return;
      switch (o.defId) {
        case 'waypoint':
          if (w.levelId) this.levels.waypoints.add(w.levelId);
          w.emit({ type: 'waypointActivated', levelId: w.levelId ?? '' });
          openPanel(this.ui.api, 'waypoint');
          break;
        case 'portal': {
          const target = o.data?.target;
          if (typeof target === 'string') {
            const back = this.portalBack;
            const toTown = DB.levels.get(target)?.isTown;
            this.pending = toTown
              ? { kind: 'level', levelId: target }
              : { kind: 'level', levelId: target, ...(back ? { at: back.pos } : {}) };
            if (!toTown) {
              // Portal consumed when returning, like D2 one-way use of the pair.
              this.portalBack = null;
            }
          }
          break;
        }
        case 'chest': {
          if (o.used) break;
          o.used = true;
          const def = this.levels.current;
          const act = def?.act ?? 1;
          const mlvl = def?.monsterLevel[w.difficulty] ?? 1;
          const p = this.player;
          const drop = rollDrops(
            {
              treasureClass: `tc.a${act}.normal`,
              monsterLevel: mlvl,
              magicFind: p?.stats.raw.magicFind ?? 0,
              goldFind: p?.stats.raw.goldFind ?? 0,
              players: 1,
              rank: 'normal',
            },
            w.lootRng,
          );
          let i = 0;
          for (const item of drop.items) {
            const a = (i++ / Math.max(1, drop.items.length)) * Math.PI * 2;
            spawnGroundItem(w, item, { x: o.pos.x + Math.cos(a) * 0.9, y: o.pos.y + Math.sin(a) * 0.9 });
          }
          if (drop.creditz > 0 && p) {
            p.creditz += drop.creditz;
            w.emit({ type: 'creditzChanged', playerId: p.id, creditz: p.creditz });
            w.emit({ type: 'itemPickedUp', playerId: p.id, baseId: 'creditz', creditz: drop.creditz });
          }
          break;
        }
        case 'shrine': {
          if (o.used) break;
          o.used = true;
          const p = this.player;
          if (p) {
            p.life = p.stats.lifeMax;
            p.mana = p.stats.manaMax;
            w.emit({ type: 'heal', targetId: p.id, amount: p.stats.lifeMax });
          }
          w.emit({ type: 'shrineUsed', id: o.id, shrine: 'shrine.refill' });
          w.emit({ type: 'toast', textKey: 'game.toast.shrineRefill' });
          break;
        }
        case 'stash':
          openPanel(this.ui.api, 'stash');
          openPanel(this.ui.api, 'inventory');
          break;
      }
    });

    w.bus.on('dialogue', (e) => {
      const npc = w.get(e.npcId);
      if (!npc || npc.kind !== 'npc') return;
      const def = DB.npcs.get(npc.defId);
      const story = storyTalk(npc.defId, this.quests.activeQuests(), this.quests.state);
      const done = story?.debrief ? this.quests.state[story.debrief] : undefined;
      if (done) done.debriefed = true;
      this.dialogue = {
        npcId: npc.id,
        nameKey: def?.name ?? npc.defId,
        lines: story?.lines ?? def?.dialogue ?? [e.lineKey],
        options: isVendor(npc) ? [{ id: 'trade', labelKey: 'ui.dlg.trade' }] : [],
      };
      this.ui.api.store.interactNpc.value = npc.id;
      openPanel(this.ui.api, 'dialogue');
    });
  }
}

/** `?mute` in the URL silences all audio without touching saved settings (automated testing). */
const MUTED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mute');

function masterVolume(s: Settings): number {
  return MUTED ? 0 : s.masterVolume;
}

const SABER_CLASSES = new Set(['litesaber', 'doubleLitesaber']);

/** Basic-attack sound by what the attacker wields: sabers hum, blasturs fire, monster missiles by element. */
function basicAttackSound(world: SimWorld, id: number): BasicAttackSound {
  const a = world.get(id);
  if (!a || (a.kind !== 'player' && a.kind !== 'merc' && a.kind !== 'monster')) return null;
  const missile = basicMissileFor(a);
  if (missile) {
    if (missile === 'javelin' || missile === 'disc') return 'swing';
    const fam = elementForSkill(missile.replace(/^m_/, ''));
    return fam === 'magic' || fam === 'saber' ? 'swing' : fam;
  }
  return wieldsSaber(world, id) ? 'saber' : 'swing';
}

/** Enemy attack sound: melee is silent (the impact covers it), ranged uses its element family. */
function hostileAttackSound(world: SimWorld, id: number, skillId: string): BasicAttackSound | undefined {
  const a = world.get(id);
  if (!a || a.kind !== 'monster' || a.team !== 'monsters') return undefined;
  if (skillId === 'attack' || skillId === 'throw') {
    const s = basicAttackSound(world, id);
    return s === 'swing' || s === 'saber' ? null : s;
  }
  const def = DB.skills.get(skillId);
  if (!def || def.kind === 'meleeAttack') return null;
  const missile = def.missile ?? '';
  if (/quill|javelin|disc/i.test(missile)) return null;
  if (/blastur/i.test(missile)) return 'blastur';
  const el = def.element;
  if (el === 'storm' || el === 'plasma' || el === 'cryo' || el === 'toxin') return el;
  return 'magic';
}

function wieldsSaber(world: SimWorld, id: number): boolean {
  const a = world.get(id);
  if (!a || (a.kind !== 'player' && a.kind !== 'merc')) return false;
  const wc = getEquippedWeapon(a)?.weaponClass;
  return !!wc && SABER_CLASSES.has(wc);
}
