// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { preventZoomGestures } from './lifecycle';

function touchEnd(target: Element, timeStamp: number): Event {
  const e = new Event('touchend', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(e);
  return e;
}

describe('preventZoomGestures', () => {
  it('blocks a quick second tap on the game world but never on a button', () => {
    const dispose = preventZoomGestures(document);
    const world = document.createElement('div');
    const button = document.createElement('button');
    button.appendChild(document.createElement('span'));
    document.body.append(world, button);

    touchEnd(world, 1000);
    expect(touchEnd(world, 1200).defaultPrevented).toBe(true);
    expect(touchEnd(button.firstElementChild!, 1300).defaultPrevented).toBe(false);
    dispose();
  });
});
