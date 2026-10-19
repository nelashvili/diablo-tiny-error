/**
 * Weapon looks vary by line and tier: the model id of a held/dropped weapon carries a style suffix
 * `.v<line>.t<tier>[.u][.k<blade>]` (line index within its weapon class, tier 0-2, unique/set flag,
 * litesaber blade color), which the catalog resolves to the class's model by prefix and the attachment
 * builder reads back. Blasters instead pick one of the many blaster meshes per line and tier.
 */
import { DB } from '../../data/db';
import { BLADE_COLORS, bladeColor, type BladeColor, type BladeSource } from '../../core/items/blade';
import { WEAPON_LINES } from '../../data/items/_weaponTable';
import { TIERS, camel } from '../../data/items/_build';
import { WEAPON_MODEL_IDS } from './helpers';

/** base id -> [line index within its class, tier index]. */
const LINE_OF = new Map<string, [number, number]>();
const perClass = new Map<string, number>();
for (const line of WEAPON_LINES) {
  const idx = perClass.get(line.cls) ?? 0;
  perClass.set(line.cls, idx + 1);
  line.names.forEach((n, tier) => LINE_OF.set(camel(n), [idx, tier]));
}

const PISTOLS = ['pistol', 'compact', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'o', 'smg'];
const RIFLES = ['carbine', 'rifle', 'p', 'q', 'r', 'heavy', 'sniper'];

export interface WeaponStyle {
  line: number;
  tier: number;
  unique: boolean;
  /** Litesaber blade color (Kybur crystal or element), if any. */
  blade?: BladeColor;
}

/** Style suffix parsed from a model id (null when the id carries none). */
export function parseWeaponStyle(modelId: string): WeaponStyle | null {
  const m = /\.v(\d+)\.t(\d)(\.u)?(?:\.k([a-z]+))?$/.exec(modelId);
  if (!m) return null;
  const style: WeaponStyle = { line: Number(m[1]), tier: Number(m[2]), unique: !!m[3] };
  const blade = BLADE_COLORS.find((c) => c === m[4]);
  if (blade) style.blade = blade;
  return style;
}

/** Model id for a weapon base (plus quality), styled by line and tier. */
export function weaponModelId(baseId: string, quality?: string, blade?: BladeColor | null): string {
  const b = DB.items.get(baseId);
  const wc = b?.weaponClass;
  if (!wc) return `item.${baseId}`;
  const [line, tier] = LINE_OF.get(baseId) ?? [0, Math.max(0, TIERS.indexOf(b.tier ?? 'normal'))];
  if (wc === 'blasturPistol' || wc === 'blasturRifle') {
    const pool = wc === 'blasturPistol' ? PISTOLS : RIFLES;
    return `item.blastur.${pool[(line * 3 + tier * 2) % pool.length]}`;
  }
  const unique = quality === 'unique' || quality === 'set';
  const k = blade ? `.k${blade}` : '';
  return `${WEAPON_MODEL_IDS[wc] ?? `item.${baseId}`}.v${line}.t${tier}${unique ? '.u' : ''}${k}`;
}

/** Model id for a carried/dropped weapon instance (sabers show their blade color). */
export function weaponModelOf(item: BladeSource & { quality?: string }): string {
  return weaponModelId(item.base, item.quality, bladeColor(item));
}
