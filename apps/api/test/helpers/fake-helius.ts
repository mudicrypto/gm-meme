import { vi } from 'vitest';
import type { AssetMetadata, HeliusClient, TokenAccountHolding } from '../../src/helius/client';
import type { MintInfo } from '../../src/risk/inputs';

/** A Helius client that answers from a fixed metadata table. */
export function fakeHelius(metadata: Record<string, Omit<AssetMetadata, 'mint'>> = {}) {
  return {
    getAssetBatch: vi.fn(async (mints: readonly string[]) =>
      mints.filter((mint) => metadata[mint]).map((mint) => ({ mint, ...metadata[mint] })),
    ),
    getAddressTransactions: vi.fn(
      async (_address: string, _options?: { limit?: number; type?: string }) => [] as unknown[],
    ),
    getMint: vi.fn(async (_mint: string): Promise<MintInfo | null> => null),
    getLargestTokenAccounts: vi.fn(async (_mint: string): Promise<TokenAccountHolding[]> => []),
  } satisfies HeliusClient;
}

export const silentLog = { warn: vi.fn(), info: vi.fn() };
