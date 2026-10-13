// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Hud } from './index';
import { createMockApi } from './dev/mock';

describe('<Hud>', () => {
  it('renders orbs, belt, skill bar and menu; dispatches commands', async () => {
    const mock = createMockApi({ scripted: false });
    const root = document.createElement('div');
    document.body.appendChild(root);
    await act(() => render(<Hud api={mock.api} />, root));

    expect(root.querySelectorAll('.hud-orb')).toHaveLength(2);
    expect(root.querySelectorAll('.hud-beltslot')).toHaveLength(4);
    expect(root.querySelectorAll('.hud-hotkey')).toHaveLength(8);
    expect(root.querySelector('.hud-target__mods')?.textContent).toBe('Extra Fast, Plasma Enchanted');
    expect(root.querySelector('.hud-badge')?.textContent).toBe('+5');

    await act(() => (root.querySelector('.hud-beltslot') as HTMLButtonElement).click());
    expect(mock.commands).toContainEqual({ type: 'useBeltSlot', index: 0 });

    // Open the right-hand picker and choose a skill.
    await act(() => (root.querySelector('.hud-skillbtn--right') as HTMLButtonElement).click());
    const item = [...root.querySelectorAll<HTMLButtonElement>('.hud-picker__item')].find((b) =>
      b.textContent?.includes('Static Field'),
    );
    expect(item).toBeTruthy();
    await act(() => item!.click());
    expect(mock.commands).toContainEqual({ type: 'selectSkill', hand: 'right', skillId: 'staticField' });
    expect(root.querySelector('.hud-picker')).toBeNull();

    // Menu buttons toggle panels; map panel renders the big map.
    const mapBtn = [...root.querySelectorAll<HTMLButtonElement>('.hud-menubtn')][4]!;
    await act(() => mapBtn.click());
    expect(mock.api.store.openPanels.value).toEqual(['map']);
    expect(root.querySelector('.hud-bigmap')).not.toBeNull();

    // Touch collapses the skill bar but keeps orbs + belt.
    await act(() => {
      mock.api.store.isTouch.value = true;
    });
    expect(root.querySelector('.hud-skillbtn')).toBeNull();
    expect(root.querySelectorAll('.hud-orb')).toHaveLength(2);
    expect(root.querySelectorAll('.hud-beltslot')).toHaveLength(4);

    // Events produce a level-up banner.
    await act(() => mock.emit([{ type: 'levelUp', id: 1, level: 8 }]));
    expect(root.querySelector('.hud-banner__title')?.textContent).toBe('Level 8!');

    await act(() => render(null, root));
  });
});
