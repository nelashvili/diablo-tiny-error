import { t } from '../../data/names';
import type { PlayerEntity } from '../../core/sim/entities';
import type { EquipSlot } from '../../core/types';
import type { UiApi } from '../types';
import { Creditz, EquipSlotView, ItemGrid, PanelFrame } from './common';
import { useCtl } from './ctl';
import { freeCells } from './gridLogic';
import { Icon } from './icons';

/** Paper-doll layout in cell units (D2 arrangement). */
export const DOLL: { slot: EquipSlot; x: number; y: number; w: number; h: number }[] = [
  { slot: 'mainHand', x: 0.25, y: 1.1, w: 2, h: 4 },
  { slot: 'head', x: 4, y: 0.1, w: 2, h: 2 },
  { slot: 'amulet', x: 6.4, y: 1.1, w: 1, h: 1 },
  { slot: 'chest', x: 4, y: 2.3, w: 2, h: 3 },
  { slot: 'offHand', x: 7.75, y: 1.1, w: 2, h: 4 },
  { slot: 'gloves', x: 0.25, y: 5.4, w: 2, h: 2 },
  { slot: 'ring1', x: 2.75, y: 5.4, w: 1, h: 1 },
  { slot: 'belt', x: 4, y: 5.4, w: 2, h: 1 },
  { slot: 'ring2', x: 6.25, y: 5.4, w: 1, h: 1 },
  { slot: 'boots', x: 7.75, y: 5.4, w: 2, h: 2 },
];
export const DOLL_H = 7.5;

export function InventoryPanel({
  api,
  player,
  onClose,
}: {
  api: UiApi;
  player: PlayerEntity;
  onClose?: () => void;
}) {
  const ctl = useCtl();
  const free = freeCells(player.inventory, (uid) => {
    const e = player.inventory.items.find((i) => i.item.uid === uid);
    return e ? ctl.sizeOf(e.item) : { w: 1, h: 1 };
  });
  const swapLabel = t('ui.inv.swapHint');
  // The active set is always `equipment`; `swap` holds the other set. Tab I is active unless the
  // sim tracks otherwise, so the inactive tab simply swaps.
  return (
    <PanelFrame id="inventory" title={t('ui.panel.inventory')} onClose={onClose}>
      <div class="dte-doll" style={{ height: `calc(var(--cell) * ${DOLL_H})` }}>
        <div class="dte-doll-bg" />
        <div class="dte-weapon-tabs left">
          <button class="dte-wtab active" aria-pressed="true" title={swapLabel}>
            {t('ui.inv.weaponsI')}
          </button>
          <button class="dte-wtab" title={swapLabel} onClick={() => api.dispatch({ type: 'swapWeapons' })}>
            {t('ui.inv.weaponsII')}
          </button>
        </div>
        <div class="dte-weapon-tabs right">
          <button class="dte-wtab" title={swapLabel} onClick={() => api.dispatch({ type: 'swapWeapons' })}>
            <Icon name="swap" size={18} />
          </button>
        </div>
        {DOLL.map((d) => (
          <EquipSlotView key={d.slot} {...d} item={player.equipment[d.slot]} />
        ))}
      </div>
      <ItemGrid container="inventory" grid={player.inventory} class="inv" />
      <footer class="dte-inv-foot">
        <Creditz amount={player.creditz} />
        <span class="dte-dim">{t('ui.inv.free', { n: free })}</span>
        <button
          class="dte-btn"
          title={t('ui.inv.sortHint')}
          onClick={() => api.dispatch({ type: 'sortInventory', container: 'inventory' })}
        >
          <Icon name="sort" size={18} /> {t('ui.inv.sort')}
        </button>
      </footer>
    </PanelFrame>
  );
}
