/** Story guidance on the HUD: the tracked quest objective and "?" over NPCs to turn in to. */
import type { JSX } from 'preact';
import { t } from '../../data/names';
import { useHud } from './context';

export function Objective(): JSX.Element | null {
  const { api } = useHud();
  const obj = api.store.story?.value.objective;
  if (!obj) return null;
  return (
    <button type="button" class="hud-objective" onClick={() => api.togglePanel('quests')}>
      <span class="hud-objective__quest">{t(obj.questKey)}</span>
      <span class="hud-objective__step">{t(obj.stepKey)}</span>
    </button>
  );
}

export function TurnInMarkers(): JSX.Element | null {
  const { api } = useHud();
  const ids = api.store.story?.value.turnIn ?? [];
  void api.store.frame.value; // follow the camera every frame
  const view = api.store.view.value;
  if (!ids.length || !view) return null;
  return (
    <div class="hud-turnins" aria-hidden="true">
      {ids.map((id) => {
        const e = view.get(id);
        const s = e ? api.store.worldToScreen(e.pos, 2.4) : null;
        return s ? (
          <span key={id} class="hud-turnin" style={{ left: `${s.x}px`, top: `${s.y}px` }}>
            ?
          </span>
        ) : null;
      })}
    </div>
  );
}
