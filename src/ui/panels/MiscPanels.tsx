/** Stash, vendor, workshop (cube), waypoints, quests, dialogue, hireling, options and game menu. */
import { useState } from 'preact/hooks';
import { t } from '../../data/names';
import type { PlayerEntity } from '../../core/sim/entities';
import type { ActId } from '../../core/types';
import type { UiApi } from '../types';
import { EquipSlotView, ItemGrid, PanelFrame, Tabs, Creditz } from './common';
import { useCtl } from './ctl';
import { Icon } from './icons';
import { OptionsForm } from './OptionsForm';
import { usePanelEnv, type QuestState } from './services';

type P = { api: UiApi; player: PlayerEntity; onClose?: () => void };

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export function StashPanel({ api, player, onClose }: P) {
  const { data } = usePanelEnv();
  const stash = data.stash?.() ?? null;
  const [tab, setTab] = useState(0);
  const tabs = stash
    ? [
        { id: 0, label: t('ui.stash.personal') },
        ...stash.shared.map((_, i) => ({ id: i + 1, label: t('ui.stash.shared', { n: i + 1 }) })),
      ]
    : [];
  const grid = stash ? (tab === 0 ? stash.personal : (stash.shared[tab - 1] ?? stash.personal)) : null;
  return (
    <PanelFrame id="stash" title={t('ui.panel.stash')} onClose={onClose}>
      {grid ? (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <ItemGrid container="stash" grid={grid} class="stash" />
          <footer class="dte-inv-foot">
            <Creditz amount={player.creditz} />
            <button
              class="dte-btn"
              onClick={() => api.dispatch({ type: 'sortInventory', container: 'stash' })}
            >
              <Icon name="sort" size={18} /> {t('ui.inv.sort')}
            </button>
          </footer>
        </>
      ) : (
        <div class="dte-empty">{t('ui.stash.empty')}</div>
      )}
    </PanelFrame>
  );
}

export function VendorPanel({ api, player, onClose }: P) {
  const { data } = usePanelEnv();
  const ctl = useCtl();
  const v = data.vendor?.() ?? null;
  ctl.vendorId = v ? v.npcId : null;
  const held = ctl.held.value;
  const selling = !!held && !(held.from.kind === 'grid' && held.from.container === 'vendor');
  return (
    <PanelFrame id="vendor" title={v ? t(v.nameKey) : t('ui.panel.vendor')} onClose={onClose}>
      {v ? (
        <>
          <div class={`dte-vendor-hint ${selling ? 'active' : ''}`}>{t('ui.vendor.sellHint')}</div>
          <ItemGrid container="vendor" grid={v.stock} class="vendor" />
          <footer class="dte-inv-foot">
            <Creditz amount={player.creditz} />
            {(v.repairCost ?? 0) > 0 && (
              <button
                class="dte-btn primary"
                disabled={(v.repairCost ?? 0) > player.creditz}
                onClick={() => api.dispatch({ type: 'repairAll', vendorId: v.npcId })}
              >
                {t('ui.vendor.repair', { price: v.repairCost ?? 0 })}
              </button>
            )}
          </footer>
        </>
      ) : (
        <div class="dte-empty">{t('ui.vendor.none')}</div>
      )}
    </PanelFrame>
  );
}

export function CubePanel({ api, onClose }: P) {
  const { data } = usePanelEnv();
  const cube = data.cube?.() ?? null;
  return (
    <PanelFrame id="cube" title={t('ui.panel.cube')} onClose={onClose}>
      {cube && (
        <div class="dte-cube">
          <ItemGrid container="cube" grid={cube} class="cube" />
          <div class="dte-cube-side">
            <p class="dte-dim">{t('ui.cube.hint')}</p>
            <button class="dte-btn primary big" onClick={() => api.dispatch({ type: 'cubeTransmute' })}>
              {t('ui.cube.transmute')}
            </button>
          </div>
        </div>
      )}
    </PanelFrame>
  );
}

export function WaypointPanel({ api, onClose }: { api: UiApi; onClose?: () => void }) {
  const { data } = usePanelEnv();
  const wp = data.waypoints?.() ?? null;
  const current = wp?.currentLevelId ?? api.store.view.value?.level?.levelId;
  const curAct = wp?.acts.find((a) => a.levels.some((l) => l.id === current))?.act ?? wp?.acts[0]?.act ?? 1;
  const [act, setAct] = useState<ActId | null>(null);
  const shown = act ?? curAct;
  const actView = wp?.acts.find((a) => a.act === shown);
  return (
    <PanelFrame id="waypoint" title={t('ui.panel.waypoint')} onClose={onClose}>
      {!wp || wp.acts.length === 0 ? (
        <div class="dte-empty">{t('ui.wp.none')}</div>
      ) : (
        <>
          <Tabs
            value={shown}
            onChange={setAct}
            tabs={wp.acts.map((a) => ({
              id: a.act,
              label: t('ui.wp.act', { n: ROMAN[a.act]! }),
              disabled: !a.unlocked,
            }))}
          />
          <ul class="dte-wp-list">
            {actView?.levels.map((l) => {
              const here = l.id === current;
              return (
                <li key={l.id}>
                  <button
                    class={`dte-wp ${here ? 'here' : ''} ${l.unlocked ? '' : 'locked'}`}
                    disabled={!l.unlocked || here}
                    onClick={() => api.dispatch({ type: 'useWaypoint', levelId: l.id })}
                  >
                    <Icon name={l.unlocked ? 'beacon' : 'lock'} size={22} />
                    <span>{l.unlocked ? t(l.nameKey) : t('ui.wp.locked')}</span>
                    {here && <em>{t('ui.wp.here')}</em>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PanelFrame>
  );
}

const QUEST_ICON: Record<QuestState, string> = {
  notStarted: 'quest',
  active: 'quest',
  done: 'check',
  rewardReady: 'star',
};

export function QuestPanel({ onClose }: { onClose?: () => void }) {
  const { data } = usePanelEnv();
  const ql = data.quests?.() ?? null;
  const [act, setAct] = useState<ActId | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const shown = act ?? ql?.currentAct ?? 1;
  const av = ql?.acts.find((a) => a.act === shown);
  const quests = av?.quests.slice(0, 6) ?? [];
  const selected = quests.find((q) => q.id === sel) ?? quests.find((q) => q.state === 'active') ?? null;
  return (
    <PanelFrame id="quests" title={t('ui.panel.quests')} onClose={onClose}>
      {!ql ? (
        <div class="dte-empty">{t('ui.quest.none')}</div>
      ) : (
        <>
          <Tabs
            value={shown}
            onChange={(a) => {
              setAct(a);
              setSel(null);
            }}
            tabs={ql.acts.map((a) => ({
              id: a.act,
              label: t('ui.wp.act', { n: ROMAN[a.act]! }),
              disabled: !a.unlocked,
            }))}
          />
          <div class="dte-quest-grid">
            {quests.map((q, i) => (
              <button
                key={q.id}
                class={`dte-quest qs-${q.state} ${selected?.id === q.id ? 'sel' : ''}`}
                onClick={() => setSel(q.id)}
              >
                <span class="dte-quest-medal">
                  <Icon name={QUEST_ICON[q.state]} size="55%" />
                  <i>{i + 1}</i>
                </span>
                <span class="dte-quest-name">{q.state === 'notStarted' ? '???' : t(q.nameKey)}</span>
              </button>
            ))}
          </div>
          <div class="dte-quest-desc">
            {selected ? (
              <>
                <h3>{selected.state === 'notStarted' ? '???' : t(selected.nameKey)}</h3>
                <div class={`dte-pill qs-${selected.state}`}>{t(`ui.quest.${selected.state}`)}</div>
                {selected.state !== 'notStarted' && (
                  <p>{t(selected.stepKey ?? selected.descKey ?? selected.nameKey)}</p>
                )}
              </>
            ) : (
              <p class="dte-dim">{t('ui.quest.pick')}</p>
            )}
          </div>
        </>
      )}
    </PanelFrame>
  );
}

export function DialoguePanel({ api, onClose }: { api: UiApi; onClose?: () => void }) {
  const { data } = usePanelEnv();
  const dlg = data.dialogue?.() ?? null;
  const [page, setPage] = useState(0);
  if (!dlg) return null;
  const name = t(dlg.nameKey);
  const last = page >= dlg.lines.length - 1;
  return (
    <PanelFrame id="dialogue" title={name} onClose={onClose} class="dte-dialogue">
      <div class="dte-dlg">
        <div class="dte-portrait">
          {dlg.portrait ? <img src={dlg.portrait} alt="" /> : <span>{name.charAt(0)}</span>}
        </div>
        <div class="dte-dlg-main">
          <p class="dte-dlg-line">{t(dlg.lines[Math.min(page, dlg.lines.length - 1)] ?? '')}</p>
          <div class="dte-dlg-opts">
            {!last && (
              <button class="dte-btn primary" onClick={() => setPage(page + 1)}>
                {t('ui.dlg.next')} ›
              </button>
            )}
            {last &&
              dlg.options.map((o) => (
                <button
                  key={o.id}
                  class="dte-btn"
                  onClick={() => api.dispatch({ type: 'talk', npcId: dlg.npcId, option: o.id })}
                >
                  {t(o.labelKey)}
                </button>
              ))}
            {last && (
              <button class="dte-btn ghost" onClick={onClose}>
                {t('ui.dlg.bye')}
              </button>
            )}
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}

const MERC_DOLL = [
  { slot: 'head', x: 2, y: 0, w: 2, h: 2 },
  { slot: 'mainHand', x: 0, y: 0.5, w: 1.6, h: 3.5 },
  { slot: 'chest', x: 2, y: 2.2, w: 2, h: 3 },
] as const;

export function MercPanel({ onClose }: { onClose?: () => void }) {
  const { data } = usePanelEnv();
  const m = data.merc?.() ?? null;
  return (
    <PanelFrame id="merc" title={t('ui.panel.merc')} onClose={onClose}>
      {!m ? (
        <div class="dte-empty">{t('ui.merc.none')}</div>
      ) : (
        <div class="dte-merc">
          <div
            class="dte-merc-doll"
            style={{ height: 'calc(var(--cell) * 5.4)', width: 'calc(var(--cell) * 4.2)' }}
          >
            {MERC_DOLL.map((d) => (
              <EquipSlotView key={d.slot} {...d} item={m.equipment[d.slot]} container="merc" />
            ))}
          </div>
          <div class="dte-merc-info">
            <div class="dte-char-name">{m.name}</div>
            <div class="dte-char-class">
              {t(m.typeKey)} · {t('ui.merc.level', { n: m.level })}
            </div>
            <div class="dte-bar life">
              <i style={{ width: `${(m.life / Math.max(1, m.lifeMax)) * 100}%` }} />
              <span>
                {Math.round(m.life)} / {Math.round(m.lifeMax)}
              </span>
            </div>
            {!m.alive && <div class="dte-pill bad">{t('ui.merc.dead')}</div>}
            {m.stats?.map((s) => (
              <div key={s.label} class="dte-kv">
                <span>{s.label}</span>
                <b>{s.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}

export function OptionsPanel({ api, onClose }: { api: UiApi; onClose?: () => void }) {
  return (
    <PanelFrame id="options" title={t('ui.panel.options')} onClose={onClose}>
      <OptionsForm settings={api.store.settings.value} onChange={(p) => api.updateSettings(p)} />
    </PanelFrame>
  );
}

export function GameMenuPanel({ api, onClose }: { api: UiApi; onClose?: () => void }) {
  const { onQuitToMenu } = usePanelEnv();
  return (
    <PanelFrame id="menu" title={t('ui.panel.menu')} onClose={onClose}>
      <div class="dte-menu-list">
        <button class="dte-btn primary big" onClick={onClose}>
          {t('ui.menu.resume')}
        </button>
        <button class="dte-btn big" onClick={() => api.togglePanel('options')}>
          {t('ui.menu.options')}
        </button>
        {onQuitToMenu && (
          <button class="dte-btn big danger" onClick={onQuitToMenu}>
            {t('ui.menu.saveQuit')}
          </button>
        )}
      </div>
    </PanelFrame>
  );
}
