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

describe('loadConfig: discovery settings', () => {
  it('watches the pump.fun program by default', () => {
    expect(loadConfig({}).HELIUS_WATCH_ADDRESSES).toEqual([
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    ]);
  });

  it('parses a comma-separated watch list and rejects bad addresses', () => {
    const a = 'So11111111111111111111111111111111111111112';
    expect(loadConfig({ HELIUS_WATCH_ADDRESSES: ` ${a} ,` }).HELIUS_WATCH_ADDRESSES).toEqual([a]);
    expect(() => loadConfig({ HELIUS_WATCH_ADDRESSES: 'nope' })).toThrow(/not a Solana address/);
  });

  it('requires a long webhook secret', () => {
    expect(() => loadConfig({ HELIUS_WEBHOOK_SECRET: 'short' })).toThrow(/24 characters/);
  });

  it('requires both Supabase settings or neither', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(/SUPABASE/);
    expect(() => loadConfig({ SUPABASE_SERVICE_ROLE_KEY: 'key' })).toThrow(/SUPABASE/);
  });

  it('rejects a poll interval that would hammer Helius', () => {
    expect(() => loadConfig({ HELIUS_POLL_INTERVAL_MS: '500' })).toThrow(/2000/);
    expect(loadConfig({ HELIUS_POLL_INTERVAL_MS: '5000' }).HELIUS_POLL_INTERVAL_MS).toBe(5000);
  });
});
