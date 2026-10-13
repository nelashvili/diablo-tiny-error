import { useState } from 'preact/hooks';
import { t } from '../../data/names';
import type { PlayerEntity } from '../../core/sim/entities';
import type { SkillDef } from '../../data/schema';
import type { UiApi } from '../types';
import { PanelFrame, Tabs } from './common';
import { useCtl } from './ctl';
import { BUILD_GUIDES } from './buildGuide';
import { ELEMENT_VAR, Icon, skillGlyph } from './icons';
import { usePanelEnv } from './services';
import {
  buildGuideNext,
  guideIds,
  pointsInTree,
  skillBonus,
  skillStatus,
  TIER_LEVELS,
  treeConnectors,
  type SkillCtx,
} from './skillLogic';

const COLS = 3;
const ROWS = 6;

export function SkillTreePanel(props: { api: UiApi; player: PlayerEntity; onClose?: () => void }) {
  const { api, player: p } = props;
  const { services } = usePanelEnv();
  const ctl = useCtl();
  const cls = services.classDef(p.classId);
  const all = services.skillsForClass(p.classId);
  const trees = cls?.trees ?? [];
  const [treeIdx, setTreeIdx] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const tree = trees[treeIdx];
  const treeSkills = all.filter((s) => s.tree === tree?.id);
  const byId = new Map(all.map((s) => [s.id, s]));
  const ctx: SkillCtx = { charLevel: p.level, unspent: p.skillPointsUnspent, hard: p.skills };
  const settings = api.store.settings.value;
  const guide = settings.showBuildGuide ? BUILD_GUIDES[p.classId] : null;
  const next = guide ? buildGuideNext(guide, byId, ctx) : null;
  const inGuide = guide ? guideIds(guide) : new Set<string>();
  const conns = treeConnectors(treeSkills, p.skills);

  const tap = (s: SkillDef, e: PointerEvent, el: Element) => {
    const st = skillStatus(s, ctx);
    if (e.pointerType === 'mouse') {
      if (st.state === 'available') api.dispatch({ type: 'allocateSkill', skillId: s.id });
      return;
    }
    // Touch: first tap shows the card, second tap on the same skill learns it.
    if (armed === s.id && st.state === 'available') {
      api.dispatch({ type: 'allocateSkill', skillId: s.id });
      ctl.showTip({ kind: 'skill', skillId: s.id, touch: true }, el, true);
      return;
    }
    setArmed(s.id);
    ctl.showTip({ kind: 'skill', skillId: s.id, touch: true }, el, true);
  };

  return (
    <PanelFrame
      id="skills"
      title={t('ui.panel.skills')}
      onClose={props.onClose}
      headerExtra={
        p.skillPointsUnspent > 0 ? (
          <span class="dte-head-badge">{t('ui.skill.points', { n: p.skillPointsUnspent })}</span>
        ) : null
      }
    >
      <Tabs
        class="trees"
        value={treeIdx}
        onChange={(i) => {
          setTreeIdx(i);
          ctl.hideTip();
        }}
        tabs={trees.map((tr, i) => ({
          id: i,
          label: t(tr.name),
          badge: pointsInTree(
            all.filter((s) => s.tree === tr.id),
            p.skills,
          ),
        }))}
      />
      {p.skillPointsUnspent > 0 && <div class="dte-skill-hint">{t('ui.skill.pointsHint')}</div>}
      {treeSkills.length === 0 ? (
        <div class="dte-empty">{t('ui.skill.empty')}</div>
      ) : (
        <div class="dte-tree">
          <div class="dte-tree-tiers">
            {TIER_LEVELS.map((l) => (
              <span key={l} class={p.level >= l ? 'ok' : ''}>
                {t('ui.skill.tier', { n: l })}
              </span>
            ))}
          </div>
          <div class="dte-tree-grid">
            <svg
              class="dte-tree-lines"
              viewBox={`0 0 ${COLS * 100} ${ROWS * 100}`}
              preserveAspectRatio="none"
            >
              {conns.map((c) => (
                <line
                  key={`${c.fromId}-${c.toId}`}
                  class={c.met ? 'met' : ''}
                  x1={c.from.col * 100 + 50}
                  y1={c.from.row * 100 + 50}
                  x2={c.to.col * 100 + 50}
                  y2={c.to.row * 100 + 50}
                  vector-effect="non-scaling-stroke"
                />
              ))}
            </svg>
            {treeSkills.map((s) => {
              const st = skillStatus(s, ctx);
              const bonus = skillBonus(p.stats.skillBonus, s, st.hard);
              const el = s.element ?? 'physical';
              return (
                <button
                  key={s.id}
                  class={`dte-skill st-${st.state} ${next === s.id ? 'guide-next' : ''} ${inGuide.has(s.id) ? 'in-guide' : ''} ${armed === s.id ? 'armed' : ''}`}
                  style={{
                    gridColumn: s.ui.col + 1,
                    gridRow: s.ui.row + 1,
                    '--el': `var(${ELEMENT_VAR[el]})`,
                  }}
                  aria-label={t(s.name)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse')
                      ctl.showTip({ kind: 'skill', skillId: s.id, touch: false }, e.currentTarget, false);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse' && !ctl.tip.value?.pinned) ctl.hideTip();
                  }}
                  onPointerUp={(e) => tap(s, e, e.currentTarget)}
                >
                  <span class="dte-skill-icon">
                    <Icon name={skillGlyph(s)} size="62%" />
                    {st.state === 'locked' && (
                      <span class="dte-skill-lock">
                        <Icon name="lock" size={16} />
                      </span>
                    )}
                    {next === s.id && (
                      <span class="dte-skill-star" title={t('ui.skill.guideNext')}>
                        <Icon name="star" size={16} />
                      </span>
                    )}
                    <span class="dte-skill-pts">
                      {st.hard}
                      {bonus > 0 && <em> (+{bonus})</em>}
                    </span>
                  </span>
                  <span class="dte-skill-name">{t(s.name)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {guide && (
        <div class="dte-guide-legend">
          <Icon name="star" size={14} /> {t('ui.skill.guide')}: {next ? t(byId.get(next)!.name) : '—'}
        </div>
      )}
    </PanelFrame>
  );
}
