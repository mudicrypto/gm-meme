import { describe, expect, it } from 'vitest';
import { formatLamports, parseSolToLamports, percentOfRaw, rawToTokens } from './amounts';

describe('parseSolToLamports', () => {
  it.each([
    ['0.05', '50000000'],
    ['1', '1000000000'],
    ['1.5', '1500000000'],
    ['.1', '100000000'],
    ['0,25', '250000000'],
    ['0.000000001', '1'],
    [' 2 ', '2000000000'],
  ])('%j → %s', (input, lamports) => {
    expect(parseSolToLamports(input)).toBe(lamports);
  });

  it.each(['', '0', '0.0', 'abc', '1.2.3', '-1', '1e3', '0.0000000001', '.'])(
    'rejects %j',
    (input) => {
      expect(parseSolToLamports(input)).toBeNull();
    },
  );
});

describe('formatLamports', () => {
  it('formats SOL and rounds costs up so they are never understated', () => {
    expect(formatLamports(21_523_995)).toBe('0.0215');
    expect(formatLamports(21_523_995, { roundUp: true })).toBe('0.0216');
    expect(formatLamports(1_000_000_000)).toBe('1');
    expect(formatLamports(5000)).toBe('0.000005');
    expect(formatLamports(5155, { roundUp: true })).toBe('0.000006');
    expect(formatLamports(100_000)).toBe('0.0001');
    expect(formatLamports(400)).toBe('<0.000001');
    expect(formatLamports(0)).toBe('0');
  });
});

describe('token amounts', () => {
  it('takes exact shares of a raw balance and sells everything at 100%', () => {
    expect(percentOfRaw('1000', 25)).toBe('250');
    expect(percentOfRaw('999', 50)).toBe('499');
    expect(percentOfRaw('123456789012345678', 100)).toBe('123456789012345678');
    expect(rawToTokens('66285709815747', 6)).toBeCloseTo(66_285_709.815747, 6);
  });
});
