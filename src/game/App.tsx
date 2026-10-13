/**
 * Root overlay: main menu → loading → in-game (HUD, panels, touch controls).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '@/data/names';
import { Hud } from '@/ui/hud';
import { Panels } from '@/ui/panels';
import { MainMenu, type CharacterSummary } from '@/ui/menus';
import { TouchControls } from '@/ui/touch';
import type { PanelDataSource } from '@/ui/panels/services';
import type { Game } from './Game';
import './app.css';

type Phase = 'menu' | 'loading' | 'playing';

export function App({ game }: { game: Game }): JSX.Element {
  const [phase, setPhase] = useState<Phase>('menu');
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [lastId, setLastId] = useState<string | undefined>();
  const api = game.ui.api;

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
    }),
    [game],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setPhase('loading');
    await fn();
    setPhase('playing');
  };

  return (
    <>
      {phase === 'playing' && <Hud api={api} />}
      {phase === 'playing' && game.isTouch && <TouchControls api={api} ctx={game.inputCtx} />}
      {phase === 'playing' && (
        <Panels
          api={api}
          data={data}
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
          onCreate={({ name, classId }) => void run(() => game.newCharacter(classId, name))}
          onDelete={(id) => void game.deleteCharacter(id).then(refresh)}
          onUpdateSettings={(patch) => api.updateSettings(patch)}
          version="0.1"
        />
      )}
      {phase === 'loading' && <div class="g-loading">{t('game.start.loading')}</div>}
    </>
  );
}
