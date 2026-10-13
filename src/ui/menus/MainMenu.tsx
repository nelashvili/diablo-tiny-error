/**
 * Title screen, character select, create-character flow and options. Pure UI: the caller owns
 * saves and starting the game.
 */
import { useState } from 'preact/hooks';
import { t } from '../../data/names';
import type { CharacterSave, Settings } from '../../core/save/types';
import type { ClassId } from '../../core/types';
import { CLASS_IDS } from '../../core/types';
import { Icon } from '../panels/icons';
import { OptionsForm } from '../panels/OptionsForm';
import { validName } from './nameRules';
import '../panels/panels.css';
import './menus.css';

export type CharacterSummary = Pick<CharacterSave, 'id' | 'name' | 'classId' | 'level' | 'updatedAt'>;

export interface MainMenuProps {
  characters: CharacterSummary[];
  settings: Settings;
  /** AccountSave.lastCharacterId: shows a "Continue" shortcut on the title screen. */
  lastCharacterId?: string;
  onPlay(id: string): void;
  onCreate(c: { name: string; classId: ClassId }): void;
  onDelete?(id: string): void;
  onUpdateSettings(patch: Partial<Settings>): void;
  version?: string;
  /** Start on a specific screen (dev/testing). */
  initialScreen?: Screen;
  /** Clock for "played N min ago" (injectable for tests). */
  now?: number;
}

export type Screen = 'title' | 'select' | 'create' | 'options';

export interface ClassCardInfo {
  id: ClassId;
  stars: 1 | 2 | 3;
  glyph: string;
  color: string;
}

/** Difficulty for a 9-year-old: melee is easiest, caster hardest. */
export const CLASS_CARDS: Record<ClassId, ClassCardInfo> = {
  yediKnight: { id: 'yediKnight', stars: 1, glyph: 'litesaber', color: '#4fc3ff' },
  bountyHuntur: { id: 'bountyHuntur', stars: 2, glyph: 'blasturRifle', color: '#ff9a3c' },
  forseAdept: { id: 'forseAdept', stars: 3, glyph: 'nova', color: '#d58cff' },
};

export { validName };

export function agoLabel(updatedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - updatedAt) / 60000));
  if (min < 1) return t('ui.mm.justNow');
  if (min < 60) return t('ui.mm.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('ui.mm.hoursAgo', { n: h });
  const d = Math.floor(h / 24);
  return d === 1 ? t('ui.mm.yesterday') : t('ui.mm.daysAgo', { n: d });
}

function Stars({ n }: { n: number }) {
  return (
    <span class="mm-stars" aria-label={`${n}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} class={i <= n ? 'on' : ''}>
          <Icon name="star" size={18} />
        </span>
      ))}
    </span>
  );
}

function Logo() {
  return (
    <div class="mm-logo">
      <div class="mm-logo-title">
        <span class="mm-logo-a">Diablo</span>{' '}
        <span class="mm-logo-b">
          Tiny Err<span class="mm-typo">o</span>r
        </span>
      </div>
      <div class="mm-logo-sub">{t('game.subtitle')}</div>
    </div>
  );
}

export function MainMenu(props: MainMenuProps) {
  const [screen, setScreen] = useState<Screen>(props.initialScreen ?? 'title');
  const [cls, setCls] = useState<ClassId>('yediKnight');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const now = props.now ?? Date.now();
  const chars = [...props.characters].sort((a, b) => b.updatedAt - a.updatedAt);
  const last = chars.find((c) => c.id === props.lastCharacterId) ?? null;
  const scale = { '--text-scale': props.settings.textScale };

  const randomName = () => {
    const list = t('ui.names.random').split(',');
    setName(list[Math.floor(Math.random() * list.length)] ?? 'Zip');
    setTouched(true);
  };

  let body;
  if (screen === 'title') {
    body = (
      <div class="mm-title">
        <Logo />
        <div class="mm-buttons">
          {last && (
            <button class="dte-btn primary big mm-continue" onClick={() => props.onPlay(last.id)}>
              <Icon name="movement" size={22} /> {last.name}
              <small>
                {t(`class.${last.classId}`)} · {t('ui.char.level', { n: last.level })}
              </small>
            </button>
          )}
          <button
            class={`dte-btn big ${last ? '' : 'primary'}`}
            onClick={() => setScreen(chars.length ? 'select' : 'create')}
          >
            {t('ui.mm.play')}
          </button>
          <button class="dte-btn big" onClick={() => setScreen('create')}>
            {t('ui.mm.newHero')}
          </button>
          <button class="dte-btn big ghost" onClick={() => setScreen('options')}>
            {t('ui.mm.options')}
          </button>
        </div>
        {props.version && <div class="mm-version">{t('ui.mm.version', { v: props.version })}</div>}
      </div>
    );
  } else if (screen === 'select') {
    body = (
      <div class="mm-screen">
        <MmHead title={t('ui.mm.chooseHero')} onBack={() => setScreen('title')} />
        <div class="mm-scroll">
          {chars.length === 0 && <div class="dte-empty">{t('ui.mm.noHeroes')}</div>}
          <ul class="mm-chars">
            {chars.map((c) => {
              const card = CLASS_CARDS[c.classId];
              return (
                <li key={c.id} class="mm-char" style={{ '--cc': card.color }}>
                  {confirmDel === c.id ? (
                    <div class="mm-confirm">
                      <span>{t('ui.mm.deleteConfirm', { name: c.name })}</span>
                      <button
                        class="dte-btn danger"
                        onClick={() => (props.onDelete?.(c.id), setConfirmDel(null))}
                      >
                        {t('ui.mm.yesDelete')}
                      </button>
                      <button class="dte-btn" onClick={() => setConfirmDel(null)}>
                        {t('ui.mm.cancel')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button class="mm-char-main" onClick={() => props.onPlay(c.id)}>
                        <span class="mm-emblem">
                          <Icon name={card.glyph} size={34} />
                        </span>
                        <span class="mm-char-text">
                          <b>{c.name}</b>
                          <span>
                            {t(`class.${c.classId}`)} · {t('ui.char.level', { n: c.level })}
                          </span>
                          <small>{t('ui.mm.lastPlayed', { when: agoLabel(c.updatedAt, now) })}</small>
                        </span>
                        <span class="mm-play">{t('ui.mm.play')} ›</span>
                      </button>
                      {props.onDelete && (
                        <button
                          class="dte-close mm-del"
                          aria-label={t('ui.mm.delete')}
                          onClick={() => setConfirmDel(c.id)}
                        >
                          <Icon name="close" size={18} />
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div class="mm-foot">
          <button class="dte-btn primary big" onClick={() => setScreen('create')}>
            + {t('ui.mm.newHero')}
          </button>
        </div>
      </div>
    );
  } else if (screen === 'create') {
    const ok = validName(name);
    body = (
      <div class="mm-screen">
        <MmHead title={t('ui.mm.createTitle')} onBack={() => setScreen(chars.length ? 'select' : 'title')} />
        <div class="mm-scroll">
          <div class="mm-classes" role="radiogroup" aria-label={t('ui.mm.pickClass')}>
            {CLASS_IDS.map((id) => {
              const card = CLASS_CARDS[id];
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={cls === id}
                  class={`mm-class ${cls === id ? 'sel' : ''}`}
                  style={{ '--cc': card.color }}
                  onClick={() => setCls(id)}
                >
                  <span class="mm-class-art">
                    <Icon name={card.glyph} size="60%" />
                  </span>
                  <b class="mm-class-name">{t(`class.${id}`)}</b>
                  <span class="mm-class-row">
                    <span>{t('ui.mm.role')}</span>
                    <em>{t(`ui.class.${id}.role`)}</em>
                  </span>
                  <span class="mm-class-row">
                    <span>{t('ui.mm.difficulty')}</span>
                    <Stars n={card.stars} />
                  </span>
                  <span class="mm-class-blurb">{t(`ui.class.${id}.blurb`)}</span>
                  <span class="mm-class-sig">
                    <small>{t('ui.mm.signature')}</small>
                    <b>{t(`ui.class.${id}.signature`)}</b>
                    <span>{t(`ui.class.${id}.signatureBlurb`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <form
          class="mm-name"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (ok) props.onCreate({ name: name.trim(), classId: cls });
          }}
        >
          <label>
            <span>{t('ui.mm.name')}</span>
            <input
              value={name}
              maxLength={15}
              placeholder={t('ui.mm.namePlaceholder')}
              autoComplete="off"
              spellcheck={false}
              onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
              onBlur={() => setTouched(true)}
            />
          </label>
          <button type="button" class="dte-btn" onClick={randomName}>
            {t('ui.mm.random')}
          </button>
          <button type="submit" class="dte-btn primary big" disabled={!ok}>
            {t('ui.mm.create')}
          </button>
          {touched && !ok && <div class="mm-err">{t('ui.mm.nameTooShort')}</div>}
        </form>
      </div>
    );
  } else {
    body = (
      <div class="mm-screen">
        <MmHead title={t('ui.mm.options')} onBack={() => setScreen('title')} />
        <div class="mm-scroll mm-options">
          <OptionsForm settings={props.settings} onChange={props.onUpdateSettings} />
        </div>
      </div>
    );
  }

  return (
    <div class={`dte-mainmenu s-${screen}`} style={scale}>
      <div class="mm-stars-bg" />
      <div class="mm-planet" />
      {body}
    </div>
  );
}

function MmHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header class="mm-head">
      <button class="dte-btn ghost" onClick={onBack}>
        ‹ {t('ui.back')}
      </button>
      <h1>{title}</h1>
      <span class="mm-head-logo">Diablo Tiny Error</span>
    </header>
  );
}
