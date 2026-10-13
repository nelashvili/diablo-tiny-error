/** Belt, menu buttons, XP/stamina bars, quick-status row and the target frame. */
import type { JSX } from 'preact';
import { t } from '../../data/names';
import type { PanelId } from '../types';
import { useHud } from './context';
import { BossEmblem, ConsumableIcon, Glyph, MenuIcon, statusGlyph, type MenuIconName } from './icons';
import { effectColor, rankColor, damageColor } from './colors';
import { formatDuration, formatInt } from './format';
import { skillInfo } from './lookup';

export function Belt(): JSX.Element {
  const { model, api } = useHud();
  const cols = model.belt.value;
  return (
    <div class="hud-belt" role="group" aria-label={t('hud.belt')}>
      {cols.map((c) => (
        <button
          type="button"
          key={c.col}
          class={`hud-beltslot${c.base ? '' : ' is-empty'}`}
          disabled={!c.base}
          title={c.base ? t('hud.belt.use', { item: c.name, key: c.col + 1 }) : t('hud.belt.empty')}
          aria-label={c.base ? t('hud.belt.use', { item: c.name, key: c.col + 1 }) : t('hud.belt.empty')}
          onClick={() => c.base && api.dispatch({ type: 'useBeltSlot', index: c.col })}
        >
          {c.base ? <ConsumableIcon kind={c.kind} /> : null}
          {c.count > 1 ? <span class="hud-beltslot__count">{c.count}</span> : null}
          <span class="hud-keyhint">{c.col + 1}</span>
        </button>
      ))}
    </div>
  );
}

const MENU: { id: PanelId; icon: MenuIconName; key: string; hint: string }[] = [
  { id: 'character', icon: 'character', key: 'hud.menu.character', hint: 'C' },
  { id: 'inventory', icon: 'inventory', key: 'hud.menu.inventory', hint: 'I' },
  { id: 'skills', icon: 'skills', key: 'hud.menu.skills', hint: 'S' },
  { id: 'quests', icon: 'quests', key: 'hud.menu.quests', hint: 'Q' },
  { id: 'map', icon: 'map', key: 'hud.menu.map', hint: 'Tab' },
  { id: 'menu', icon: 'menu', key: 'hud.menu.menu', hint: 'Esc' },
];

export function MenuButtons(): JSX.Element {
  const { model, api } = useHud();
  const open = api.store.openPanels.value;
  const touch = api.store.isTouch.value;
  return (
    <nav class="hud-menu">
      {MENU.map((m) => {
        const badge =
          m.id === 'skills' ? model.skillPoints.value : m.id === 'character' ? model.statPoints.value : 0;
        const label = t(m.key);
        const tip =
          badge > 0
            ? `${label} — ${t(m.id === 'skills' ? 'hud.menu.skillPoints' : 'hud.menu.statPoints', { n: badge })}`
            : touch
              ? label
              : `${label} (${m.hint})`;
        return (
          <button
            type="button"
            key={m.id}
            class={`hud-menubtn${open.includes(m.id) ? ' is-open' : ''}${badge > 0 ? ' has-badge' : ''}`}
            title={tip}
            aria-label={tip}
            aria-pressed={open.includes(m.id)}
            onClick={() => api.togglePanel(m.id)}
          >
            <MenuIcon name={m.icon} />
            {badge > 0 ? <span class="hud-badge">{t('hud.menu.pointsBadge', { n: badge })}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

export function XpBar(): JSX.Element {
  const { model } = useHud();
  const frac = model.xpFrac.value;
  const label = model.xpMaxed.value
    ? t('hud.xpMax')
    : t('hud.xpProgress', { cur: formatInt(model.xpCur.value), next: formatInt(model.xpSpan.value) });
  return (
    <div
      class="hud-xp"
      title={label}
      role="progressbar"
      aria-label={t('hud.xp')}
      aria-valuenow={Math.round(frac * 100)}
    >
      <div class="hud-xp__track">
        <div class="hud-xp__fill" style={{ transform: `scaleX(${frac})` }} />
        <div class="hud-xp__ticks" />
        <span class="hud-xp__text">{label}</span>
      </div>
      <span class="hud-xp__level">{t('hud.levelShort', { level: model.level.value })}</span>
    </div>
  );
}

export function StaminaBar(): JSX.Element {
  const { model, api } = useHud();
  const running = model.running.value;
  const f = model.stamina.value;
  return (
    <div class="hud-stamina">
      <button
        type="button"
        class={`hud-runbtn${running ? ' is-on' : ''}`}
        title={t(running ? 'hud.run' : 'hud.walk')}
        aria-pressed={running}
        onClick={() => api.dispatch({ type: 'setRunning', running: !running })}
      >
        <Glyph name="leap" />
      </button>
      <div class="hud-stamina__track" title={t('hud.stamina')}>
        <div class={`hud-stamina__fill${f < 0.2 ? ' is-low' : ''}`} style={{ transform: `scaleX(${f})` }} />
      </div>
    </div>
  );
}

export function StatusRow(): JSX.Element {
  const { model } = useHud();
  const items = model.status.value;
  return (
    <div class="hud-status" aria-live="polite">
      {items.map((s) => {
        const color = s.buff ? damageColor(skillInfo(s.id).element) : effectColor(s.id as never);
        const name = s.buff ? skillInfo(s.id).name : t(`hud.status.${s.id}`);
        return (
          <div
            key={s.key}
            class={`hud-statusicon ${s.buff ? 'is-buff' : 'is-debuff'}`}
            style={{ '--el': color, '--frac': s.frac } as JSX.CSSProperties}
            title={name}
          >
            <span class="hud-statusicon__ring" />
            <span class="hud-statusicon__glyph">
              <Glyph name={statusGlyph(s.id, s.buff)} />
            </span>
            <span class="hud-statusicon__time">{formatDuration(s.remaining)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TargetFrame(): JSX.Element | null {
  const { model } = useHud();
  const tg = model.target.value;
  if (!tg) return null;
  const isMonster = tg.kind === 'monster';
  const rank = tg.rank;
  const special = rank === 'champion' || rank === 'unique' || rank === 'boss';
  return (
    <div class={`hud-target hud-panel hud-target--${isMonster ? (rank ?? 'normal') : tg.kind}`}>
      {rank === 'boss' ? (
        <div class="hud-target__emblem">
          <BossEmblem />
        </div>
      ) : null}
      <div class="hud-target__name" style={{ color: isMonster ? rankColor(rank) : 'var(--ui-text)' }}>
        {tg.name}
      </div>
      {special ? <div class="hud-target__rank">{t(`hud.rank.${rank}`)}</div> : null}
      {isMonster || tg.kind === 'merc' ? (
        <div class="hud-target__bar">
          <div class="hud-target__fill" style={{ transform: `scaleX(${tg.lifeFrac})` }} />
        </div>
      ) : null}
      {tg.mods.length ? (
        <div class="hud-target__mods">{tg.mods.map((m) => t(`hud.mod.${m}`)).join(', ')}</div>
      ) : null}
      {tg.kind === 'npc' ? <div class="hud-target__hint">{t('hud.npc.talk')}</div> : null}
      {tg.kind === 'merc' ? <div class="hud-target__hint">{t('hud.merc')}</div> : null}
    </div>
  );
}

export function Notifications(): JSX.Element {
  const { fx } = useHud();
  const banner = fx.banner.value;
  return (
    <>
      <div class="hud-toasts" aria-live="polite">
        {fx.toasts.value.map((x) => (
          <div key={x.id} class="hud-toast hud-panel" style={x.color ? { color: x.color } : undefined}>
            {x.text}
          </div>
        ))}
      </div>
      <div class="hud-pickups" aria-live="polite">
        {fx.pickups.value.map((x) => (
          <div key={x.id} class="hud-pickup" style={{ '--qc': x.color } as JSX.CSSProperties}>
            {x.text}
          </div>
        ))}
      </div>
      {banner ? (
        <div key={banner.id} class={`hud-banner hud-banner--${banner.kind}`} role="status">
          {banner.kind === 'boss' ? (
            <div class="hud-banner__emblem">
              <BossEmblem />
            </div>
          ) : null}
          <div class="hud-banner__title">{banner.title}</div>
          {banner.lines.length ? (
            <div class="hud-banner__lines">
              {banner.lines.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
