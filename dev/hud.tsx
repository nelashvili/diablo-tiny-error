/**
 * HUD dev harness: `npx vite` then open /dev/hud.html.
 * Query params: ?touch=1 (touch layout), ?map=1 (big map open), ?picker=left|right|hotkey,
 * ?t=<seconds> (fast-forward the scripted timeline — for screenshots), ?scale=1.25.
 */
import { render } from 'preact';
import '../src/ui/theme.css';
import { Hud } from '../src/ui/hud';
import { createMockApi } from '../src/ui/hud/dev/mock';
import { pickerState } from '../src/ui/hud/SkillBar';
import { isoProject } from '../src/ui/hud/minimapMath';

const q = new URLSearchParams(location.search);
const freezeAt = q.get('t');
const mock = createMockApi({ touch: q.get('touch') === '1', autoplay: freezeAt === null });
const { api, view, player } = mock;

if (q.get('scale')) api.updateSettings({ textScale: Number(q.get('scale')) });
if (q.get('map') === '1') api.togglePanel('map');

const root = document.getElementById('ui-root')!;
render(<Hud api={api} />, root);

const picker = q.get('picker');
if (picker === 'left' || picker === 'right') pickerState.value = { mode: picker };
if (picker === 'hotkey') pickerState.value = { mode: 'hotkey', slot: 6 };

if (freezeAt !== null) {
  // Fast-forward the timeline after the HUD has subscribed (effects run after first paint);
  // only the last second of events is emitted so the screen isn't flooded, then play on.
  setTimeout(() => {
    const target = Number(freezeAt);
    for (let s = 0; s < target; s += 1 / 25) mock.step(1 / 25, s < target - 1);
    mock.start();
  }, 50);
}

// Keyboard demo bindings (the real game gets these from ui/input).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    api.togglePanel('map');
  }
  if (/^[1-4]$/.test(e.key)) api.dispatch({ type: 'useBeltSlot', index: Number(e.key) - 1 });
});

// ------------------------------------------------------------ fake game backdrop
const canvas = document.getElementById('backdrop') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const css = getComputedStyle(document.documentElement);
const tok = (n: string) => css.getPropertyValue(n).trim();

function drawBackdrop() {
  const W = innerWidth;
  const H = innerHeight;
  const dpr = Math.min(devicePixelRatio, 2);
  if (canvas.width !== W * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, '#1d2a22');
  g.addColorStop(1, '#07080d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const lvl = view.level!;
  const tp = mock.tilePx * 2;
  for (let y = 0; y < lvl.map.height; y++)
    for (let x = 0; x < lvl.map.width; x++) {
      if (!lvl.map.walkable[y * lvl.map.width + x]) continue;
      const c = isoProject(x - player.pos.x, y - player.pos.y, tp);
      const sx = W / 2 + c.x;
      const sy = H / 2 + c.y;
      if (sx < -tp || sy < -tp || sx > W + tp || sy > H + tp) continue;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tp / 2, sy + tp / 4);
      ctx.lineTo(sx, sy + tp / 2);
      ctx.lineTo(sx - tp / 2, sy + tp / 4);
      ctx.closePath();
      ctx.fillStyle = (x + y) % 2 ? '#2c3d2c' : '#314532';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.stroke();
    }
  for (const e of view.all()) {
    if (e.kind !== 'monster' && e.kind !== 'player' && e.kind !== 'npc') continue;
    const s = api.store.worldToScreen(e.pos, 0)!;
    const color =
      e.kind === 'player' ? tok('--dmg-cryo') : e.kind === 'npc' ? tok('--q-set') : tok('--dmg-plasma');
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.fillRect(s.x - 12, s.y - 70, 24, 66);
    ctx.shadowBlur = 0;
  }
  requestAnimationFrame(drawBackdrop);
}
requestAnimationFrame(drawBackdrop);
