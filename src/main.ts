import { render, h } from 'preact';
import '@/ui/theme.css';
import { DB } from '@/data/db';
import { Game } from '@/game/Game';
import { App } from '@/game/App';
import { registerServiceWorker, preventZoomGestures } from '@/platform';

void DB; // load content tables (and their name files) up front

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  preventZoomGestures();
  const game = new Game(canvas);
  await game.init();
  game.start();
  render(h(App, { game }), uiRoot);
  (window as unknown as { __game?: Game }).__game = game;
  void registerServiceWorker();
}

void main();
