/** Settings form shared by the in-game Options panel and the main menu. */
import { t } from '../../data/names';
import type { Settings } from '../../core/save/types';

function Seg<T extends string | number>(props: {
  label: string;
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="dte-opt">
      <span class="dte-opt-label">{props.label}</span>
      <div class="dte-seg" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={String(o.v)}
            role="radio"
            aria-checked={o.v === props.value}
            class={o.v === props.value ? 'on' : ''}
            onClick={() => props.onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider(props: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(props.value * 100);
  return (
    <label class="dte-opt">
      <span class="dte-opt-label">{props.label}</span>
      <span class="dte-slider">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          style={{ '--pct': `${pct}%` }}
          onInput={(e) => props.onChange(Number((e.currentTarget as HTMLInputElement).value) / 100)}
        />
        <b>{pct}</b>
      </span>
    </label>
  );
}

function Toggle(props: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="dte-opt">
      <span class="dte-opt-label">
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
      <button
        role="switch"
        aria-checked={props.value}
        aria-label={props.label}
        class={`dte-switch ${props.value ? 'on' : ''}`}
        onClick={() => props.onChange(!props.value)}
      >
        <i />
        <span>{props.value ? t('ui.on') : t('ui.off')}</span>
      </button>
    </div>
  );
}

export function OptionsForm({
  settings: s,
  onChange,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
}) {
  return (
    <div class="dte-options">
      <fieldset>
        <legend>{t('ui.opt.audio')}</legend>
        <Slider
          label={t('ui.opt.master')}
          value={s.masterVolume}
          onChange={(v) => onChange({ masterVolume: v })}
        />
        <Slider
          label={t('ui.opt.music')}
          value={s.musicVolume}
          onChange={(v) => onChange({ musicVolume: v })}
        />
        <Slider label={t('ui.opt.sfx')} value={s.sfxVolume} onChange={(v) => onChange({ sfxVolume: v })} />
      </fieldset>
      <fieldset>
        <legend>{t('ui.opt.controls')}</legend>
        <Seg
          label={t('ui.opt.movement')}
          value={s.movement}
          onChange={(v) => onChange({ movement: v })}
          options={(['auto', 'tapToMove', 'joystick'] as const).map((v) => ({
            v,
            label: t(`ui.opt.move.${v}`),
          }))}
        />
      </fieldset>
      <fieldset>
        <legend>{t('ui.opt.display')}</legend>
        <Seg
          label={t('ui.opt.textScale')}
          value={s.textScale}
          onChange={(v) => onChange({ textScale: v })}
          options={[
            { v: 0.9, label: t('ui.opt.text.small') },
            { v: 1, label: t('ui.opt.text.normal') },
            { v: 1.15, label: t('ui.opt.text.large') },
            { v: 1.3, label: t('ui.opt.text.huge') },
          ]}
        />
        <Seg
          label={t('ui.opt.colorblind')}
          value={s.colorblind}
          onChange={(v) => onChange({ colorblind: v })}
          options={(['none', 'protan', 'deutan', 'tritan'] as const).map((v) => ({
            v,
            label: t(`ui.opt.cb.${v}`),
          }))}
        />
        <Seg
          label={t('ui.opt.quality')}
          value={s.quality}
          onChange={(v) => onChange({ quality: v })}
          options={(['auto', 'low', 'medium', 'high'] as const).map((v) => ({
            v,
            label: t(`ui.opt.q.${v}`),
          }))}
        />
        <Toggle
          label={t('ui.opt.shake')}
          value={s.screenShake}
          onChange={(v) => onChange({ screenShake: v })}
        />
      </fieldset>
      <fieldset>
        <legend>{t('ui.opt.gameplay')}</legend>
        <Seg
          label={t('ui.opt.lootFilter')}
          value={s.lootFilter}
          onChange={(v) => onChange({ lootFilter: v })}
          options={(['all', 'hideInferior', 'hideNormal'] as const).map((v) => ({
            v,
            label: t(`ui.opt.loot.${v}`),
          }))}
        />
        <Toggle
          label={t('ui.opt.buildGuide')}
          hint={t('ui.opt.buildGuide.hint')}
          value={s.showBuildGuide}
          onChange={(v) => onChange({ showBuildGuide: v })}
        />
        <Toggle
          label={t('ui.opt.statHints')}
          hint={t('ui.opt.statHints.hint')}
          value={s.showStatHints}
          onChange={(v) => onChange({ showStatHints: v })}
        />
        <Toggle
          label={t('ui.opt.readAloud')}
          value={s.readAloud}
          onChange={(v) => onChange({ readAloud: v })}
        />
        <Seg
          label={t('ui.opt.session')}
          value={s.sessionTimerMin}
          onChange={(v) => onChange({ sessionTimerMin: v })}
          options={[0, 30, 45, 60, 90].map((v) => ({
            v,
            label: v === 0 ? t('ui.opt.session.off') : t('ui.opt.session.min', { n: v }),
          }))}
        />
      </fieldset>
    </div>
  );
}
