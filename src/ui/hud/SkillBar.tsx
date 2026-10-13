/**
 * Left/right skill buttons, F1–F8 hotkey row, and the skill picker popover.
 * Cooldown sweep = conic-gradient driven by the `--cd` custom property; skills you can't
 * afford are dimmed with a resource-colored warning edge.
 */
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { signal, type Signal } from '@preact/signals';
import { t } from '../../data/names';
import { useHud } from './context';
import { SkillIcon } from './icons';
import { pickableSkills, skillInfo, skillManaCost } from './lookup';
import { formatInt } from './format';

export type PickerMode = { mode: 'left' } | { mode: 'right' } | { mode: 'hotkey'; slot: number };

/** Shared so the hotkey row and skill buttons can open the same popover. */
export const pickerState: Signal<PickerMode | null> = signal(null);

function togglePicker(m: PickerMode): void {
  const cur = pickerState.value;
  const same =
    cur && cur.mode === m.mode && (cur.mode !== 'hotkey' || (m.mode === 'hotkey' && cur.slot === m.slot));
  pickerState.value = same ? null : m;
}

function useSkillState(id: string | null): { cd: number; poor: boolean } {
  const { model } = useHud();
  if (!id) return { cd: 0, poor: false };
  const cd = model.cooldowns.value[id] ?? 0;
  const lvl = model.skillLevels.value[id] ?? 1;
  const poor = skillManaCost(id, lvl) > model.mana.value;
  return { cd, poor };
}

export function SkillButton({ hand }: { hand: 'left' | 'right' }): JSX.Element {
  const { model } = useHud();
  const id = hand === 'left' ? model.leftSkill.value : model.rightSkill.value;
  const { cd, poor } = useSkillState(id);
  const open = pickerState.value?.mode === hand;
  const name = id ? skillInfo(id).name : '';
  return (
    <button
      type="button"
      class={`hud-skillbtn hud-skillbtn--${hand}${poor ? ' is-poor' : ''}${cd > 0 ? ' is-cd' : ''}${open ? ' is-open' : ''}`}
      style={{ '--cd': cd } as JSX.CSSProperties}
      aria-label={`${t(hand === 'left' ? 'hud.skill.left' : 'hud.skill.right')}: ${name}`}
      aria-expanded={open}
      title={name}
      onClick={() => togglePicker({ mode: hand })}
    >
      {id ? <SkillIcon id={id} /> : null}
      <span class="hud-cd" />
      <span class="hud-keyhint">{t(hand === 'left' ? 'hud.mouseLeft' : 'hud.mouseRight')}</span>
    </button>
  );
}

function HotkeySlot({ slot }: { slot: number }): JSX.Element {
  const { model } = useHud();
  const id = model.hotkeys.value[slot] ?? null;
  const { cd, poor } = useSkillState(id);
  const active = id !== null && id === model.rightSkill.value;
  const open = pickerState.value?.mode === 'hotkey' && (pickerState.value as { slot: number }).slot === slot;
  return (
    <button
      type="button"
      class={`hud-hotkey${id ? '' : ' is-empty'}${poor ? ' is-poor' : ''}${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
      style={{ '--cd': cd } as JSX.CSSProperties}
      title={id ? skillInfo(id).name : t('hud.skill.pickHotkey', { key: `F${slot + 1}` })}
      onClick={() => togglePicker({ mode: 'hotkey', slot })}
    >
      {id ? <SkillIcon id={id} /> : null}
      <span class="hud-cd" />
      <span class="hud-keyhint">F{slot + 1}</span>
    </button>
  );
}

export function HotkeyRow(): JSX.Element {
  return (
    <div class="hud-hotkeys">
      {Array.from({ length: 8 }, (_, i) => (
        <HotkeySlot key={i} slot={i} />
      ))}
    </div>
  );
}

export function SkillPicker(): JSX.Element | null {
  const { model, api } = useHud();
  const state = pickerState.value;
  const ref = useRef<HTMLDivElement>(null);
  const hoverId = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pickerState.value = null;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const m = /^F([1-8])$/.exec(e.key);
      if (m && hoverId.current) {
        api.dispatch({ type: 'bindHotkey', slot: Number(m[1]) - 1, skillId: hoverId.current });
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (ref.current && el && !ref.current.contains(el) && !el.closest('.hud-skillbtn,.hud-hotkey'))
        pickerState.value = null;
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [state, api]);

  if (!state) return null;
  const p = model.player();
  if (!p) return null;
  const hand = state.mode === 'hotkey' ? 'hotkey' : state.mode;
  const skills = pickableSkills(p, hand);
  const hotkeys = model.hotkeys.value;
  const levels = model.skillLevels.value;
  const mana = model.mana.value;
  const resource = model.resource.value;
  const current =
    state.mode === 'left'
      ? p.leftSkill
      : state.mode === 'right'
        ? p.rightSkill
        : (hotkeys[state.slot] ?? null);
  const title =
    state.mode === 'left'
      ? t('hud.skill.pickLeft')
      : state.mode === 'right'
        ? t('hud.skill.pickRight')
        : t('hud.skill.pickHotkey', { key: `F${state.slot + 1}` });

  const choose = (id: string) => {
    if (state.mode === 'hotkey') api.dispatch({ type: 'bindHotkey', slot: state.slot, skillId: id });
    else api.dispatch({ type: 'selectSkill', hand: state.mode, skillId: id });
    pickerState.value = null;
  };

  return (
    <div class={`hud-picker hud-picker--${state.mode} hud-panel`} ref={ref} role="dialog" aria-label={title}>
      <div class="hud-picker__head">
        <span class="hud-picker__title">{title}</span>
        {state.mode === 'hotkey' && hotkeys[state.slot] ? (
          <button
            type="button"
            class="hud-picker__clear"
            onClick={() => {
              api.dispatch({ type: 'bindHotkey', slot: state.slot, skillId: null });
              pickerState.value = null;
            }}
          >
            {t('hud.skill.clear')}
          </button>
        ) : null}
      </div>
      {skills.length === 0 ? (
        <div class="hud-picker__empty">{t('hud.skill.none')}</div>
      ) : (
        <div class="hud-picker__grid">
          {skills.map((id) => {
            const info = skillInfo(id);
            const lvl = levels[id] ?? 0;
            const cost = skillManaCost(id, Math.max(1, lvl));
            const bound = hotkeys.indexOf(id);
            return (
              <button
                type="button"
                key={id}
                class={`hud-picker__item${id === current ? ' is-current' : ''}${cost > mana ? ' is-poor' : ''}`}
                onClick={() => choose(id)}
                onPointerEnter={() => (hoverId.current = id)}
                onPointerLeave={() => hoverId.current === id && (hoverId.current = null)}
                onFocus={() => (hoverId.current = id)}
              >
                <SkillIcon id={id} />
                <span class="hud-picker__text">
                  <span class="hud-picker__name">{info.name}</span>
                  <span class="hud-picker__meta">
                    {lvl > 0 ? `${t('hud.skill.lvl', { level: lvl })} · ` : ''}
                    {cost > 0
                      ? t('hud.skill.cost', { cost: formatInt(cost), resource })
                      : t('hud.skill.free')}
                  </span>
                </span>
                {bound >= 0 ? <span class="hud-picker__bound">F{bound + 1}</span> : null}
              </button>
            );
          })}
        </div>
      )}
      {!api.store.isTouch.value ? <div class="hud-picker__hint">{t('hud.skill.bindHint')}</div> : null}
    </div>
  );
}
