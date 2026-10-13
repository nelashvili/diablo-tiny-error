import { bootstrap } from '@/game/bootstrap';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;
bootstrap(canvas, uiRoot);
