/**
 * In-game HUD (agent "ui-hud"). Mount with `<Hud api={uiApi} />` inside the UI root.
 *
 * Layout: desktop = D2-style bottom console (life orb | skills · belt · menu | mana orb) with an
 * F1–F8 row; touch (`store.isTouch`) = compact bottom-center orbs + belt, menu top-left (the
 * touch agent renders the skill wheel). Minimap top-right, target frame top-center, status
 * icons top-left. Owns the 'map' panel (big map overlay).
 */
import type { JSX } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import type { UiApi } from '../types';
import { t } from '../../data/names';
import '../../data/db'; // registers data/names/*.ts (including hud.ts)
import { HudCtx, useHud as useHudCtx, type HudContext } from './context';
import { HudModel } from './model';
import { FxModel } from './fx';
import { Orb } from './Orb';
import { HotkeyRow, SkillButton, SkillPicker } from './SkillBar';
import { GuideArrow, Objective, TurnInMarkers } from './Story';
import { Belt, MenuButtons, Notifications, StaminaBar, StatusRow, TargetFrame, XpBar } from './Widgets';
import { FloatLayer } from './FloatLayer';
import { BigMap, Minimap } from './Maps';
import './hud.css';

export { HudModel } from './model';
export { FxModel } from './fx';

export function Hud({ api }: { api: UiApi }): JSX.Element {
  const ctx = useMemo<HudContext>(() => ({ api, model: new HudModel(api.store), fx: new FxModel() }), [api]);

  useEffect(() => {
    const stopModel = ctx.model.start();
    const unsub = api.onEvents((events) => ctx.fx.handle(events, api.store.view.peek()));
    return () => {
      stopModel();
      unsub();
      ctx.fx.dispose();
    };
  }, [ctx, api]);

  return (
    <HudCtx.Provider value={ctx}>
      <HudRoot />
    </HudCtx.Provider>
  );
}

function HudRoot(): JSX.Element {
  const { api, model } = useHudCtx();
  const touch = api.store.isTouch.value;
  const scale = api.store.settings.value.textScale || 1;
  const mapOpen = api.store.openPanels.value.includes('map');
  const has = model.hasPlayer.value;
  const resource = model.resource.value;

  return (
    <div
      class={`hud ${touch ? 'hud--touch' : 'hud--desktop'}${mapOpen ? ' hud--map' : ''}`}
      style={{ '--text-scale': scale } as JSX.CSSProperties}
    >
      <FloatLayer />
      {mapOpen ? <BigMap /> : null}
      <div class="hud-topleft">
        {touch ? <MenuButtons /> : null}
        <StatusRow />
        <Objective />
      </div>
      <TurnInMarkers />
      <GuideArrow />
      <TargetFrame />
      {!mapOpen ? <Minimap /> : null}
      <Notifications />
      {has ? (
        <div class="hud-bottom">
          <Orb kind="life" cur={model.life} max={model.lifeMax} label={t('hud.life')} />
          {touch ? (
            <div class="hud-console hud-console--touch hud-panel">
              <Belt />
              <XpBar />
            </div>
          ) : (
            <div class="hud-console-wrap">
              <HotkeyRow />
              <SkillPicker />
              <div class="hud-console hud-panel">
                <SkillButton hand="left" />
                <div class="hud-console__mid">
                  <Belt />
                  <StaminaBar />
                </div>
                <div class="hud-console__sep" />
                <MenuButtons />
                <SkillButton hand="right" />
              </div>
              <XpBar />
            </div>
          )}
          <Orb kind="mana" cur={model.mana} max={model.manaMax} label={resource} />
        </div>
      ) : null}
    </div>
  );
}
