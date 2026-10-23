import {
  ASSOCIATED_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  type TradeQuote,
  associatedTokenAddress,
  base58Decode,
  bytesToBase64,
  pumpBondingCurveAddress,
  pumpVolumeAccumulatorAddress,
  solanaKeys,
} from '@sift/shared';
import { describe, expect, it, vi } from 'vitest';
import { type ChainReader, createRpcReader, onChainProblems } from './chain-check';

const MINT = 'E8NT2qghrktonV3RSSAc9nRmhhNxganaFo7ZWZpAFdCf';
const WALLET = solanaKeys.publicKey(new Uint8Array(32).fill(3));

/** A one-instruction legacy transaction calling `program` (enough for the ATA lookup). */
function txCalling(program: string) {
  return bytesToBase64(
    Uint8Array.from([
      1,
      ...new Array(64).fill(0),
      1,
      0,
      1,
      2,
      ...base58Decode(WALLET),
      ...base58Decode(program),
      ...new Array(32).fill(7),
      1,
      1,
      0,
      0,
    ]),
  );
}

/** A bonding curve account: discriminator, reserves, complete flag. */
function curveData(tokens: bigint, sol: bigint, complete = false) {
  const data = new Uint8Array(81);
  data.set([23, 183, 248, 55, 96, 216, 172, 96]);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, tokens, true);
  view.setBigUint64(16, sol, true);
  data[48] = complete ? 1 : 0;
  return data;
}

function mintData(decimals: number) {
  const data = new Uint8Array(82);
  data[44] = decimals;
  return data;
}

const TOKENS = 1_000_000_000_000_000n;
const SOL = 30_000_000_000n;
const rent = (space: number) => (128 + space) * 6960;

function reader(overrides: { ata?: boolean; accumulator?: boolean; decimals?: number } = {}) {
  const byAddress = new Map<string, { owner: string; data: Uint8Array }>([
    [pumpBondingCurveAddress(MINT), { owner: 'pump', data: curveData(TOKENS, SOL) }],
    [MINT, { owner: TOKEN_2022_PROGRAM, data: mintData(overrides.decimals ?? 6) }],
  ]);
  if (overrides.accumulator)
    byAddress.set(pumpVolumeAccumulatorAddress(WALLET), {
      owner: 'pump',
      data: new Uint8Array(137),
    });
  if (overrides.ata) {
    byAddress.set(associatedTokenAddress(WALLET, MINT, TOKEN_2022_PROGRAM), {
      owner: TOKEN_2022_PROGRAM,
      data: new Uint8Array(170),
    });
  }
  return {
    accounts: vi.fn(async (addresses: readonly string[]) =>
      addresses.map((a) => byAddress.get(a) ?? null),
    ),
    rentExempt: vi.fn(async (space: number) => rent(space)),
  } satisfies ChainReader;
}

// A first buy of 0.1 SOL at the curve price, minus a 1.25% fee.
const sol = 100_000_000n;
const fairTokens = (((sol * 9875n) / 10_000n) * TOKENS) / (SOL + (sol * 9875n) / 10_000n);
const buy = (q: Partial<TradeQuote> = {}): TradeQuote =>
  ({
    side: 'buy',
    mint: MINT,
    wallet: WALLET,
    tokenAmount: fairTokens.toString(),
    tokenDecimals: 6,
    expectedLamports: Number(sol),
    transaction: txCalling(ASSOCIATED_TOKEN_PROGRAM),
    fees: { accountRentLamports: rent(170) + rent(137) },
    ...q,
  }) as TradeQuote;

describe('on-chain checks of a quote', () => {
  it('accepts a quote that matches the chain: price, decimals and deposits', async () => {
    expect(await onChainProblems(buy(), reader())).toEqual([]);
  });

  it('refuses a quote far below the on-chain price', async () => {
    const problems = await onChainProblems(
      buy({ tokenAmount: ((fairTokens * 9n) / 10n).toString() }),
      reader(),
    );
    expect(problems).toEqual(['the quote gives fewer tokens than the price on chain']);
  });

  it('refuses wrong decimals and understated deposits', async () => {
    expect(await onChainProblems(buy(), reader({ decimals: 9 }))).toContain(
      'token decimals differ from the chain, so the amount shown is wrong',
    );
    // The wallet has bought on pump.fun before: no tracker deposit is due.
    expect(
      await onChainProblems(
        buy({ fees: { accountRentLamports: rent(170) } } as Partial<TradeQuote>),
        reader({ accumulator: true }),
      ),
    ).toEqual([]);
    expect(
      await onChainProblems(
        buy({ fees: { accountRentLamports: 0 } } as Partial<TradeQuote>),
        reader(),
      ),
    ).toContain('the deposit for new accounts differs from what the chain says');
  });

  it('refuses when the token or its curve is missing', async () => {
    const empty: ChainReader = {
      accounts: async (a) => a.map(() => null),
      rentExempt: async () => 0,
    };
    expect(await onChainProblems(buy(), empty)).toEqual(['the token was not found on chain']);
  });
});

describe('createRpcReader', () => {
  it('calls Solana JSON-RPC and decodes accounts', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ result: { value: [{ owner: 'O', data: ['AQID', 'base64'] }, null] } }),
        ),
    );
    const accounts = await createRpcReader('https://rpc.example', fetchFn as typeof fetch).accounts(
      ['A', 'B'],
    );
    expect(accounts).toEqual([{ owner: 'O', data: Uint8Array.from([1, 2, 3]) }, null]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://rpc.example');
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'getMultipleAccounts',
      params: [['A', 'B'], { encoding: 'base64' }],
    });
  });

  it('fails on RPC errors rather than guessing', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'busy' } })));
    await expect(
      createRpcReader('https://rpc.example', fetchFn as typeof fetch).rentExempt(1),
    ).rejects.toThrow();
  });
});
