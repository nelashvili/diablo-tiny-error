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

/** Gold chevron over the exit toward the objective, or an arrow on the screen edge pointing at it. */
/** Keep the edge arrow above the orbs and belt. */
const BOTTOM_HUD = 190;

export function GuideArrow(): JSX.Element | null {
  const { api } = useHud();
  const to = api.store.story?.value.guideTo;
  void api.store.frame.value;
  const view = api.store.view.value;
  if (!to || !view?.level || typeof window === 'undefined') return null;
  const exit = view.level.placements.find((p) => p.kind === 'exit' && p.ref === to);
  const me = view.localPlayerId != null ? view.get(view.localPlayerId) : undefined;
  if (!exit || !me) return null;
  const goal = { x: exit.pos.x + 0.5, y: exit.pos.y + 0.5 };
  const W = window.innerWidth;
  const H = window.innerHeight;
  const pad = 56;
  const s = api.store.worldToScreen(goal, 1.6);
  if (s && s.x >= pad && s.y >= pad && s.x <= W - pad && s.y <= H - pad) {
    return (
      <span
        class="hud-guide hud-guide--here"
        style={{ left: `${s.x}px`, top: `${s.y}px` }}
        aria-hidden="true"
      >
        ▼
      </span>
    );
  }
  // Off screen (the projection may not even reach it): aim along a short step toward the exit.
  const dx = goal.x - me.pos.x;
  const dy = goal.y - me.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const a = api.store.worldToScreen(me.pos);
  const b = api.store.worldToScreen({ x: me.pos.x + (dx / d) * 3, y: me.pos.y + (dy / d) * 3 });
  if (!a || !b) return null;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const cx = W / 2;
  const cy = H / 2;
  const k = Math.min((W / 2 - pad) / Math.abs(sx || 1e-6), (H / 2 - pad) / Math.abs(sy || 1e-6));
  const deg = (Math.atan2(sy, sx) * 180) / Math.PI;
  return (
    <span
      class="hud-guide"
      style={{
        left: `${cx + sx * k}px`,
        top: `${Math.min(cy + sy * k, H - BOTTOM_HUD)}px`,
        transform: `translate(-50%, -50%) rotate(${deg}deg)`,
      }}
      aria-hidden="true"
    >
      ➤
    </span>
  );
}
