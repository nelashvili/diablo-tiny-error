import { describe, expect, it } from 'vitest';
import { validName } from './nameRules';

describe('validName', () => {
  it('accepts simple names', () => {
    expect(validName('Zip')).toBe(true);
    expect(validName("Jo-Ann O'Neil")).toBe(true);
  });
  it('rejects too short, too long, or odd characters', () => {
    expect(validName('Z')).toBe(false);
    expect(validName('  ')).toBe(false);
    expect(validName('1abc')).toBe(false);
    expect(validName('abc<script>')).toBe(false);
    expect(validName('A'.repeat(16))).toBe(false);
  });
});
