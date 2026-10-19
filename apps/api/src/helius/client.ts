import type { SolanaCluster } from '@sift/shared';
import { z } from 'zod';

/** Token metadata from Helius DAS, reduced to what discovery stores. */
export interface AssetMetadata {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  decimals?: number;
  supply?: number;
}

export interface HeliusClient {
  /** Metadata for each mint DAS knows. Unknown mints are left out. */
  getAssetBatch(mints: readonly string[]): Promise<AssetMetadata[]>;
  /** Latest enhanced transactions involving `address`, newest first. */
  getAddressTransactions(address: string, options?: { limit?: number }): Promise<unknown[]>;
}

export interface HeliusClientOptions {
  apiKey: string;
  cluster: SolanaCluster;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// getAssetBatch accepts up to 1000 ids; smaller chunks keep responses quick.
const ASSET_BATCH_SIZE = 100;

// Base URLs as used by helius-sdk.
const RPC_URL: Record<SolanaCluster, string> = {
  devnet: 'https://devnet.helius-rpc.com/',
  'mainnet-beta': 'https://mainnet.helius-rpc.com/',
};
const ENHANCED_API_URL: Record<SolanaCluster, string> = {
  devnet: 'https://api-devnet.helius.xyz/v0',
  'mainnet-beta': 'https://api-mainnet.helius-rpc.com/v0',
};

const assetSchema = z.looseObject({
  id: z.string(),
  content: z
    .looseObject({
      metadata: z
        .looseObject({ name: z.string().nullish(), symbol: z.string().nullish() })
        .nullish(),
      links: z.looseObject({ image: z.string().nullish() }).nullish(),
    })
    .nullish(),
  token_info: z
    .looseObject({
      symbol: z.string().nullish(),
      decimals: z.number().nullish(),
      supply: z.number().nullish(),
    })
    .nullish(),
});

const assetBatchResponse = z.object({
  result: z.array(z.unknown().nullable()).nullish(),
  error: z.object({ message: z.string() }).nullish(),
});

export class HeliusError extends Error {
  override name = 'HeliusError';
}

export function createHeliusClient(options: HeliusClientOptions): HeliusClient {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const rpcUrl = `${RPC_URL[options.cluster]}?api-key=${encodeURIComponent(options.apiKey)}`;

  async function request(url: string, init?: RequestInit): Promise<unknown> {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      // Don't echo the URL: it carries the API key.
      throw new HeliusError(`Helius HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    async getAssetBatch(mints) {
      const assets: AssetMetadata[] = [];
      for (let i = 0; i < mints.length; i += ASSET_BATCH_SIZE) {
        const ids = mints.slice(i, i + ASSET_BATCH_SIZE);
        const body = assetBatchResponse.parse(
          await request(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'sift',
              method: 'getAssetBatch',
              params: { ids },
            }),
          }),
        );
        if (body.error) throw new HeliusError(`Helius getAssetBatch: ${body.error.message}`);
        for (const raw of body.result ?? []) {
          const parsed = assetSchema.safeParse(raw);
          if (parsed.success) assets.push(toMetadata(parsed.data));
        }
      }
      return assets;
    },

    async getAddressTransactions(address, { limit = 100 } = {}) {
      const url =
        `${ENHANCED_API_URL[options.cluster]}/addresses/${encodeURIComponent(address)}/transactions` +
        `?api-key=${encodeURIComponent(options.apiKey)}&limit=${limit}`;
      const body = await request(url);
      if (!Array.isArray(body)) throw new HeliusError('Helius: expected an array of transactions');
      return body;
    },
  };
}

function toMetadata(asset: z.infer<typeof assetSchema>): AssetMetadata {
  const metadata = asset.content?.metadata;
  return {
    mint: asset.id,
    name: nonEmpty(metadata?.name, MAX_NAME_LENGTH),
    symbol:
      nonEmpty(metadata?.symbol, MAX_SYMBOL_LENGTH) ??
      nonEmpty(asset.token_info?.symbol, MAX_SYMBOL_LENGTH),
    imageUrl: httpsUrl(asset.content?.links?.image),
    decimals: asset.token_info?.decimals ?? undefined,
    supply: asset.token_info?.supply ?? undefined,
  };
}

// Names and symbols are chosen by whoever launched the token; cap what we store.
const MAX_NAME_LENGTH = 64;
const MAX_SYMBOL_LENGTH = 16;

function nonEmpty(value: string | null | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim().slice(0, maxLength);
  return trimmed ? trimmed : undefined;
}

/** Token images are attacker-controlled; only pass on plain https URLs. */
function httpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}
