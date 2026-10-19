import { vi } from 'vitest';
import type { AssetMetadata, HeliusClient } from '../../src/helius/client';

/** A Helius client that answers from a fixed metadata table. */
export function fakeHelius(metadata: Record<string, Omit<AssetMetadata, 'mint'>> = {}) {
  return {
    getAssetBatch: vi.fn(async (mints: readonly string[]) =>
      mints.filter((mint) => metadata[mint]).map((mint) => ({ mint, ...metadata[mint] })),
    ),
    getAddressTransactions: vi.fn(async () => [] as unknown[]),
  } satisfies HeliusClient;
}

export const silentLog = { warn: vi.fn(), info: vi.fn() };
