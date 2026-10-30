import { describe, expect, it } from 'vitest';
import { solWord, solscanUrl } from './network';

describe('network helpers', () => {
  it('links to Solscan on the right network', () => {
    expect(solscanUrl('tx', 'abc', 'devnet')).toBe('https://solscan.io/tx/abc?cluster=devnet');
    expect(solscanUrl('token', 'mint', 'mainnet-beta')).toBe('https://solscan.io/token/mint');
  });
  it('calls devnet SOL test SOL', () => {
    expect(solWord(true)).toBe('test SOL');
    expect(solWord(false)).toBe('SOL');
  });
});
