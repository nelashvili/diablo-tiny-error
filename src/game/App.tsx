/**
 * Root overlay: main menu → loading → in-game (HUD, panels, touch controls).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '@/data/names';
import { Hud } from '@/ui/hud';
import { Panels } from '@/ui/panels';
import { MainMenu, OpeningCrawl, type CharacterSummary } from '@/ui/menus';
import { TouchControls } from '@/ui/touch';
import type { PanelDataSource } from '@/ui/panels/services';
import { itemValue } from '@/core/items/helpers';
import type { Game } from './Game';
import './app.css';

type Phase = 'menu' | 'loading' | 'playing';

/** Beating this quest (Count Dooky) ends Act I with the closing crawl. */
const ACT1_FINALE = 'a1q5';
const FINALE_DELAY_MS = 2500;

export function App({ game }: { game: Game }): JSX.Element {
  const [phase, setPhase] = useState<Phase>('menu');
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [lastId, setLastId] = useState<string | undefined>();
  /** Story crawl on screen: the intro for a new hero, the ending when Act I is won. */
  const [crawl, setCrawl] = useState<string | null>(null);
  const api = game.ui.api;
  useEffect(
    () =>
      api.onEvents((events) => {
        for (const e of events)
          if (e.type === 'questUpdated' && e.completed && e.questId === ACT1_FINALE)
            setTimeout(() => setCrawl('act1End'), FINALE_DELAY_MS); // let the boss kill land first
      }),
    [api],
  );

  const refresh = () =>
    void game.listCharacters().then((list) => {
      setChars(list);
      void game.lastCharacterId().then(setLastId);
    });
  useEffect(refresh, [game]);

  const data: PanelDataSource = useMemo(
    () => ({
      waypoints: () => game.waypointView(),
      dialogue: () => game.dialogueView(),
      vendor: () => game.vendorView(),
      quests: () => game.questView(),
      lore: () => game.loreView(),
      stash: () => game.stashView(),
    }),
    [game],
  );

  const services = useMemo(() => ({ itemIcon: game.itemIcons.get, price: itemValue }), [game]);

  const run = async (fn: () => Promise<unknown>) => {
    setPhase('loading');
    await fn();
    setPhase('playing');
  };

  return (
    <>
      {phase === 'playing' && <Hud api={api} />}
      {phase === 'playing' && game.isTouch && (
        <TouchControls api={api} ctx={game.inputCtx} showBelt={false} />
      )}
      {phase === 'playing' && (
        <Panels
          api={api}
          data={data}
          services={services}
          onQuitToMenu={() => {
            void game.quitToMenu().then(() => {
              refresh();
              setPhase('menu');
            });
          }}
        />
      )}
      {phase === 'menu' && (
        <MainMenu
          characters={chars}
          settings={api.store.settings.value}
          {...(lastId ? { lastCharacterId: lastId } : {})}
          onPlay={(id) => void run(() => game.loadCharacter(id))}
          onCreate={({ name, classId }) =>
            void run(() => game.newCharacter(classId, name)).then(() => setCrawl('crawl'))
          }
          onDelete={(id) => void game.deleteCharacter(id).then(refresh)}
          onUpdateSettings={(patch) => api.updateSettings(patch)}
          version="0.1"
        />
      )}
      {phase === 'playing' && crawl && <OpeningCrawl story={crawl} onDone={() => setCrawl(null)} />}
      {phase === 'loading' && <div class="g-loading">{t('game.start.loading')}</div>}
    </>
  );
}
