import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('defaults to devnet with no keys set', () => {
    const config = loadConfig({});
    expect(config.SOLANA_CLUSTER).toBe('devnet');
    expect(config.PORT).toBe(3000);
    expect(config.HELIUS_API_KEY).toBeUndefined();
  });

  it('treats empty keys from .env.example as unset', () => {
    const config = loadConfig({ HELIUS_API_KEY: '', SUPABASE_URL: '' });
    expect(config.HELIUS_API_KEY).toBeUndefined();
    expect(config.SUPABASE_URL).toBeUndefined();
  });

  it('rejects an unknown cluster', () => {
    expect(() => loadConfig({ SOLANA_CLUSTER: 'testnet' })).toThrow(/SOLANA_CLUSTER/);
  });

  it('rejects a bad port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
