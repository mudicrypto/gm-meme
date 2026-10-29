import { describe, expect, it } from 'vitest';
import { pressKey } from './numpad';

describe('pressKey', () => {
  it('builds a decimal amount', () => {
    let value = '';
    for (const key of ['0', '.', '0', '5']) value = pressKey(value, key);
    expect(value).toBe('0.05');
  });

  it('allows one decimal point, replaces a lone zero, and deletes', () => {
    expect(pressKey('1.5', '.')).toBe('1.5');
    expect(pressKey('', '.')).toBe('0.');
    expect(pressKey('0', '7')).toBe('7');
    expect(pressKey('1.25', 'del')).toBe('1.2');
  });

  it('caps decimal places and length', () => {
    expect(pressKey('0.12', '3', 2)).toBe('0.12');
    expect(pressKey('123456789012', '3')).toBe('123456789012');
  });
});
