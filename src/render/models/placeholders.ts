/** Procedural low-poly stand-ins: humanoids (heroes/npcs/droyds/creatures), world objects and item shapes. */
import * as THREE from 'three';
import type { ActorMode } from '../../core/sim/entities';
import type { ModelEntry } from '../types';
import { classifyItem, classifyModelId, computePose, makePose, type ItemKind } from './helpers';
import { mk, shade, unit, type AttachSlot, type Rig } from './rig';
import { glowMaterial, toonMaterial } from './toon';

type Placeholder = ModelEntry['placeholder'];

const SKIN = 0xe0b48c;
const METAL = 0x8a929c;
const DARK = 0x2a2d36;

// ------------------------------------------------------------------ humanoids

type Style = 'hero' | 'npc' | 'droyd' | 'organic';

class HumanoidRig implements Rig {
  readonly root = new THREE.Group();
  readonly bodyMeshes: THREE.Mesh[] = [];
  readonly handTilt = 1.1;
  private readonly hips = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly handR = new THREE.Object3D();
  private readonly handL = new THREE.Object3D();
  private readonly headSock = new THREE.Object3D();
  private readonly chestSock = new THREE.Object3D();
  private readonly pose = makePose();
  private readonly hipY: number;

  constructor(ph: Placeholder, style: Style, accent: number | undefined, shape: Placeholder['shape']) {
    const H = ph.height;
    const R = ph.radius;
    const organic = style === 'organic';
    const droyd = style === 'droyd';
    const legLen = H * (organic ? 0.24 : 0.4);
    const torsoH = H * (organic ? 0.52 : 0.34);
    const torsoW = Math.max(R * 1.6, H * 0.2) * (organic ? 1.5 : 1);
    const torsoD = torsoW * (organic ? 1.0 : 0.62);
    const headS = H * (organic ? 0.28 : 0.2);
    const armLen = H * (organic ? 0.24 : 0.32);
    const armW = droyd ? 0.05 * H : organic ? 0.075 * H : 0.04 * H;
    this.hipY = legLen;

    const base = ph.color;
    const matMain = toonMaterial(base);
    const matDark = toonMaterial(droyd ? DARK : shade(base, 0.45));
    const matLimb = toonMaterial(droyd ? METAL : shade(base, organic ? 0.85 : 0.7));
    const matSkin = toonMaterial(style === 'hero' || style === 'npc' ? SKIN : shade(base, 1.15));
    const eyeColor = accent ?? (droyd ? 0xff3030 : 0xffd23f);
    const matEye = glowMaterial(eyeColor);

    const add = (parent: THREE.Object3D, m: THREE.Mesh, body = true) => {
      parent.add(m);
      if (body) this.bodyMeshes.push(m);
      return m;
    };

    // legs
    const legX = torsoW * 0.26;
    for (const [leg, sx] of [
      [this.legR, -1],
      [this.legL, 1],
    ] as const) {
      leg.position.set(sx * legX, legLen, 0);
      if (droyd) {
        add(leg, mk(unit.box(), matLimb, armW * 1.6, legLen, armW * 1.6, 0, -legLen / 2, 0));
        add(
          leg,
          mk(
            unit.box(),
            matDark,
            armW * 2.2,
            legLen * 0.18,
            armW * 3.2,
            0,
            -legLen + legLen * 0.09,
            armW * 0.5,
          ),
        );
      } else if (organic) {
        add(leg, mk(unit.sphere(), matLimb, torsoW * 0.42, legLen * 1.6, torsoW * 0.5, 0, -legLen * 0.45, 0));
      } else {
        add(leg, mk(unit.cylinder(), matDark, armW * 2, legLen, armW * 2, 0, -legLen / 2, 0));
        add(
          leg,
          mk(unit.box(), matDark, armW * 2.4, legLen * 0.14, armW * 4, 0, -legLen + legLen * 0.07, armW),
        );
      }
      this.root.add(leg);
    }

    // hips group (torso + head + arms)
    this.hips.position.y = legLen;
    this.root.add(this.hips);
    const torsoCy = torsoH / 2;

    if (droyd) {
      add(this.hips, mk(unit.box(), matMain, torsoW, torsoH, torsoD, 0, torsoCy, 0));
      add(
        this.hips,
        mk(unit.box(), matDark, torsoW * 0.7, torsoH * 0.4, torsoD * 1.05, 0, torsoCy + torsoH * 0.05, 0),
      );
      add(
        this.hips,
        mk(unit.box(), matLimb, torsoW * 0.5, torsoH * 0.18, torsoD * 0.6, 0, -torsoH * 0.04, 0),
      );
    } else if (organic) {
      const body =
        shape === 'cone'
          ? mk(unit.cone(), matMain, torsoW * 1.25, torsoH * 1.25, torsoD * 1.25, 0, torsoCy, 0)
          : shape === 'box'
            ? mk(unit.box(), matMain, torsoW, torsoH, torsoD, 0, torsoCy, 0)
            : mk(unit.sphere(), matMain, torsoW * 1.15, torsoH * 1.1, torsoD * 1.3, 0, torsoCy, 0);
      add(this.hips, body);
      add(
        this.hips,
        mk(unit.sphere(), matDark, torsoW * 0.7, torsoH * 0.5, torsoD * 0.5, 0, torsoCy * 0.7, torsoD * 0.45),
      );
    } else {
      add(this.hips, mk(unit.taper(), matMain, torsoW, torsoH, torsoD, 0, torsoCy, 0));
      add(
        this.hips,
        mk(unit.cylinder(), matDark, torsoW * 0.95, torsoH * 0.12, torsoD * 1.0, 0, torsoH * 0.06, 0),
      );
      if (accent !== undefined) {
        add(
          this.hips,
          mk(
            unit.gem(),
            matEye,
            torsoW * 0.18,
            torsoW * 0.18,
            torsoW * 0.1,
            0,
            torsoCy + torsoH * 0.1,
            torsoD * 0.5,
          ),
          false,
        );
      }
    }

    // head
    const headY = torsoH + headS * (organic ? 0.35 : 0.55);
    const headZ = organic ? torsoD * 0.35 : 0;
    if (droyd) {
      add(this.hips, mk(unit.box(), matLimb, headS * 1.2, headS * 0.9, headS * 1.0, 0, headY, 0));
      add(
        this.hips,
        mk(unit.box(), matEye, headS * 0.8, headS * 0.18, headS * 0.1, 0, headY + headS * 0.05, headS * 0.52),
        false,
      );
      add(
        this.hips,
        mk(
          unit.cylinder(),
          matDark,
          headS * 0.05,
          headS * 0.7,
          headS * 0.05,
          headS * 0.4,
          headY + headS * 0.7,
          0,
        ),
      );
    } else if (organic) {
      add(this.hips, mk(unit.sphere(), matMain, headS * 1.3, headS * 1.1, headS * 1.3, 0, headY, headZ));
      for (const sx of [-1, 1]) {
        add(
          this.hips,
          mk(
            unit.sphere(),
            matEye,
            headS * 0.22,
            headS * 0.22,
            headS * 0.12,
            sx * headS * 0.3,
            headY + headS * 0.1,
            headZ + headS * 0.6,
          ),
          false,
        );
      }
      if (shape === 'cone') {
        for (const sx of [-1, 1]) {
          add(
            this.hips,
            mk(
              unit.cone(),
              matDark,
              headS * 0.25,
              headS * 0.7,
              headS * 0.25,
              sx * headS * 0.45,
              headY + headS * 0.7,
              headZ,
            ),
          );
        }
      }
    } else {
      add(this.hips, mk(unit.sphere(), matSkin, headS, headS * 1.1, headS, 0, headY, 0));
      if (style === 'hero') {
        add(
          this.hips,
          mk(
            unit.dome(),
            matDark,
            headS * 1.1,
            headS * 0.75,
            headS * 1.1,
            0,
            headY + headS * 0.1,
            -headS * 0.04,
          ),
        );
      } else {
        add(
          this.hips,
          mk(unit.cone(), matDark, headS * 1.3, headS * 0.9, headS * 1.3, 0, headY + headS * 0.7, 0),
        );
      }
      for (const sx of [-1, 1]) {
        add(
          this.hips,
          mk(
            unit.sphere(),
            toonMaterial(0x202020),
            headS * 0.1,
            headS * 0.1,
            headS * 0.08,
            sx * headS * 0.2,
            headY,
            headS * 0.46,
          ),
          false,
        );
      }
    }
    this.headSock.position.set(0, headY + headS * 0.5, 0);
    this.hips.add(this.headSock);
    this.chestSock.position.set(0, torsoCy, 0);
    this.hips.add(this.chestSock);

    // arms
    const shoulderX = torsoW / 2 + armW * (organic ? 0.4 : 1.0);
    const shoulderY = torsoH - Math.min(0.06, armW);
    for (const [arm, hand, sx] of [
      [this.armR, this.handR, -1],
      [this.armL, this.handL, 1],
    ] as const) {
      arm.position.set(sx * shoulderX, shoulderY, 0);
      if (droyd) {
        add(arm, mk(unit.sphere(), matDark, armW * 1.6, armW * 1.6, armW * 1.6, 0, 0, 0));
        add(arm, mk(unit.box(), matLimb, armW, armLen, armW, 0, -armLen / 2, 0));
        add(arm, mk(unit.box(), matDark, armW * 1.5, armW * 1.5, armW * 1.5, 0, -armLen, 0));
      } else if (organic) {
        add(arm, mk(unit.sphere(), matLimb, armW * 1.3, armLen * 1.7, armW * 1.3, 0, -armLen * 0.45, 0));
        add(arm, mk(unit.cone(), matDark, armW * 0.8, armW * 1.8, armW * 0.8, 0, -armLen * 1.05, 0));
      } else {
        add(arm, mk(unit.sphere(), matMain, armW * 2.6, armW * 2.2, armW * 2.6, 0, 0, 0));
        add(arm, mk(unit.cylinder(), matLimb, armW * 1.8, armLen, armW * 1.8, 0, -armLen / 2, 0));
        add(arm, mk(unit.sphere(), matSkin, armW * 1.7, armW * 1.7, armW * 1.7, 0, -armLen, 0));
      }
      hand.position.set(0, -armLen, 0);
      arm.add(hand);
      this.hips.add(arm);
    }
  }

  setMode(mode: ActorMode, t: number, speedMul: number): void {
    const p = computePose(mode, t, speedMul, this.pose);
    this.hips.position.y = this.hipY + p.bob;
    this.hips.rotation.set(p.lean, p.twist, 0);
    this.hips.scale.set(1, 1 + p.breathe, 1);
    this.armR.rotation.x = p.armR;
    this.armL.rotation.x = p.armL;
    this.legR.rotation.x = p.legR;
    this.legL.rotation.x = p.legL;
    this.root.position.y = -p.sink;
    this.root.rotation.z = p.roll;
    this.root.scale.setScalar(p.scale);
  }

  update(): void {}

  socket(slot: AttachSlot): THREE.Object3D {
    switch (slot) {
      case 'mainHand':
        return this.handR;
      case 'offHand':
        return this.handL;
      case 'head':
        return this.headSock;
      default:
        return this.chestSock;
    }
  }

  dispose(): void {}
}

// ------------------------------------------------------------------ objects

const OBJ_ACCENT = 0x4fc3ff;

class ObjectRig implements Rig {
  readonly root = new THREE.Group();
  readonly bodyMeshes: THREE.Mesh[] = [];
  readonly handTilt = 0;
  private time = 0;
  private openness = 0;
  private target = 0;
  private lid: THREE.Object3D | null = null;
  private spinners: { o: THREE.Object3D; speed: number; axis: 'y' | 'z' }[] = [];
  private pulsers: { o: THREE.Object3D; bx: number; by: number; bz: number; amp: number; speed: number }[] =
    [];
  private pulse(o: THREE.Object3D, amp: number, speed: number) {
    this.pulsers.push({ o, bx: o.scale.x, by: o.scale.y, bz: o.scale.z, amp, speed });
  }
  private readonly top = new THREE.Object3D();

  constructor(
    private readonly kind: string,
    ph: Placeholder,
    accent: number | undefined,
  ) {
    const ac = accent ?? OBJ_ACCENT;
    const glow = glowMaterial(ac, 0.9);
    const glowSoft = glowMaterial(ac, 0.35, true);
    const stone = toonMaterial(0x6c717c);
    const stoneDark = toonMaterial(0x3b3f48);
    const body = (m: THREE.Mesh) => {
      this.root.add(m);
      this.bodyMeshes.push(m);
      return m;
    };
    const k = this.kind;
    if (k.includes('waypoint')) {
      body(mk(unit.cylinder(), stone, 1.5, 0.12, 1.5, 0, 0.06, 0));
      body(mk(unit.cylinder(), stoneDark, 1.0, 0.16, 1.0, 0, 0.17, 0));
      const disc = mk(unit.cylinder(), glow, 0.85, 0.02, 0.85, 0, 0.26, 0);
      this.root.add(disc);
      this.pulse(disc, 0.08, 3);
      for (let i = 0; i < 3; i++) {
        const wrap = new THREE.Group();
        wrap.position.set(0, 0.7 + i * 0.35, 0);
        const sc = 0.95 - i * 0.12;
        wrap.add(mk(unit.torus(), glow, sc, sc, sc));
        this.root.add(wrap);
        this.spinners.push({ o: wrap, speed: (i % 2 ? -1 : 1) * (1.2 + i * 0.4), axis: 'y' });
      }
      const beam = mk(unit.cylinder(), glowSoft, 0.8, 2.6, 0.8, 0, 1.5, 0);
      this.root.add(beam);
      this.pulse(beam, 0.1, 2);
      for (const a of [0, 1, 2, 3]) {
        const pil = body(
          mk(
            unit.box(),
            stoneDark,
            0.14,
            0.7,
            0.14,
            Math.cos((a * Math.PI) / 2) * 0.62,
            0.45,
            Math.sin((a * Math.PI) / 2) * 0.62,
          ),
        );
        pil.rotation.y = a;
      }
    } else if (k.includes('chest')) {
      const wood = toonMaterial(0x8a5a2b);
      const band = toonMaterial(0xc9a24a);
      body(mk(unit.box(), wood, 0.9, 0.5, 0.6, 0, 0.25, 0));
      body(mk(unit.box(), band, 0.94, 0.08, 0.64, 0, 0.3, 0));
      const lid = new THREE.Group();
      lid.position.set(0, 0.5, -0.3);
      const lidMesh = mk(unit.box(), wood, 0.9, 0.22, 0.6, 0, 0.11, 0.3);
      const lidBand = mk(unit.box(), band, 0.94, 0.06, 0.64, 0, 0.14, 0.3);
      lid.add(lidMesh, lidBand);
      this.bodyMeshes.push(lidMesh, lidBand);
      this.root.add(lid);
      this.lid = lid;
      body(mk(unit.box(), glow, 0.12, 0.12, 0.05, 0, 0.45, 0.32)).userData.noTint = true;
    } else if (k.includes('stash')) {
      body(mk(unit.box(), stone, 0.9, 1.1, 0.6, 0, 0.55, 0));
      body(mk(unit.box(), stoneDark, 0.95, 0.12, 0.65, 0, 1.12, 0));
      const panel = mk(unit.box(), glow, 0.6, 0.5, 0.04, 0, 0.65, 0.31);
      panel.userData.noTint = true;
      this.root.add(panel);
      this.pulse(panel, 0.05, 2.4);
      body(mk(unit.box(), stoneDark, 0.5, 0.1, 0.05, 0, 0.3, 0.31));
    } else if (k.includes('portal')) {
      const frame = mk(unit.torus(), glow, 1.6, 1.6, 1.6, 0, 1.0, 0);
      this.root.add(frame);
      const swirl = mk(unit.cylinder(), glowSoft, 1.3, 0.02, 1.3, 0, 1.0, 0);
      swirl.rotation.x = Math.PI / 2;
      this.root.add(swirl);
      this.pulse(swirl, 0.1, 4);
      const orbit = new THREE.Group();
      orbit.position.y = 1.0;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        orbit.add(mk(unit.sphere(), glow, 0.12, 0.12, 0.12, Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0));
      }
      this.root.add(orbit);
      this.spinners.push({ o: orbit, speed: 2.5, axis: 'z' });
      body(mk(unit.cylinder(), stoneDark, 1.2, 0.1, 1.2, 0, 0.05, 0));
    } else if (k.includes('shrine')) {
      body(mk(unit.cylinder(), stone, 0.8, 0.5, 0.8, 0, 0.25, 0));
      body(mk(unit.cylinder(), stoneDark, 0.55, 0.3, 0.55, 0, 0.65, 0));
      const gem = mk(unit.gem(), glow, 0.4, 0.55, 0.4, 0, 1.2, 0);
      this.root.add(gem);
      this.spinners.push({ o: gem, speed: 1.4, axis: 'y' });
      this.pulse(gem, 0.1, 3);
      this.root.add(mk(unit.sphere(), glowSoft, 0.9, 0.9, 0.9, 0, 1.2, 0));
    } else {
      const m = toonMaterial(ph.color);
      body(mk(unit.box(), m, ph.radius * 2, ph.height, ph.radius * 2, 0, ph.height / 2, 0));
      body(
        mk(unit.box(), stoneDark, ph.radius * 2.2, ph.height * 0.1, ph.radius * 2.2, 0, ph.height * 0.05, 0),
      );
    }
    this.top.position.set(0, ph.height, 0);
    this.root.add(this.top);
  }

  setMode(mode: ActorMode): void {
    this.target = mode === 'idle' || mode === 'walk' || mode === 'run' ? 0 : 1;
  }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.spinners) s.o.rotation[s.axis] += dt * s.speed;
    for (const p of this.pulsers) {
      const v = 1 + Math.sin(this.time * p.speed) * p.amp;
      p.o.scale.set(p.bx * v, p.by, p.bz * v);
    }
    if (this.lid) {
      const d = this.target - this.openness;
      this.openness += Math.sign(d) * Math.min(Math.abs(d), dt * 4);
      this.lid.rotation.x = -this.openness * 1.8;
    }
  }

  socket(): THREE.Object3D {
    return this.top;
  }

  dispose(): void {}
}

// ------------------------------------------------------------------ items

/**
 * Item/equipment shape with its long axis along +Y, centered on the grip/center.
 * Not for litesabers (see litesaber.ts). Materials are shared; nothing to dispose.
 */
export function buildItemShape(kind: ItemKind, color: number, accent?: number): THREE.Group {
  const g = new THREE.Group();
  const main = toonMaterial(color);
  const metal = toonMaterial(METAL);
  const dark = toonMaterial(DARK);
  const glow = glowMaterial(accent ?? 0x4fc3ff);
  switch (kind) {
    case 'blade':
      g.add(mk(unit.cylinder(), dark, 0.05, 0.22, 0.05, 0, -0.05, 0));
      g.add(mk(unit.box(), main, 0.22, 0.04, 0.07, 0, 0.07, 0));
      g.add(mk(unit.box(), metal, 0.07, 0.7, 0.025, 0, 0.44, 0));
      g.add(mk(unit.cone(), metal, 0.07, 0.12, 0.025, 0, 0.85, 0));
      break;
    case 'spear':
      // Electro-pike: dark shaft, grip wraps, and glowing emitter heads at both ends.
      g.add(mk(unit.cylinder(), dark, 0.04, 1.5, 0.04, 0, 0.15, 0));
      g.add(mk(unit.cylinder(), metal, 0.06, 0.14, 0.06, 0, 0.0, 0));
      g.add(mk(unit.cylinder(), metal, 0.06, 0.14, 0.06, 0, 0.3, 0));
      g.add(mk(unit.box(), metal, 0.12, 0.2, 0.05, 0, 0.92, 0));
      g.add(mk(unit.box(), glow, 0.05, 0.16, 0.07, 0, 1.06, 0));
      g.add(mk(unit.box(), metal, 0.1, 0.14, 0.05, 0, -0.62, 0));
      g.add(mk(unit.box(), glow, 0.04, 0.1, 0.07, 0, -0.72, 0));
      break;
    case 'blaster':
      g.add(mk(unit.box(), main, 0.08, 0.3, 0.12, 0, 0.12, 0));
      g.add(mk(unit.cylinder(), dark, 0.05, 0.24, 0.05, 0, 0.38, 0));
      g.add(mk(unit.box(), dark, 0.07, 0.16, 0.08, 0, -0.1, -0.02));
      g.add(mk(unit.box(), glow, 0.04, 0.08, 0.04, 0, 0.14, 0.07));
      break;
    case 'rifle':
      g.add(mk(unit.box(), main, 0.09, 0.5, 0.13, 0, 0.2, 0));
      g.add(mk(unit.cylinder(), dark, 0.055, 0.42, 0.055, 0, 0.66, 0));
      g.add(mk(unit.box(), dark, 0.07, 0.26, 0.1, 0, -0.16, -0.02));
      g.add(mk(unit.cylinder(), dark, 0.05, 0.18, 0.05, 0, 0.3, 0.1));
      g.add(mk(unit.box(), glow, 0.04, 0.12, 0.04, 0, 0.22, 0.075));
      break;
    case 'staff':
      // Forse staff: a ribbed metal pole with a crystal held in a three-prong emitter.
      g.add(mk(unit.cylinder(), dark, 0.045, 1.5, 0.045, 0, 0.35, 0));
      for (const y of [0.0, 0.2, 0.75]) g.add(mk(unit.cylinder(), metal, 0.07, 0.05, 0.07, 0, y, 0));
      g.add(mk(unit.cylinder(), metal, 0.1, 0.08, 0.1, 0, 1.08, 0));
      for (const a of [0, 2.1, 4.2])
        g.add(mk(unit.box(), metal, 0.03, 0.2, 0.03, Math.cos(a) * 0.07, 1.2, Math.sin(a) * 0.07));
      g.add(mk(unit.gem(), glow, 0.12, 0.2, 0.12, 0, 1.22, 0));
      break;
    case 'javelin':
      g.add(mk(unit.cylinder(), main, 0.035, 1.3, 0.035, 0, 0.25, 0));
      g.add(mk(unit.cone(), metal, 0.08, 0.26, 0.05, 0, 1.02, 0));
      g.add(mk(unit.cylinder(), glow, 0.05, 0.08, 0.05, 0, 0.85, 0));
      break;
    case 'axe':
      // Vibro-axe: a squared-off cleaver head with a humming glowing edge and a power cell.
      g.add(mk(unit.box(), dark, 0.06, 0.75, 0.06, 0, 0.22, 0));
      g.add(mk(unit.box(), metal, 0.26, 0.3, 0.04, 0.12, 0.48, 0));
      g.add(mk(unit.box(), dark, 0.12, 0.06, 0.05, 0.08, 0.48, 0));
      g.add(mk(unit.box(), glow, 0.03, 0.32, 0.05, 0.26, 0.48, 0));
      g.add(mk(unit.cylinder(), glow, 0.05, 0.1, 0.05, 0, 0.05, 0.04));
      break;
    case 'baton':
      g.add(mk(unit.cylinder(), dark, 0.06, 0.24, 0.06, 0, -0.02, 0));
      g.add(mk(unit.cylinder(), metal, 0.045, 0.55, 0.045, 0, 0.38, 0));
      g.add(mk(unit.torus(), glow, 0.1, 0.1, 0.3, 0, 0.45, 0));
      g.add(mk(unit.sphere(), glow, 0.1, 0.1, 0.1, 0, 0.68, 0));
      break;
    case 'disc': {
      // Ring + glowing core in the XY plane, held at the rim.
      g.add(mk(unit.torus(), metal, 0.5, 0.5, 1.6, 0, 0.2, 0));
      const core = mk(unit.cylinder(), glow, 0.36, 0.03, 0.36, 0, 0.2, 0);
      core.rotation.x = Math.PI / 2;
      g.add(core);
      break;
    }
    case 'focus':
      g.add(mk(unit.cylinder(), metal, 0.06, 0.18, 0.06, 0, 0.0, 0));
      g.add(mk(unit.torus(), metal, 0.2, 0.2, 0.5, 0, 0.18, 0));
      g.add(mk(unit.gem(), glow, 0.2, 0.3, 0.2, 0, 0.26, 0));
      break;
    case 'helm':
      // A rounded trooper/pilot helmet with a dark T visor.
      g.add(mk(unit.sphere(), main, 0.36, 0.34, 0.36, 0, 0.02, 0));
      g.add(mk(unit.cylinder(), main, 0.34, 0.16, 0.34, 0, -0.1, 0));
      g.add(mk(unit.box(), dark, 0.24, 0.05, 0.05, 0, 0.02, 0.17));
      g.add(mk(unit.box(), dark, 0.06, 0.12, 0.05, 0, -0.06, 0.17));
      g.add(mk(unit.box(), glow, 0.03, 0.12, 0.03, 0.18, 0.1, 0));
      break;
    case 'hood': {
      // Cloth Yedi hood: a soft peaked cowl with a shadowed face opening and a drape.
      g.add(mk(unit.sphere(), main, 0.4, 0.4, 0.42, 0, 0.02, -0.02));
      const peak = mk(unit.cone(), main, 0.26, 0.26, 0.26, 0, 0.2, -0.1);
      peak.rotation.x = -0.6;
      g.add(peak);
      g.add(mk(unit.sphere(), dark, 0.26, 0.28, 0.12, 0, -0.01, 0.17));
      g.add(mk(unit.taper(), main, 0.46, 0.18, 0.4, 0, -0.2, -0.02));
      break;
    }
    case 'mask':
      // Syth-style mask: a dark helm with a metal face plate and a glowing eye slit.
      g.add(mk(unit.sphere(), main, 0.38, 0.36, 0.38, 0, 0.03, 0));
      g.add(mk(unit.box(), metal, 0.26, 0.22, 0.06, 0, -0.04, 0.17));
      g.add(mk(unit.box(), glow, 0.2, 0.035, 0.04, 0, 0.02, 0.2));
      g.add(mk(unit.box(), dark, 0.03, 0.14, 0.04, -0.06, -0.08, 0.2));
      g.add(mk(unit.box(), dark, 0.03, 0.14, 0.04, 0.06, -0.08, 0.2));
      break;
    case 'suit': {
      // Pilot flight suit: a jumpsuit torso with a white chest harness and a life-support box.
      const strap = toonMaterial(0xeeeeea);
      g.add(mk(unit.capsule(), main, 0.36, 0.2, 0.26, 0, 0, 0));
      g.add(mk(unit.cylinder(), main, 0.2, 0.06, 0.2, 0, 0.24, 0));
      const s1 = mk(unit.box(), strap, 0.06, 0.48, 0.03, -0.06, 0.02, 0.13);
      s1.rotation.z = 0.45;
      const s2 = mk(unit.box(), strap, 0.06, 0.48, 0.03, 0.06, 0.02, 0.13);
      s2.rotation.z = -0.45;
      g.add(s1, s2);
      g.add(mk(unit.box(), dark, 0.16, 0.12, 0.06, 0, -0.04, 0.15));
      g.add(mk(unit.box(), glow, 0.03, 0.03, 0.02, -0.04, -0.03, 0.185));
      g.add(mk(unit.box(), toonMaterial(0xd04040), 0.03, 0.03, 0.02, 0.03, -0.03, 0.185));
      break;
    }
    case 'armor':
      g.add(mk(unit.box(), main, 0.4, 0.4, 0.26, 0, 0, 0));
      g.add(mk(unit.box(), glow, 0.08, 0.16, 0.04, 0, 0.06, 0.14));
      g.add(mk(unit.sphere(), dark, 0.18, 0.14, 0.2, -0.24, 0.17, 0));
      g.add(mk(unit.sphere(), dark, 0.18, 0.14, 0.2, 0.24, 0.17, 0));
      break;
    case 'shield': {
      // Energy deflector: an arm-mounted emitter plate projecting a translucent glowing field.
      g.add(mk(unit.box(), main, 0.2, 0.3, 0.07, 0, 0, 0));
      g.add(mk(unit.box(), dark, 0.12, 0.2, 0.04, 0, 0, 0.04));
      g.add(mk(unit.box(), glow, 0.04, 0.12, 0.03, 0, 0, 0.07));
      const field = mk(
        unit.cylinder(),
        glowMaterial(accent ?? 0x4fc3ff, 0.32, true),
        0.62,
        0.02,
        0.62,
        0,
        0,
        0.1,
      );
      field.rotation.x = Math.PI / 2;
      field.userData.noTint = true;
      g.add(field);
      break;
    }
    case 'boots':
      g.add(mk(unit.box(), main, 0.12, 0.2, 0.28, -0.1, 0, 0.04));
      g.add(mk(unit.box(), main, 0.12, 0.2, 0.28, 0.1, 0, 0.04));
      break;
    case 'gloves':
      g.add(mk(unit.sphere(), main, 0.18, 0.2, 0.14, -0.1, 0, 0));
      g.add(mk(unit.sphere(), main, 0.18, 0.2, 0.14, 0.1, 0, 0));
      break;
    case 'belt': {
      const t = mk(unit.torus(), main, 0.36, 0.36, 0.5, 0, 0, 0);
      t.rotation.x = Math.PI / 2;
      g.add(t);
      g.add(mk(unit.box(), glow, 0.1, 0.07, 0.04, 0, 0, 0.19));
      break;
    }
    case 'ring': {
      const t = mk(unit.torus(), main, 0.22, 0.22, 0.4, 0, 0, 0);
      g.add(t);
      g.add(mk(unit.gem(), glow, 0.1, 0.1, 0.1, 0, 0.12, 0));
      break;
    }
    case 'amulet': {
      const t = mk(unit.torus(), main, 0.34, 0.34, 0.4, 0, 0.04, 0);
      g.add(t);
      g.add(mk(unit.gem(), glow, 0.13, 0.18, 0.13, 0, -0.14, 0));
      break;
    }
    case 'potion':
      g.add(mk(unit.sphere(), glow, 0.22, 0.22, 0.22, 0, -0.02, 0));
      g.add(mk(unit.cylinder(), toonMaterial(0xdfe8f0), 0.09, 0.14, 0.09, 0, 0.14, 0));
      g.add(mk(unit.cylinder(), dark, 0.11, 0.05, 0.11, 0, 0.23, 0));
      break;
    case 'scroll': {
      const c = mk(unit.cylinder(), toonMaterial(0xeadfb4), 0.1, 0.34, 0.1, 0, 0, 0);
      c.rotation.z = Math.PI / 2;
      g.add(c);
      g.add(mk(unit.cylinder(), main, 0.12, 0.05, 0.12, 0.12, 0, 0));
      break;
    }
    case 'gem':
      g.add(mk(unit.gem(), glow, 0.24, 0.34, 0.24, 0, 0, 0));
      break;
    default:
      g.add(mk(unit.box(), main, 0.26, 0.26, 0.26, 0, 0, 0));
      g.add(mk(unit.box(), glow, 0.1, 0.1, 0.1, 0, 0, 0.13));
  }
  return g;
}

class ItemRig implements Rig {
  readonly root = new THREE.Group();
  readonly bodyMeshes: THREE.Mesh[] = [];
  readonly handTilt = 0;
  private readonly spin = new THREE.Group();
  private time = 0;

  constructor(name: string, ph: Placeholder, accent: number | undefined) {
    const kind = classifyItem(name);
    const shape = buildItemShape(kind, ph.color, accent);
    shape.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.bodyMeshes.push(o as THREE.Mesh);
    });
    const s = Math.max(0.6, ph.height) * (kind === 'spear' || kind === 'blade' ? 1.1 : 1.8);
    shape.scale.setScalar(s);
    if (kind === 'blade' || kind === 'spear' || kind === 'blaster') shape.rotation.z = Math.PI / 2; // lie flat
    this.spin.position.y = 0.3;
    this.spin.add(shape);
    this.root.add(this.spin);
  }

  setMode(): void {}

  update(dt: number): void {
    this.time += dt;
    this.spin.rotation.y += dt * 1.2;
    this.spin.position.y = 0.3 + Math.sin(this.time * 2) * 0.05;
  }

  socket(): THREE.Object3D {
    return this.spin;
  }

  dispose(): void {}
}

// ------------------------------------------------------------------ entry

/** Build the procedural rig for a catalog entry (or unknown id with a default placeholder). */
export function buildPlaceholderRig(id: string, entry: Pick<ModelEntry, 'placeholder' | 'accent'>): Rig {
  const info = classifyModelId(id);
  const ph = entry.placeholder;
  switch (info.kind) {
    case 'hero':
      return new HumanoidRig(ph, 'hero', entry.accent, ph.shape);
    case 'npc':
      return new HumanoidRig(ph, 'npc', entry.accent, ph.shape);
    case 'droyd':
      return new HumanoidRig(ph, 'droyd', entry.accent, ph.shape);
    case 'creature':
      return new HumanoidRig(ph, 'organic', entry.accent, ph.shape);
    case 'object':
      return new ObjectRig(info.name.toLowerCase(), ph, entry.accent);
    case 'item':
      return new ItemRig(info.name, ph, entry.accent);
    default:
      return new HumanoidRig(ph, 'organic', entry.accent, ph.shape);
  }
}
