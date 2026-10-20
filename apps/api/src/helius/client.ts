import type { SolanaCluster } from '@sift/shared';
import { z } from 'zod';
import type { MintInfo } from '../risk/inputs';

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
  /** Latest enhanced transactions involving `address`, newest first, optionally of one type. */
  getAddressTransactions(
    address: string,
    options?: { limit?: number; type?: string },
  ): Promise<unknown[]>;
  /** Mint account details; null if the address is not a token mint. */
  getMint(mint: string): Promise<MintInfo | null>;
  /** Largest token accounts (up to 20) with their owner and the owner's program. */
  getLargestTokenAccounts(mint: string): Promise<TokenAccountHolding[]>;
  /** Fungible tokens (first 100, non-zero) and SOL held by a wallet. */
  getWalletHoldings(owner: string): Promise<WalletHoldings>;
}

export interface WalletHoldings {
  lamports: number;
  /** `amount` in whole tokens; `amountRaw` exact, in base units. */
  tokens: Array<AssetMetadata & { amount: number; amountRaw: string; decimals: number }>;
}

export interface TokenAccountHolding {
  owner: string;
  /** Program that owns the owner account; null for plain wallets or accounts without data. */
  ownerProgram: string | null;
  amount: bigint;
}

const TOKEN_PROGRAMS: Record<string, MintInfo['tokenProgram']> = {
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'spl-token',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'spl-token-2022',
};
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

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

const rpcResponse = z.object({
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).nullish(),
});

const parsedMintAccount = z.object({
  owner: z.string(),
  data: z.object({
    parsed: z.object({
      type: z.literal('mint'),
      info: z.looseObject({
        mintAuthority: z.string().nullable(),
        freezeAuthority: z.string().nullable(),
        supply: z.string(),
        decimals: z.number(),
        extensions: z
          .array(
            z.looseObject({
              extension: z.string(),
              state: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .optional(),
      }),
    }),
  }),
});

const largestAccounts = z.object({
  value: z.array(z.object({ address: z.string(), amount: z.string() })),
});

const parsedTokenAccount = z.object({
  data: z.object({
    parsed: z.object({ info: z.looseObject({ owner: z.string() }) }),
  }),
});

const accountOwners = z.object({
  value: z.array(z.object({ owner: z.string() }).nullable()),
});

const ownerAssets = z.object({
  items: z.array(z.unknown()),
  nativeBalance: z.looseObject({ lamports: z.number() }).nullish(),
});

const tokenBalance = z.looseObject({
  token_info: z.looseObject({ balance: z.number(), decimals: z.number() }),
});

const assetBatchResponse = z.object({
  result: z.array(z.unknown().nullable()).nullish(),
  error: z.object({ message: z.string() }).nullish(),
});

export class HeliusError extends Error {
  override name = 'HeliusError';
}

/** Helius' Solana RPC endpoint for a cluster. Carries the API key: never log it. */
export function heliusRpcUrl(cluster: SolanaCluster, apiKey: string): string {
  return `${RPC_URL[cluster]}?api-key=${encodeURIComponent(apiKey)}`;
}

export function createHeliusClient(options: HeliusClientOptions): HeliusClient {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const rpcUrl = heliusRpcUrl(options.cluster, options.apiKey);

  async function request(url: string, init?: RequestInit): Promise<unknown> {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      // Don't echo the URL: it carries the API key.
      throw new HeliusError(`Helius HTTP ${res.status}`);
    }
    return res.json();
  }

  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const body = rpcResponse.parse(
      await request(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'sift', method, params }),
      }),
    );
    if (body.error) throw new HeliusError(`Helius ${method}: ${body.error.message}`);
    return body.result;
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

    async getAddressTransactions(address, { limit = 100, type } = {}) {
      const url =
        `${ENHANCED_API_URL[options.cluster]}/addresses/${encodeURIComponent(address)}/transactions` +
        `?api-key=${encodeURIComponent(options.apiKey)}&limit=${limit}` +
        (type ? `&type=${encodeURIComponent(type)}` : '');
      const body = await request(url);
      if (!Array.isArray(body)) throw new HeliusError('Helius: expected an array of transactions');
      return body;
    },

    async getMint(mint) {
      const result = z
        .object({ value: z.unknown().nullable() })
        .parse(await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]));
      const account = parsedMintAccount.safeParse(result.value);
      const tokenProgram = account.success ? TOKEN_PROGRAMS[account.data.owner] : undefined;
      if (!account.success || !tokenProgram) return null;
      const info = account.data.data.parsed.info;
      return {
        mintAuthority: info.mintAuthority,
        freezeAuthority: info.freezeAuthority,
        supply: BigInt(info.supply),
        decimals: info.decimals,
        tokenProgram,
        extensions: info.extensions ?? [],
      };
    },

    async getWalletHoldings(owner) {
      // DAS takes named params, unlike the positional Solana RPC methods.
      const body = rpcResponse.parse(
        await request(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'sift',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: owner,
              page: 1,
              limit: 100,
              options: { showFungible: true, showNativeBalance: true, showZeroBalance: false },
            },
          }),
        }),
      );
      if (body.error) throw new HeliusError(`Helius getAssetsByOwner: ${body.error.message}`);
      const result = ownerAssets.parse(body.result);

      const tokens = result.items.flatMap((raw) => {
        const asset = assetSchema.safeParse(raw);
        const balance = tokenBalance.safeParse(raw);
        if (!asset.success || !balance.success) return [];
        const { balance: units, decimals } = balance.data.token_info;
        if (units <= 0) return [];
        return [
          {
            ...toMetadata(asset.data),
            amount: units / 10 ** decimals,
            amountRaw: BigInt(units).toString(),
            decimals,
          },
        ];
      });
      return { lamports: result.nativeBalance?.lamports ?? 0, tokens };
    },

    async getLargestTokenAccounts(mint) {
      const largest = largestAccounts.parse(await rpc('getTokenLargestAccounts', [mint]));
      if (largest.value.length === 0) return [];

      // Token account -> owner wallet/PDA -> the program that owns that account.
      const tokenAccounts = z
        .object({ value: z.array(z.unknown().nullable()) })
        .parse(
          await rpc('getMultipleAccounts', [
            largest.value.map((a) => a.address),
            { encoding: 'jsonParsed' },
          ]),
        );
      const owners = tokenAccounts.value.map((raw) => {
        const parsed = parsedTokenAccount.safeParse(raw);
        return parsed.success ? parsed.data.data.parsed.info.owner : null;
      });
      const knownOwners = [...new Set(owners.filter((o): o is string => o !== null))];
      const ownerAccounts = accountOwners.parse(
        await rpc('getMultipleAccounts', [
          knownOwners,
          { encoding: 'base64', dataSlice: { offset: 0, length: 0 } },
        ]),
      );
      const programByOwner = new Map(
        knownOwners.map((owner, i) => {
          const program = ownerAccounts.value[i]?.owner ?? null;
          return [owner, program === SYSTEM_PROGRAM ? null : program];
        }),
      );

      return largest.value.flatMap((account, i) => {
        const owner = owners[i];
        if (!owner) return [];
        return [
          {
            owner,
            ownerProgram: programByOwner.get(owner) ?? null,
            amount: BigInt(account.amount),
          },
        ];
      });
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
