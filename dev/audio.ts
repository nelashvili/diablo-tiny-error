import { createAudioSystem, MOODS, PROCEDURAL_IDS } from '../src/audio';
import type { LoopHandle } from '../src/audio';
import type { GameEvent } from '../src/core/sim/events';
import VOICE_LINES from '../src/audio/voiceLines.gen';

const audio = createAudioSystem({});
audio.setListener({ x: 0, y: 0 });

const app = document.getElementById('app') as HTMLElement;
const volBox = document.getElementById('vol') as HTMLElement;

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  app.appendChild(h);
  const d = document.createElement('div');
  app.appendChild(d);
  return d;
}
function button(parent: HTMLElement, label: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => {
    audio.unlock();
    fn();
  });
  parent.appendChild(b);
}

const vols = { master: 0.8, music: 0.6, sfx: 0.9, voice: 0.9 };
for (const k of ['master', 'music', 'sfx', 'voice'] as const) {
  const l = document.createElement('label');
  l.textContent = `${k} `;
  const r = document.createElement('input');
  r.type = 'range';
  r.min = '0';
  r.max = '1';
  r.step = '0.05';
  r.value = String(vols[k]);
  r.addEventListener('input', () => {
    vols[k] = Number(r.value);
    audio.setVolumes(vols);
  });
  l.appendChild(r);
  volBox.appendChild(l);
}
audio.setVolumes(vols);

const sfx = section('Procedural SFX');
for (const id of PROCEDURAL_IDS) button(sfx, id, () => audio.playSfx(id));

const weapons = section('Weapons (A/B: new recipes)');
for (const id of [
  'blasturClassic',
  'blasturHeavy',
  'swingLight',
  'swingMedium',
  'swingHeavy',
  'swingVibro',
  'swingShock',
])
  button(weapons, id, () => audio.playSfx(id));
for (const id of ['hit', 'hitMetal'])
  button(weapons, `${id} + crit`, () => (audio.playSfx(id), audio.playSfx('hitCrit')));

const voices = section('Voice lines (music ducks while one plays)');
button(voices, 'stop', () => audio.speak([]));
for (const key of Object.keys(VOICE_LINES)) button(voices, key, () => audio.speak([key]));

const mus = section('Music moods (generative ambient)');
for (const m of MOODS) button(mus, m, () => audio.playMusic(m));
button(mus, 'stop', () => audio.playMusic(null));

const loops = section('Saber hum loop');
let hum: LoopHandle | null = null;
button(loops, 'start hum', () => {
  hum?.stop();
  hum = audio.startLoop('saberHum');
});
button(loops, 'swing (pitch up)', () => hum?.setIntensity(1));
button(loops, 'idle pitch', () => hum?.setIntensity(0));
button(loops, 'stop hum', () => {
  hum?.stop();
  hum = null;
});

const ev = section('Event storms');
const pos = { x: 2, y: 1 };
button(ev, '50 hits', () =>
  audio.handleEvents(
    Array.from({ length: 50 }, (): GameEvent => ({
      type: 'damage',
      targetId: 1,
      amount: 5,
      dtype: 'physical',
      crit: false,
      pos,
    })),
  ),
);
button(ev, 'droyd death', () =>
  audio.handleEvents([{ type: 'death', id: 1, pos, droyd: true, defId: 'battleDroyd' }]),
);
button(ev, 'level up', () => audio.handleEvents([{ type: 'levelUp', id: 1, level: 2 }]));
for (const q of ['normal', 'magic', 'rare', 'set', 'unique'])
  button(ev, `drop ${q}`, () => audio.handleEvents([{ type: 'itemDropped', id: 1, quality: q, pos }]));
button(ev, 'far away blastur (positional)', () => audio.playSfxAt('blastur', { x: 30, y: 0 }));
button(ev, 'right-side blastur', () => audio.playSfxAt('blastur', { x: 10, y: -2 }));
