import { describe, expect, it } from 'vitest';
import { HIT_STYLES, hitPose } from './entitySync';

describe('hit reactions', () => {
  it('each style moves the body its own way', () => {
    const [squash, twist, rock] = HIT_STYLES.map((s) => hitPose(s, 1, 1, 1));
    expect(squash!.squash).toBeGreaterThan(0);
    expect(squash!.twist).toBe(0);
    expect(twist!.twist).toBeGreaterThan(0);
    expect(twist!.squash).toBe(0);
    expect(rock!.rock).toBeGreaterThan(0);
    expect(rock!.twist).toBe(0);
  });

  it('twists either way, scales with crits and settles to rest', () => {
    expect(hitPose('twist', 1, 1, -1).twist).toBeLessThan(0);
    expect(hitPose('rock', 1, 1.8, 1).rock).toBeGreaterThan(hitPose('rock', 1, 1, 1).rock);
    for (const s of HIT_STYLES)
      expect(hitPose(s, 0, 1.8, 1)).toEqual({ recoil: 0, squash: 0, twist: 0, rock: 0 });
  });
});
