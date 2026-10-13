import { t } from '../../data/names';
import type { PlayerEntity } from '../../core/sim/entities';
import type { Difficulty } from '../../core/types';
import type { UiApi } from '../types';
import { HoldButton, PanelFrame } from './common';
import { ATTRS, pctLabel, range, resistTone, suggestStat, xpProgress, type AttrId } from './charLogic';
import { usePanelEnv } from './services';

const PENALTY: Record<Difficulty, number> = { normal: 0, veteran: -40, legend: -100 };
const RES = ['plasma', 'cryo', 'storm', 'toxin'] as const;
const MAXRES = {
  plasma: 'maxResPlasma',
  cryo: 'maxResCryo',
  storm: 'maxResStorm',
  toxin: 'maxResToxin',
} as const;

function Row({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div class={`dte-kv ${tone ?? ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function CharacterPanel(props: {
  api: UiApi;
  player: PlayerEntity;
  difficulty: Difficulty;
  onClose?: () => void;
}) {
  const { api, player: p, difficulty } = props;
  const { services } = usePanelEnv();
  const cls = services.classDef(p.classId);
  const st = p.stats;
  const settings = api.store.settings.value;
  const start = cls?.start ?? { strength: 0, dexterity: 0, vitality: 0, energy: 0 };
  const base = Object.fromEntries(ATTRS.map((a) => [a, start[a] + p.allocated[a]])) as Record<AttrId, number>;
  const hint =
    settings.showStatHints && p.statPointsUnspent > 0 ? suggestStat(p.classId, p.level, base) : null;
  const xp = xpProgress(p.xp, p.level, services.xpForLevel);
  const resource = cls ? t(cls.resourceName) : t('ui.resource');
  const raw = st.raw ?? {};
  const alloc = (stat: AttrId, amount: number) =>
    api.dispatch({ type: 'allocateStat', stat, amount: Math.min(amount, p.statPointsUnspent) });
  const sideInfo: Record<AttrId, [string, string][]> = {
    strength: [[t('ui.char.damage'), range(st.physMin, st.physMax)]],
    dexterity: [
      [t('ui.stat.attackRating'), `${Math.round(st.attackRating)}`],
      [t('ui.stat.defense'), `${Math.round(st.defense)}`],
    ],
    vitality: [
      [t('ui.char.life'), `${Math.round(p.life)} / ${Math.round(st.lifeMax)}`],
      [t('ui.char.stamina'), `${Math.round(p.stamina)} / ${Math.round(st.staminaMax)}`],
    ],
    energy: [[resource, `${Math.round(p.mana)} / ${Math.round(st.manaMax)}`]],
  };
  const elemental = (['plasma', 'cryo', 'storm', 'toxin', 'magic'] as const).filter(
    (k) => (st.elemental?.[k]?.max ?? 0) > 0,
  );
  const extras: [string, number, string][] = (
    [
      ['lifeSteal', '%'],
      ['manaSteal', '%'],
      ['crushingBlow', '%'],
      ['deadlyStrike', '%'],
      ['criticalStrike', '%'],
      ['magicFind', '%'],
      ['goldFind', '%'],
      ['damageReduced', ''],
      ['lifeRegen', '/s'],
      ['thorns', ''],
    ] as const
  )
    .map(([k, u]) => [t(`ui.stat.${k}`), raw[k] ?? 0, u] as [string, number, string])
    .filter(([, v]) => v !== 0);

  return (
    <PanelFrame id="character" title={t('ui.panel.character')} onClose={props.onClose}>
      <div class="dte-char-head">
        <div>
          <div class="dte-char-name">{p.name}</div>
          <div class="dte-char-class">
            {cls ? t(cls.name) : p.classId} · {t('ui.char.level', { n: p.level })}
          </div>
        </div>
        <div class="dte-xp">
          <div class="dte-xp-label">
            <span>{t('ui.char.xp')}</span>
            <b>{p.xp.toLocaleString()}</b>
          </div>
          <div class="dte-bar xp">
            <i style={{ width: `${xp.pct * 100}%` }} />
          </div>
          <div class="dte-dim small">{t('ui.char.xpNext', { n: xp.next.toLocaleString() })}</div>
        </div>
      </div>

      {p.statPointsUnspent > 0 && (
        <div class="dte-points-banner">
          <b>{t('ui.char.points', { n: p.statPointsUnspent })}</b>
          <span>{t('ui.char.pointsHint')}</span>
        </div>
      )}

      <div class="dte-attrs">
        {ATTRS.map((a) => {
          const boosted = Math.round(st[a]) > base[a];
          return (
            <div key={a} class={`dte-attr ${hint === a ? 'hint' : ''}`} title={t(`ui.attr.${a}.hint`)}>
              <div class="dte-attr-main">
                <span class="dte-attr-label">
                  {a === 'energy' ? resource : t(`ui.attr.${a}`)}
                  {hint === a && <span class="dte-pill">{t('ui.char.suggested')}</span>}
                </span>
                <b class={`dte-attr-val ${boosted ? 'boosted' : ''}`}>{Math.round(st[a])}</b>
                {p.statPointsUnspent > 0 && (
                  <HoldButton
                    class="dte-plus"
                    label={`+1 ${t(`ui.attr.${a}`)}`}
                    onTap={() => alloc(a, 1)}
                    onHold={() => alloc(a, 5)}
                  >
                    +
                  </HoldButton>
                )}
              </div>
              <div class="dte-attr-side">
                {sideInfo[a].map(([l, v]) => (
                  <Row key={l} label={l} value={v} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div class="dte-stat-cols">
        <div class="dte-stat-block">
          <h3>{t('ui.char.offense')}</h3>
          <Row label={t('ui.stat.attackRating')} value={Math.round(st.attackRating)} />
          <Row label={t('ui.char.damage')} value={range(st.physMin, st.physMax)} />
          {elemental.map((k) => (
            <Row
              key={k}
              tone={`el-${k}`}
              label={t(`dmg.${k}`)}
              value={range(st.elemental[k].min, st.elemental[k].max)}
            />
          ))}
          <Row label={t('ui.char.attackSpeed')} value={pctLabel(st.attackSpeedMul)} />
          <Row label={t('ui.char.castSpeed')} value={pctLabel(st.castSpeedMul)} />
        </div>
        <div class="dte-stat-block">
          <h3>{t('ui.char.defense')}</h3>
          <Row label={t('ui.stat.defense')} value={Math.round(st.defense)} />
          <Row label={t('ui.char.block')} value={`${Math.round(st.blockChance)}%`} />
          <Row label={t('ui.char.life')} value={`${Math.round(p.life)} / ${Math.round(st.lifeMax)}`} />
          <Row label={resource} value={`${Math.round(p.mana)} / ${Math.round(st.manaMax)}`} />
          <Row label={t('ui.char.moveSpeed')} value={pctLabel(st.moveSpeedMul)} />
          <Row label={t('ui.char.hitRecovery')} value={pctLabel(st.hitRecoveryMul)} />
        </div>
      </div>

      <div class="dte-stat-block">
        <h3>
          {t('ui.char.resists')}
          {PENALTY[difficulty] !== 0 && (
            <span class="dte-dim small">
              {' '}
              {t('ui.char.penalty', { difficulty: t(`difficulty.${difficulty}`), n: PENALTY[difficulty] })}
            </span>
          )}
        </h3>
        <div class="dte-res-row">
          {RES.map((r) => {
            const v = Math.round(st.res?.[r] ?? 0);
            const max = 75 + (raw[MAXRES[r]] ?? 0);
            return (
              <div key={r} class={`dte-res el-${r} tone-${resistTone(v, max)}`}>
                <span>{t(`ui.res.${r}`)}</span>
                <b>{v}%</b>
              </div>
            );
          })}
        </div>
      </div>

      {extras.length > 0 && (
        <div class="dte-stat-block">
          <h3>{t('ui.char.extra')}</h3>
          <div class="dte-extras">
            {extras.map(([l, v, u]) => (
              <Row key={l} label={l} value={`${Math.round(v * 10) / 10}${u}`} />
            ))}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
