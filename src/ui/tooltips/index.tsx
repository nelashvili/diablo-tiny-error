/**
 * Tooltips: a positioned layer plus item and skill tooltip bodies.
 */
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../../data/names';
import type { ItemDescription, ItemLine } from '../../core/items/describe';
import type { UpgradeVerdict } from '../../core/items/upgrade';
import type { DefId } from '../../core/types';
import type { SkillDef } from '../../data/schema';
import { placeTooltip, type Rect, type Side } from './position';
import { skillLines, synergyTotals } from './skillLines';
import './tooltips.css';

export { placeTooltip } from './position';
export type { Rect } from './position';
export { skillLines } from './skillLines';

export interface TipAction {
  label: string;
  run: () => void;
  tone?: 'primary' | 'danger' | 'normal';
  disabled?: boolean;
}

/** Positions its children next to `anchor`, inside the viewport. */
export function TooltipLayer(props: {
  anchor: Rect;
  prefer?: Side[];
  pinned?: boolean;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = placeTooltip(
      props.anchor,
      { w: r.width, h: r.height },
      {
        w: window.innerWidth,
        h: window.innerHeight,
      },
      props.prefer,
    );
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    el.style.visibility = 'visible';
    el.dataset.side = p.side;
  });
  return (
    <div
      ref={ref}
      class={`dte-tip-layer ${props.pinned ? 'pinned' : ''}`}
      style={{ visibility: 'hidden' }}
      data-tooltip
    >
      {props.children}
    </div>
  );
}

function Actions({ actions }: { actions?: TipAction[] }) {
  if (!actions?.length) return null;
  return (
    <div class="dte-tip-actions">
      {actions.map((a) => (
        <button
          key={a.label}
          class={`dte-btn ${a.tone ?? 'normal'}`}
          disabled={a.disabled}
          onClick={(e) => {
            e.stopPropagation();
            a.run();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

const QUALITY_MARK: Record<string, string> = { magic: 'M', rare: 'R', set: 'S', unique: 'U', crafted: 'C' };

export function ItemTooltip(props: {
  desc: ItemDescription;
  header?: string;
  footer?: string;
  footerTone?: 'ok' | 'bad';
  actions?: TipAction[];
  colorblind?: boolean;
  /** Upgrade verdict vs the equipped item, with the stat changes it brings. */
  verdict?: UpgradeVerdict | null;
  deltas?: ItemLine[];
}) {
  const d = props.desc;
  return (
    <div class={`dte-tip dte-tip-item q-${d.quality}`}>
      {props.header && <div class="dte-tip-header">{props.header}</div>}
      <div class="dte-tip-name">
        {props.colorblind && QUALITY_MARK[d.quality] && (
          <span class="dte-tip-qmark">[{t(`ui.quality.${d.quality}`)}] </span>
        )}
        {d.name}
      </div>
      {d.baseName && <div class="dte-tip-base">{d.baseName}</div>}
      <div class="dte-tip-lines">
        {d.lines.map((l, i) => (
          <div key={i} class={`dte-tip-line s-${l.style}`}>
            {l.text}
          </div>
        ))}
      </div>
      {props.verdict && (
        <div class={`dte-tip-verdict v-${props.verdict}`}>
          <div class="dte-tip-verdict-title">{t(`ui.tip.verdict.${props.verdict}`)}</div>
          {props.deltas?.map((l, i) => (
            <div key={i} class={`dte-tip-line s-${l.style}`}>
              {l.style === 'better' ? '▲ ' : l.style === 'worse' ? '▼ ' : ''}
              {l.text}
            </div>
          ))}
        </div>
      )}
      {props.footer && <div class={`dte-tip-footer ${props.footerTone ?? ''}`}>{props.footer}</div>}
      <Actions actions={props.actions} />
    </div>
  );
}

/** Item tooltip with optional side-by-side comparison against equipped item(s). */
export function ItemCompareTooltip(props: {
  main: Parameters<typeof ItemTooltip>[0];
  compare?: ItemDescription[];
  colorblind?: boolean;
}) {
  return (
    <div class="dte-tip-compare">
      <ItemTooltip {...props.main} />
      {props.compare?.map((c, i) => (
        <ItemTooltip key={i} desc={c} header={t('ui.tip.compare')} colorblind={props.colorblind} />
      ))}
    </div>
  );
}

export interface SkillTooltipProps {
  skill: SkillDef;
  /** Hard points per skill id (for prereqs/synergies). */
  hard: Readonly<Record<DefId, number>>;
  bonus: number;
  charLevel: number;
  resourceName: string;
  treeName?: string;
  skillName: (id: DefId) => string;
  footer?: string;
  actions?: TipAction[];
}

export function SkillTooltip(p: SkillTooltipProps) {
  const s = p.skill;
  const hard = p.hard[s.id] ?? 0;
  const cur = hard > 0 || p.bonus > 0 ? hard + p.bonus : 0;
  const next = cur + 1;
  const levelOk = p.charLevel >= s.reqLevel;
  const curLines = skillLines(s, cur, p.hard, p.resourceName);
  const nextLines = hard < s.maxHardPoints ? skillLines(s, next, p.hard, p.resourceName) : [];
  const syn = synergyTotals(s, p.hard);
  return (
    <div class="dte-tip dte-tip-skill">
      <div class="dte-tip-name skill">{t(s.name)}</div>
      {p.treeName && <div class="dte-tip-base">{p.treeName}</div>}
      <div class="dte-tip-desc">{t(s.description)}</div>
      <div class={`dte-tip-line ${levelOk ? 's-reqOk' : 's-reqFail'}`}>
        {t('ui.skill.reqLevel', { n: s.reqLevel })}
      </div>
      {s.prereqs.map((id) => (
        <div key={id} class={`dte-tip-line ${(p.hard[id] ?? 0) > 0 ? 's-reqOk' : 's-reqFail'}`}>
          {t('ui.skill.needs', { skill: p.skillName(id) })}
        </div>
      ))}
      <div class="dte-tip-cols">
        <div class="dte-tip-col">
          <div class="dte-tip-sub">
            {cur > 0 ? t('ui.skill.current', { n: cur }) : t('ui.skill.notLearned')}
          </div>
          {curLines.map((l) => (
            <div key={l.key} class="dte-tip-kv">
              <span>{l.label}</span>
              <b class={l.element ? `el-${l.element}` : ''}>{l.value}</b>
            </div>
          ))}
        </div>
        {nextLines.length > 0 && (
          <div class="dte-tip-col next">
            <div class="dte-tip-sub">{t('ui.skill.next', { n: next })}</div>
            {nextLines.map((l) => (
              <div key={l.key} class="dte-tip-kv">
                <span>{l.label}</span>
                <b class={l.element ? `el-${l.element}` : ''}>{l.value}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      {(s.synergies?.length ?? 0) > 0 && (
        <div class="dte-tip-syn">
          <div class="dte-tip-sub">{t('ui.skill.synergies')}</div>
          {s.synergies!.map((sy, i) => (
            <div key={i} class={`dte-tip-line ${(p.hard[sy.from] ?? 0) > 0 ? 's-mod' : 's-dim'}`}>
              {t('ui.skill.synergy', {
                skill: p.skillName(sy.from),
                pct: sy.pctPerLevel,
                target: t(`dmg.${sy.target}`),
              })}
            </div>
          ))}
          {Object.entries(syn)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k} class="dte-tip-line s-better">
                +{v}% {t(`dmg.${k}`)}
              </div>
            ))}
        </div>
      )}
      {p.footer && <div class="dte-tip-footer">{p.footer}</div>}
      <Actions actions={p.actions} />
    </div>
  );
}
