import { ARMOR_LINES, JEWELRY_LINES } from '../items/_armorTable';
import { camel } from '../items/_build';
import { WEAPON_LINES } from '../items/_weaponTable';
import { GEM_COLORS, GEM_GRADES, GEM_GRADE_NAMES, gemId } from '../gems/_gemTable';

const out: Record<string, string> = {
  'ib.baktaStim': 'Minor Bakta Stim',
  'ib.baktaStimLight': 'Light Bakta Stim',
  'ib.baktaStimMedium': 'Bakta Stim',
  'ib.baktaStimGreater': 'Greater Bakta Stim',
  'ib.baktaStimSuper': 'Super Bakta Stim',
  'ib.energyCell': 'Minor Energy Cell',
  'ib.energyCellLight': 'Light Energy Cell',
  'ib.energyCellMedium': 'Energy Cell',
  'ib.energyCellGreater': 'Greater Energy Cell',
  'ib.energyCellSuper': 'Super Energy Cell',
  'ib.rejuvStim': 'Rejuvenation Stim',
  'ib.rejuvStimFull': 'Full Rejuvenation Stim',
  'ib.recallBeacon': 'Recall Beacon',
  'ib.antidote': 'Antidoat Stim',
  'ib.thaw': 'Thaw Stim',
  'ib.stamina': 'Stamina Stim',
};
for (const l of [...WEAPON_LINES, ...ARMOR_LINES]) for (const n of l.names) out[`ib.${camel(n)}`] = n;
for (const j of JEWELRY_LINES) out[`ib.${j.id}`] = j.name;
for (const c of GEM_COLORS)
  for (const g of GEM_GRADES) out[`gem.${gemId(c.key, g)}`] = `${GEM_GRADE_NAMES[g]} ${c.name}`;

export default out;
