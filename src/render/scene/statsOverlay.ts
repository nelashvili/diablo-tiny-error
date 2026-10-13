/** Dev-only stats overlay (toggle with F3). */
export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  entities: number;
  entitiesDrawn: number;
  mapBatches: number;
  resolutionScale: number;
}

export class StatsOverlay {
  private el: HTMLDivElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private visible = false;
  private acc = 0;
  private frames = 0;

  constructor(private readonly parent: HTMLElement) {
    this.onKey = (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.visible && !this.el) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:8px;top:8px;padding:6px 8px;background:rgba(0,0,0,.65);color:#9f9;' +
        'font:11px/1.35 monospace;pointer-events:none;white-space:pre;z-index:50;border-radius:4px';
      this.parent.appendChild(el);
      this.el = el;
    }
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(dt: number, getStats: () => RenderStats): void {
    if (!this.visible || !this.el) return;
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return;
    const s = getStats();
    s.fps = this.frames / this.acc;
    s.frameMs = (this.acc / this.frames) * 1000;
    this.acc = 0;
    this.frames = 0;
    this.el.textContent =
      `fps ${s.fps.toFixed(0)}  (${s.frameMs.toFixed(1)} ms)\n` +
      `draw calls ${s.drawCalls}  tris ${s.triangles}\n` +
      `geo ${s.geometries}  tex ${s.textures}\n` +
      `entities ${s.entitiesDrawn}/${s.entities}  map batches ${s.mapBatches}\n` +
      `res scale ${s.resolutionScale.toFixed(2)}`;
  }

  dispose(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.el?.remove();
    this.el = null;
  }
}
