/**
 * <Panels api={...} /> renders every open PanelId except 'map' (owned by the HUD).
 * Desktop/iPad: D2 layout (left + right docks, centered dialogs). Phone/narrow: full-screen
 * sheet with tabs. Owns the held-item ghost, tooltips and Esc handling.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { t } from '../../data/names';
import type { PlayerEntity } from '../../core/sim/entities';
import type { Difficulty } from '../../core/types';
import type { PanelId, UiApi } from '../types';
import { ItemCompareTooltip, SkillTooltip, TooltipLayer, type TipAction } from '../tooltips';
import { CharacterPanel } from './CharacterPanel';
import { HeldGhost, Tabs } from './common';
import { CtlContext, PanelCtl, RING_SLOTS, useCtl as ctlFromContext, type TipState } from './ctl';
import { Icon } from './icons';
import { InventoryPanel } from './InventoryPanel';
import { activeTab, arrangePanels, compactTabs, isCompact, TRADE_PANELS, topPanel } from './layout';
import {
  CubePanel,
  DialoguePanel,
  GameMenuPanel,
  MercPanel,
  OptionsPanel,
  QuestPanel,
  StashPanel,
  VendorPanel,
  WaypointPanel,
} from './MiscPanels';
import {
  defaultServices,
  PanelEnvContext,
  usePanelEnv,
  type PanelDataSource,
  type PanelEnv,
  type PanelServices,
} from './services';
import { skillBonus, skillStatus } from './skillLogic';
import { SkillTreePanel } from './SkillTreePanel';
import '../theme.css';
import './panels.css';

export type * from './services';
export { OptionsForm } from './OptionsForm';

export interface PanelsProps {
  api: UiApi;
  /** State not on entities (stash, vendor stock, quests, waypoints, dialogue, merc, cube). */
  data?: PanelDataSource;
  /** Override lookups (tests/dev harness). Defaults read the real DB. */
  services?: Partial<PanelServices>;
  /** Shown as "Save and quit" in the game menu panel. */
  onQuitToMenu?: () => void;
}

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

export function Panels(props: PanelsProps) {
  const { api } = props;
  const ctl = useMemo(() => new PanelCtl(), []);
  const env: PanelEnv = useMemo(
    () => ({
      services: { ...defaultServices, ...props.services },
      data: props.data ?? {},
      ...(props.onQuitToMenu ? { onQuitToMenu: props.onQuitToMenu } : {}),
    }),
    [props.services, props.data, props.onQuitToMenu],
  );
  const vp = useViewport();
  const [picked, setPicked] = useState<PanelId | null>(null);

  const open = api.store.openPanels.value;
  // Subscribe to per-frame updates only while one of our panels is open.
  const _frame = open.some((id) => id !== 'map') ? api.store.frame.value : 0;
  const settings = api.store.settings.value;
  const view = api.store.view.value;
  const player = (view?.localPlayerId != null ? view.get(view.localPlayerId) : undefined) as
    PlayerEntity | undefined;
  ctl.bind(api, env, player ?? null, open);

  useEffect(() => ctl.attach(), [ctl]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ctl.held.value) return ctl.cancelHeld();
      if (ctl.tip.value?.pinned) return ctl.hideTip();
      const top = topPanel(api.store.openPanels.value);
      if (top) {
        e.preventDefault();
        api.togglePanel(top);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl, api]);

  // Drop held items / tooltips when their panels close.
  const mine = open.filter((id) => id !== 'map');
  useEffect(() => {
    if (!mine.includes('inventory') && !mine.some((id) => TRADE_PANELS.includes(id))) ctl.cancelHeld();
    if (mine.length === 0) ctl.hideTip();
    if (!mine.includes('vendor')) ctl.vendorId = null;
  }, [mine.join(',')]);

  if (!player || mine.length === 0) return <div class="dte-panels" />;

  const difficulty: Difficulty = view?.difficulty ?? 'normal';
  const close = (id: PanelId) => () => api.togglePanel(id);
  const render = (id: PanelId) => {
    const c = close(id);
    switch (id) {
      case 'inventory':
        return <InventoryPanel api={api} player={player} onClose={c} />;
      case 'character':
        return <CharacterPanel api={api} player={player} difficulty={difficulty} onClose={c} />;
      case 'skills':
        return <SkillTreePanel api={api} player={player} onClose={c} />;
      case 'quests':
        return <QuestPanel onClose={c} />;
      case 'stash':
        return <StashPanel api={api} player={player} onClose={c} />;
      case 'vendor':
        return <VendorPanel api={api} player={player} onClose={c} />;
      case 'cube':
        return <CubePanel api={api} player={player} onClose={c} />;
      case 'waypoint':
        return <WaypointPanel api={api} onClose={c} />;
      case 'merc':
        return <MercPanel onClose={c} />;
      case 'options':
        return <OptionsPanel api={api} onClose={c} />;
      case 'dialogue':
        return <DialoguePanel api={api} onClose={c} />;
      case 'menu':
        return <GameMenuPanel api={api} onClose={c} />;
      default:
        return null;
    }
  };

  const compact = isCompact(vp.w, vp.h);
  const rootClass = [
    'dte-panels',
    compact ? 'compact' : 'docked',
    settings.colorblind !== 'none' ? `cb cb-${settings.colorblind}` : '',
    ctl.held.value ? 'holding' : '',
  ].join(' ');
  const style = { '--text-scale': settings.textScale };

  let body;
  if (compact) {
    const tabs = compactTabs(open);
    const active = activeTab(open, picked) ?? 'inventory';
    const trade = TRADE_PANELS.includes(active);
    body = (
      <div class="dte-sheet" data-panel="sheet">
        <div class="dte-sheet-bar">
          <Tabs
            class="sheet"
            value={active}
            onChange={(id) => {
              setPicked(id);
              if (!open.includes(id)) api.togglePanel(id);
            }}
            tabs={tabs.map((id) => ({
              id,
              label: t(`ui.panel.${id}`),
              badge:
                id === 'character'
                  ? player.statPointsUnspent
                  : id === 'skills'
                    ? player.skillPointsUnspent
                    : undefined,
            }))}
          />
          <button class="dte-close" aria-label={t('ui.close')} onClick={() => api.closeAllPanels()}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <div class={`dte-sheet-body ${trade ? 'split' : ''} t-${active}`}>
          {render(active)}
          {trade && render('inventory')}
        </div>
      </div>
    );
  } else {
    const a = arrangePanels(open);
    body = (
      <>
        {a.left && <div class="dte-dock left">{render(a.left)}</div>}
        {a.right && <div class="dte-dock right">{render(a.right)}</div>}
        {a.center && <div class={`dte-dock center c-${a.center}`}>{render(a.center)}</div>}
      </>
    );
  }

  return (
    <PanelEnvContext.Provider value={env}>
      <CtlContext.Provider value={ctl}>
        <div class={rootClass} style={style}>
          {ctl.held.value && !ctl.held.value.dragging && <div class="dte-catcher" />}
          {body}
          <HeldGhost />
          <TipView tip={ctl.tip.value} player={player} />
        </div>
      </CtlContext.Provider>
    </PanelEnvContext.Provider>
  );
}

function TipView({ tip, player }: { tip: TipState | null; player: PlayerEntity }) {
  const env = usePanelEnv();
  const ctl = ctlFromContext();
  if (!tip || ctl.held.value) return null;
  const { services } = env;
  const colorblind = ctl.api.store.settings.value.colorblind !== 'none';
  const c = tip.content;
  if (c.kind === 'item') {
    const desc = services.describeItem(c.item);
    let compare;
    if (c.where.kind === 'grid') {
      const slots = ctl.slotsFor(c.item);
      const eq = (slots === RING_SLOTS ? RING_SLOTS : slots.slice(0, 1))
        .map((s) => player.equipment[s])
        .filter((i) => !!i && i.uid !== c.item.uid);
      compare = eq.map((i) => services.describeItem(i!));
    }
    let footer: string | undefined;
    let footerTone: 'ok' | 'bad' | undefined;
    if (c.where.kind === 'grid' && c.where.container === 'vendor') {
      const price = services.price(c.item, 'buy');
      footer = price > player.creditz ? t('ui.price.cantAfford') : t('ui.price.buy', { price });
      footerTone = price > player.creditz ? 'bad' : 'ok';
    } else if (c.where.kind === 'grid' && c.where.container === 'inventory' && ctl.vendorId !== null) {
      footer = t('ui.price.sell', { price: services.price(c.item, 'sell') });
    }
    const actions: TipAction[] | undefined = tip.pinned ? ctl.actionsFor(c.item, c.where) : undefined;
    return (
      <TooltipLayer anchor={tip.anchor} pinned={tip.pinned}>
        <ItemCompareTooltip
          colorblind={colorblind}
          compare={compare}
          main={{ desc, footer, footerTone, actions, colorblind }}
        />
      </TooltipLayer>
    );
  }
  const all = services.skillsForClass(player.classId);
  const skill = all.find((s) => s.id === c.skillId);
  if (!skill) return null;
  const cls = services.classDef(player.classId);
  const hard = player.skills[skill.id] ?? 0;
  const st = skillStatus(skill, {
    charLevel: player.level,
    unspent: player.skillPointsUnspent,
    hard: player.skills,
  });
  const names = new Map(all.map((s) => [s.id, s.name]));
  const treeName = cls?.trees.find((tr) => tr.id === skill.tree)?.name;
  const actions: TipAction[] | undefined =
    c.touch && st.state === 'available'
      ? [
          {
            label: t('ui.act.learn'),
            tone: 'primary',
            run: () => ctl.api.dispatch({ type: 'allocateSkill', skillId: skill.id }),
          },
        ]
      : undefined;
  return (
    <TooltipLayer anchor={tip.anchor} pinned={tip.pinned} prefer={['right', 'left', 'bottom', 'top']}>
      <SkillTooltip
        skill={skill}
        hard={player.skills}
        bonus={skillBonus(player.stats.skillBonus, skill, hard)}
        charLevel={player.level}
        resourceName={cls ? t(cls.resourceName) : t('ui.resource')}
        treeName={treeName ? t(treeName) : undefined}
        skillName={(id) => t(names.get(id) ?? id)}
        footer={st.state === 'maxed' ? t('ui.skill.maxed') : undefined}
        actions={actions}
      />
    </TooltipLayer>
  );
}
