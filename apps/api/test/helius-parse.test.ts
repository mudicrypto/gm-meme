import { WSOL_MINT } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import { parseTransactions } from '../src/helius/parse';
import {
  ALICE,
  BOB,
  DEV,
  MINT_A,
  MINT_B,
  T0,
  addr,
  buyTx,
  createTx,
  failedTx,
  sellForWsolTx,
} from './fixtures/helius';
import devnetPump from './fixtures/helius-devnet-pump.json';

describe('parseTransactions', () => {
  it('reads a pump.fun launch', () => {
    const { launches, swaps } = parseTransactions([createTx(MINT_A, DEV, T0)]);
    expect(swaps).toEqual([]);
    expect(launches).toEqual([
      {
        mint: MINT_A,
        creator: DEV,
        launchSignature: `create-${MINT_A}`,
        launchSource: 'PUMP_FUN',
        launchedAt: '2026-10-19T10:00:00.000Z',
      },
    ]);
  });

  it('reads a native SOL buy, ignoring the fee transfer for volume', () => {
    const { swaps } = parseTransactions([buyTx(MINT_A, ALICE, 1.5, T0)]);
    expect(swaps).toEqual([
      {
        signature: `buy-${MINT_A}-${ALICE}-${T0}`,
        mint: MINT_A,
        trader: ALICE,
        volumeSol: 1.5,
        blockTime: '2026-10-19T10:00:00.000Z',
      },
    ]);
  });

  it('reads a sell for wrapped SOL and never treats wSOL as the traded token', () => {
    const { swaps } = parseTransactions([sellForWsolTx(MINT_B, BOB, '0.25', T0)]);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toMatchObject({ mint: MINT_B, trader: BOB, volumeSol: 0.25 });
    expect(swaps.map((s) => s.mint)).not.toContain(WSOL_MINT);
  });

  it('leaves volume empty for token-to-token swaps', () => {
    const tx = { ...buyTx(MINT_A, ALICE, 1, T0), nativeTransfers: [] };
    expect(parseTransactions([tx]).swaps[0]?.volumeSol).toBeUndefined();
  });

  it('skips failed transactions', () => {
    expect(parseTransactions([failedTx(MINT_A)])).toEqual({ launches: [], swaps: [], invalid: 0 });
  });

  it('ignores transaction types it does not track', () => {
    const transfer = { ...buyTx(MINT_A, ALICE, 1, T0), type: 'TRANSFER' };
    expect(parseTransactions([transfer])).toEqual({ launches: [], swaps: [], invalid: 0 });
  });

  it('counts malformed entries without dropping the rest of the batch', () => {
    const batch = parseTransactions([
      null,
      { type: 'SWAP' }, // no signature
      { signature: 'x', tokenTransfers: 'nope' },
      buyTx(MINT_A, ALICE, 1, T0),
    ]);
    expect(batch.invalid).toBe(3);
    expect(batch.swaps).toHaveLength(1);
  });

  it('drops mints and traders that are not Solana addresses', () => {
    const badMint = { ...buyTx(MINT_A, ALICE, 1, T0) };
    badMint.tokenTransfers = [{ ...badMint.tokenTransfers[0]!, mint: 'not-a-mint' }];
    const badTrader = { ...buyTx(MINT_A, ALICE, 1, T0), feePayer: 'nobody' };
    expect(parseTransactions([badMint, badTrader]).swaps).toEqual([]);
  });

  it('only takes the newly minted token from a launch with other transfers', () => {
    const tx = createTx(MINT_A, DEV, T0);
    tx.tokenTransfers.push({
      fromUserAccount: DEV,
      toUserAccount: addr('Other'),
      fromTokenAccount: '',
      toTokenAccount: '',
      mint: MINT_B,
      tokenAmount: 1,
    });
    expect(parseTransactions([tx]).launches.map((l) => l.mint)).toEqual([MINT_A]);
  });
});

// Real pump.fun transactions captured from Helius devnet (trimmed), so the parser is
// pinned to what Helius actually sends, not just to our hand-written fixtures.

describe('parseTransactions: real Helius devnet pump.fun payloads', () => {
  const [createWithBuy, createOnly, buy, sell, unknown] = devnetPump;
  const parse = (tx: unknown) => parseTransactions([tx]);

  it('finds the mint of a create with a dev buy', () => {
    expect(parse(createWithBuy).launches).toMatchObject([
      {
        mint: 'GEtph2tD2kxEKFJqwKYBa8hua8mQDQ3ttsGxhAQziUT5',
        creator: 'A1Qx18n8YWDHHNfH9GU4jJmmP1XtN52RcqCSQjCRMY6q',
        launchSource: 'PUMP_FUN',
      },
    ]);
  });

  it('finds the mint of a create with no token transfers, from balance changes', () => {
    expect(parse(createOnly).launches.map((l) => l.mint)).toEqual([
      'E8NT2qghrktonV3RSSAc9nRmhhNxganaFo7ZWZpAFdCf',
    ]);
  });

  it('sizes a buy from the SOL the trader spent', () => {
    expect(parse(buy).swaps).toMatchObject([
      { mint: 'GEtph2tD2kxEKFJqwKYBa8hua8mQDQ3ttsGxhAQziUT5', volumeSol: 0.01286504 },
    ]);
  });

  it('sizes a sell from the SOL the trader received, which is not a transfer', () => {
    // nativeTransfers only holds a 0.00005 SOL fee; the proceeds are a balance change.
    expect(parse(sell).swaps[0]?.volumeSol).toBeCloseTo(0.004744959, 9);
  });

  it('ignores pump.fun transactions Helius cannot classify', () => {
    expect(parse(unknown)).toEqual({ launches: [], swaps: [], invalid: 0 });
  });
});
