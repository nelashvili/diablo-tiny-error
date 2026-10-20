import { DB } from '../../data/db';
import { bladeColor } from './blade';
import { DUAL_WIELD, MELEE_MASTERY, weaponDps } from '../player/weapon';
import { hasName, t } from '../../data/names';
import type { Modifier, StatId } from '../stats/types';
import type { ClassId, ItemQuality } from '../types';
import { itemDefense, itemModifiers, itemRequirements, weaponInfo } from './helpers';
import { baseOf, findSetItem } from './lookup';
import type { ItemInstance } from './types';

export interface ItemLine {
  text: string;
  /** Style hint: 'base' | 'mod' | 'req' | 'reqFail' | 'set' | 'setMissing' | 'flavor' | 'socket' | 'blade' | 'better' | 'worse'. */
  style: string;
}

export interface ItemDescription {
  name: string;
  /** Second line for rares/uniques (base type name). */
  baseName?: string;
  quality: ItemQuality;
  lines: ItemLine[];
}

export interface DescribeCtx {
  stats?: { level?: number; strength?: number; dexterity?: number };
  classId?: ClassId;
  /** Set item ids the hero is wearing (set tooltips mark them). */
  worn?: ReadonlySet<string>;
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

function paramName(stat: StatId, param: string | undefined): string {
  if (!param) return '';
  if (stat === 'classSkills') return t(`class.${param}`);
  if (stat === 'treeSkills') return t(`tree.${param}`);
  const skill = DB.skills.get(param);
  return skill ? t(skill.name) : param;
}

/** Readable lines for a list of modifiers (sums duplicates, merges damage pairs and all-resists). */
export function modLines(mods: readonly Modifier[]): string[] {
  const sum = new Map<string, { stat: StatId; op: Modifier['op']; param?: string; value: number }>();
  for (const m of mods) {
    const key = `${m.stat}|${m.op}|${m.param ?? ''}`;
    const cur = sum.get(key);
    if (cur) cur.value += m.value;
    else sum.set(key, { stat: m.stat, op: m.op, ...(m.param ? { param: m.param } : {}), value: m.value });
  }
  const get = (stat: StatId): number | undefined => sum.get(`${stat}|flat|`)?.value;
  const take = (stat: StatId): number | undefined => {
    const v = get(stat);
    sum.delete(`${stat}|flat|`);
    return v;
  };
  const lines: string[] = [];

  // all resistances
  const rp = get('resPlasma');
  if (rp !== undefined && rp === get('resCryo') && rp === get('resStorm') && rp === get('resToxin')) {
    for (const s of ['resPlasma', 'resCryo', 'resStorm', 'resToxin'] as StatId[]) take(s);
    lines.push(t('istat.allRes', { v: signed(rp) }));
  }
  // paired damage
  const pairs: [StatId, StatId, string][] = [
    ['minDamage', 'maxDamage', 'istat.dmg'],
    ['plasmaMin', 'plasmaMax', 'istat.plasma'],
    ['cryoMin', 'cryoMax', 'istat.cryo'],
    ['stormMin', 'stormMax', 'istat.storm'],
    ['magicMin', 'magicMax', 'istat.magic'],
  ];
  for (const [lo, hi, key] of pairs) {
    const a = get(lo);
    const b = get(hi);
    if (a === undefined || b === undefined) continue;
    take(lo);
    take(hi);
    const len = lo === 'cryoMin' ? take('cryoLength') : undefined;
    lines.push(len !== undefined ? t('istat.cryoLen', { min: a, max: b, len }) : t(key, { min: a, max: b }));
  }
  const tx = get('toxinMax');
  if (tx !== undefined) {
    take('toxinMin');
    take('toxinMax');
    lines.push(t('istat.toxin', { max: tx, len: take('toxinLength') ?? 1 }));
  }

  for (const e of sum.values()) {
    if (e.value === 0) continue;
    const pct = e.op === 'percent' && hasName(`istat.${e.stat}.pct`);
    const key = `istat.${e.stat}${pct ? '.pct' : ''}`;
    const v = e.stat === 'requirementsReduced' ? -e.value : e.value;
    lines.push(t(key, { v: signed(v), name: paramName(e.stat, e.param) }));
  }
  return lines;
}

function itemName(item: ItemInstance): { name: string; baseName?: string } {
  const b = baseOf(item);
  const baseText = b ? t(b.name) : item.base;
  switch (item.quality) {
    case 'unique': {
      const u = item.uniqueId ? DB.uniques.get(item.uniqueId) : undefined;
      return { name: u ? t(u.name) : baseText, baseName: baseText };
    }
    case 'set': {
      const s = item.setItemId ? findSetItem(item.setItemId) : undefined;
      return { name: s ? t(s.item.name) : baseText, baseName: baseText };
    }
    case 'rare':
    case 'crafted':
      return {
        name: item.rareName ? `${t(item.rareName[0])} ${t(item.rareName[1])}` : baseText,
        baseName: baseText,
      };
    case 'magic': {
      const defs = item.affixes.map((id) => DB.affixes.get(id)).filter((a) => a !== undefined);
      const pre = defs.find((a) => a.kind === 'prefix');
      const suf = defs.find((a) => a.kind === 'suffix');
      return { name: [pre && t(pre.name), baseText, suf && t(suf.name)].filter(Boolean).join(' ') };
    }
    case 'inferior':
      return { name: t('item.q.inferior', { base: baseText }) };
    default:
      return { name: item.superior ? t('item.q.superior', { base: baseText }) : baseText };
  }
}

/** Tooltip text for an item (all strings already translated via t()). */
export function describeItem(item: ItemInstance, ctx?: DescribeCtx): ItemDescription {
  const b = baseOf(item);
  const { name, baseName } = itemName(item);
  const lines: ItemLine[] = [];
  const push = (text: string, style: string): void => void lines.push({ text, style });
  if (!b) return { name, quality: item.quality, lines };

  const w = weaponInfo(item);
  if (w) {
    const ranged = w.weaponClass === 'blasturPistol' || w.weaponClass === 'blasturRifle';
    const key = ranged ? 'item.damage.ranged' : w.twoHanded ? 'item.damage.2h' : 'item.damage.1h';
    push(t(key, { min: w.min, max: w.max }), 'base');
    if (b.slots.includes('offHand'))
      push(t('item.dualWield', { ias: DUAL_WIELD.attackSpeed, def: -DUAL_WIELD.defensePct }), 'magic');
    push(t('item.speed', { v: w.speed.toFixed(2) }), 'base');
    const melee = !ranged && w.weaponClass !== 'javelin' && w.weaponClass !== 'throwingDisc';
    push(t('item.dps', { v: itemDps(item).toFixed(1) }), 'dps');
    if (melee)
      push(
        t('item.meleeMastery', {
          dmg: MELEE_MASTERY.enhancedDamage,
          dr: MELEE_MASTERY.damageReducedPct,
          cleave: MELEE_MASTERY.cleavePct,
        }),
        'magic',
      );
    const blade = bladeColor(item);
    if (blade)
      push(t('item.blade', { color: t(`item.blade.${blade}`), fx: t(`item.blade.fx.${blade}`) }), 'blade');
  }
  if (b.defense) push(t('item.defense', { v: itemDefense(item) }), 'base');
  if (b.block) push(t('item.block', { v: b.block }), 'base');
  if (item.durability)
    push(t('item.durability', { cur: item.durability.cur, max: item.durability.max }), 'base');
  if (b.stackable && b.stackable > 1 && item.quantity) push(t('item.quantity', { v: item.quantity }), 'base');
  if (b.use) {
    const k = b.use.kind;
    push(t(`item.use.${k}`, { v: b.use.amount ?? 0 }), 'base');
  }
  if (item.ethereal) push(t('item.q.ethereal'), 'base');

  // requirements
  const r = itemRequirements(item);
  const s = ctx?.stats;
  const reqLine = (key: string, need: number, have: number | undefined): void => {
    if (need > 0) push(t(key, { v: need }), have !== undefined && have < need ? 'reqFail' : 'req');
  };
  reqLine('item.req.strength', r.strength, s?.strength);
  reqLine('item.req.dexterity', r.dexterity, s?.dexterity);
  reqLine('item.req.level', r.level, s?.level);
  if (b.classOnly)
    push(
      t('item.req.class', { class: t(`class.${b.classOnly}`) }),
      ctx?.classId && ctx.classId !== b.classOnly ? 'reqFail' : 'req',
    );

  // magical properties (own mods; gems are listed under sockets)
  for (const text of modLines(item.mods)) push(text, 'mod');

  // sockets
  if (item.sockets > 0) {
    push(t('item.sockets', { used: item.socketed.length, total: item.sockets }), 'socket');
    for (const g of item.socketed) {
      const def = DB.gems.get(g.base);
      const kind = b.category === 'weapon' ? 'weapon' : b.armorClass === 'shield' ? 'shield' : 'armor';
      const text = def ? modLines(def[kind]).join(', ') : '';
      push(`${t(baseOf(g)?.name ?? g.base)}${text ? `: ${text}` : ''}`, 'socket');
    }
    for (let i = item.socketed.length; i < item.sockets; i++) push(t('item.socket.empty'), 'socket');
  }

  // set bonuses
  const ref = item.setItemId ? findSetItem(item.setItemId) : undefined;
  if (ref) {
    push(t(ref.set.name), 'set');
    if (ref.set.forClass) push(t('item.set.for', { class: t(`class.${ref.set.forClass}`) }), 'set');
    for (const it of ref.set.items)
      push(
        t(ctx?.worn?.has(it.id) ? 'item.set.worn' : 'item.set.owned', { name: t(it.name) }),
        ctx?.worn && !ctx.worn.has(it.id) ? 'setMissing' : 'set',
      );
    for (const [n, mods] of Object.entries(ref.set.bonuses)) {
      const text = modLines(
        mods.map((m) => ({ stat: m.stat, op: m.op, value: m.max, ...(m.param ? { param: m.param } : {}) })),
      );
      push(t('item.set.bonus', { n, text: text.join(', ') }), 'set');
    }
    if (ref.set.look) push(t('item.set.full'), 'set');
  }
  // history
  const flavor = ref
    ? `flavor.setitem.${ref.item.id}`
    : item.quality === 'unique' && item.uniqueId
      ? `flavor.uniq.${item.uniqueId}`
      : b.flavor;
  if (flavor && hasName(flavor)) push(t(flavor), 'flavor');
  return { name, ...(baseName ? { baseName } : {}), quality: item.quality, lines };
}

/** A weapon's own damage per second (0 for non-weapons), counting its flat damage mods and the melee bonus. */
export function itemDps(item: ItemInstance): number {
  const w = weaponInfo(item);
  if (!w) return 0;
  const flat = item.mods.reduce(
    (n, m) => (m.op === 'flat' && (m.stat === 'minDamage' || m.stat === 'maxDamage') ? n + m.value : n),
    0,
  );
  const melee = !RANGED_CLASSES.has(w.weaponClass);
  return weaponDps(w.min + flat / 2, w.max + flat / 2, w.speed, melee);
}

const RANGED_CLASSES = new Set<string>(['blasturPistol', 'blasturRifle', 'javelin', 'throwingDisc']);

function summarize(item: ItemInstance): { avg: number; def: number; stats: Map<string, Modifier> } {
  const w = weaponInfo(item);
  const stats = new Map<string, Modifier>();
  for (const m of itemModifiers(item)) {
    if (m.stat === 'defense' && m.op === 'flat') continue; // covered by the defense line
    const key = `${m.stat}|${m.op}|${m.param ?? ''}`;
    const cur = stats.get(key);
    if (cur) cur.value += m.value;
    else stats.set(key, { ...m });
  }
  return { avg: w ? itemDps(item) : 0, def: itemDefense(item), stats };
}

/**
 * Compare candidate `a` against currently equipped `b`: green/red delta lines. `vsDps` replaces
 * `b`'s damage per second (a dual wielder's two blades together).
 */
export function compareItems(a: ItemInstance, b?: ItemInstance, vsDps?: number): ItemLine[] {
  const sa = summarize(a);
  const sb = b ? summarize(b) : { avg: 0, def: 0, stats: new Map<string, Modifier>() };
  if (vsDps !== undefined) sb.avg = vsDps;
  const out: ItemLine[] = [];
  const delta = (d: number, key: string): void => {
    const r = Math.round(d * 10) / 10;
    if (r !== 0) out.push({ text: t(key, { v: signed(r) }), style: r > 0 ? 'better' : 'worse' });
  };
  if (sa.avg || sb.avg) delta(sa.avg - sb.avg, 'item.cmp.dmg');
  if (sa.def || sb.def) delta(sa.def - sb.def, 'item.cmp.def');
  const keys = new Set([...sa.stats.keys(), ...sb.stats.keys()]);
  for (const k of [...keys].sort()) {
    const ma = sa.stats.get(k);
    const mb = sb.stats.get(k);
    const ref = (ma ?? mb)!;
    const d = (ma?.value ?? 0) - (mb?.value ?? 0);
    if (d === 0) continue;
    const text = modLines([{ ...ref, value: d }])[0];
    if (text) out.push({ text, style: d > 0 ? 'better' : 'worse' });
  }
  return out;
}
