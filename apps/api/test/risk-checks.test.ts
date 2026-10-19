import { describe, expect, it } from 'vitest';
import {
  checkDevHistory,
  checkFreezeAuthority,
  checkHolderConcentration,
  checkLiquidity,
  checkMintAuthority,
  checkSellTest,
  checkTokenExtensions,
  pctOf,
  scoreRisk,
} from '../src/risk/checks';
import type { Holder } from '../src/risk/inputs';
import { addr } from './fixtures/helius';
import { CREATOR, RISK_MINT, cleanInputs, cleanMint, curve, pct, wallet } from './fixtures/risk';

const level = (r: { level: string }) => r.level;

describe('scoreRisk', () => {
  it('is green when every check passes, with one reason per check', () => {
    const { level: overall, reasons } = scoreRisk(cleanInputs());
    expect(overall).toBe('green');
    expect(reasons.map((r) => r.check).sort()).toEqual([
      'dev_history',
      'freeze_authority',
      'holder_concentration',
      'liquidity',
      'mint_authority',
      'sell_test',
      'token_extensions',
    ]);
    expect(reasons.every((r) => r.message.length > 10)).toBe(true);
  });

  it('takes the worst level and lists red reasons first', () => {
    const { level: overall, reasons } = scoreRisk(
      cleanInputs({ mintInfo: cleanMint({ freezeAuthority: addr('Freezer') }) }),
    );
    expect(overall).toBe('red');
    expect(reasons[0]).toMatchObject({ check: 'freeze_authority', level: 'red' });
  });

  it('never passes a token it could not check', () => {
    const { level: overall, reasons } = scoreRisk(
      cleanInputs({
        mintInfo: undefined,
        holders: undefined,
        creatorHistory: undefined,
        sellTest: undefined,
      }),
    );
    expect(overall).toBe('amber');
    expect(reasons.filter((r) => r.level === 'green')).toEqual([]);
  });
});

describe('mint authority', () => {
  it('is green when revoked', () => {
    expect(level(checkMintAuthority(cleanInputs()))).toBe('green');
  });
  it('is red when someone can still mint', () => {
    const r = checkMintAuthority(cleanInputs({ mintInfo: cleanMint({ mintAuthority: CREATOR }) }));
    expect(r).toMatchObject({ level: 'red', message: expect.stringContaining('mint new tokens') });
  });
  it('is amber when the mint could not be read', () => {
    expect(level(checkMintAuthority(cleanInputs({ mintInfo: undefined })))).toBe('amber');
  });
});

describe('freeze authority', () => {
  it('is green when revoked', () => {
    expect(level(checkFreezeAuthority(cleanInputs()))).toBe('green');
  });
  it('is red when tokens can be frozen', () => {
    const r = checkFreezeAuthority(
      cleanInputs({ mintInfo: cleanMint({ freezeAuthority: CREATOR }) }),
    );
    expect(r).toMatchObject({
      level: 'red',
      message: expect.stringContaining('freeze your tokens'),
    });
  });
  it('is amber when the mint could not be read', () => {
    expect(level(checkFreezeAuthority(cleanInputs({ mintInfo: undefined })))).toBe('amber');
  });
});

describe('token extensions', () => {
  const withExtensions = (
    ...extensions: Array<{ extension: string; state?: Record<string, unknown> }>
  ) => checkTokenExtensions(cleanInputs({ mintInfo: cleanMint({ extensions }) }));

  it('is green for a classic SPL token', () => {
    const r = checkTokenExtensions(
      cleanInputs({ mintInfo: cleanMint({ tokenProgram: 'spl-token', extensions: [] }) }),
    );
    expect(r).toMatchObject({ level: 'green', message: expect.stringContaining('Standard token') });
  });

  it('is green for Token-2022 with only metadata (how pump.fun launches)', () => {
    expect(level(checkTokenExtensions(cleanInputs()))).toBe('green');
  });

  it.each([
    [
      { extension: 'transferHook', state: { programId: addr('Hook'), authority: null } },
      'custom code',
    ],
    [{ extension: 'permanentDelegate', state: { delegate: addr('Thief') } }, 'permanent delegate'],
    [{ extension: 'nonTransferable', state: {} }, 'cannot be transferred'],
    [{ extension: 'defaultAccountState', state: { accountState: 'frozen' } }, 'start frozen'],
    [
      { extension: 'pausable', state: { authority: CREATOR, paused: false } },
      'pause all transfers',
    ],
  ])('is red for %o', (extension, text) => {
    expect(withExtensions(extension)).toMatchObject({
      level: 'red',
      message: expect.stringContaining(text),
    });
  });

  it('ignores extensions that were set up but switched off', () => {
    expect(
      level(
        withExtensions(
          { extension: 'transferHook', state: { programId: null, authority: null } },
          { extension: 'permanentDelegate', state: { delegate: null } },
          { extension: 'defaultAccountState', state: { accountState: 'initialized' } },
        ),
      ),
    ).toBe('green');
  });

  const fee = (bps: number) => ({
    extension: 'transferFeeConfig',
    state: {
      olderTransferFee: { transferFeeBasisPoints: 0, epoch: 1, maximumFee: 0 },
      newerTransferFee: { transferFeeBasisPoints: bps, epoch: 2, maximumFee: 1e9 },
    },
  });

  it('is amber for a small transfer fee and red for a large one', () => {
    expect(withExtensions(fee(300))).toMatchObject({
      level: 'amber',
      message: expect.stringContaining('3% fee'),
    });
    expect(withExtensions(fee(2500))).toMatchObject({
      level: 'red',
      message: expect.stringContaining('25% fee'),
    });
    expect(level(withExtensions(fee(0)))).toBe('green');
  });

  it('is amber when the mint could not be read', () => {
    expect(level(checkTokenExtensions(cleanInputs({ mintInfo: undefined })))).toBe('amber');
  });
});

describe('holder concentration', () => {
  const withHolders = (holders: Holder[]) => checkHolderConcentration(cleanInputs({ holders }));

  it('is green when wallets hold little, ignoring the bonding curve', () => {
    const r = withHolders([curve(85), wallet('A', 3), wallet('B', 2)]);
    expect(r).toMatchObject({
      level: 'green',
      message: expect.stringContaining('hold 5% of the supply'),
    });
  });

  it('is amber when the top 10 hold 30% or more', () => {
    const holders = Array.from({ length: 10 }, (_, i) =>
      wallet(`W${String.fromCharCode(65 + i)}`, 3.2),
    );
    expect(level(withHolders(holders))).toBe('amber');
  });

  it('is red when the top 10 hold half the supply', () => {
    const holders = Array.from({ length: 10 }, (_, i) =>
      wallet(`W${String.fromCharCode(65 + i)}`, 5),
    );
    expect(level(withHolders(holders))).toBe('red');
  });

  it('only counts the top 10 wallets', () => {
    const holders = Array.from({ length: 15 }, (_, i) =>
      wallet(`W${String.fromCharCode(65 + i)}`, 2.5),
    );
    expect(withHolders(holders).message).toContain('hold 25% of the supply');
  });

  it('flags a single large wallet even when the rest are small', () => {
    expect(level(withHolders([wallet('A', 12)]))).toBe('amber');
    expect(level(withHolders([wallet('A', 21)]))).toBe('red');
  });

  it('names the creator when they are the largest holder', () => {
    const r = withHolders([{ ...wallet('X', 35), owner: CREATOR }, wallet('A', 2)]);
    expect(r).toMatchObject({
      level: 'red',
      message: expect.stringContaining('largest: 35%, the creator'),
    });
  });

  it('does not count burned tokens or pools', () => {
    const r = withHolders([
      { owner: addr('Burn'), amount: pct(40), kind: 'burn' },
      { owner: addr('Pool'), amount: pct(40), kind: 'pool', venue: 'Raydium' },
      wallet('A', 1),
    ]);
    expect(level(r)).toBe('green');
  });

  it('is amber when holders could not be fetched', () => {
    expect(level(withHolders(undefined as unknown as Holder[]))).toBe('amber');
  });
});

describe('liquidity', () => {
  it('is green while the pump.fun bonding curve holds the liquidity', () => {
    const r = checkLiquidity(cleanInputs());
    expect(r).toMatchObject({ level: 'green', message: expect.stringContaining('bonding curve') });
  });

  it('does not count a bonding curve that has been emptied (migrated)', () => {
    const r = checkLiquidity(cleanInputs({ holders: [curve(0.2), wallet('A', 2)] }));
    expect(level(r)).toBe('red');
  });

  it('is amber for an AMM pool, since the lock is not verified yet', () => {
    const r = checkLiquidity(
      cleanInputs({
        holders: [{ owner: addr('Pool'), amount: pct(30), kind: 'pool', venue: 'PumpSwap' }],
      }),
    );
    expect(r).toMatchObject({ level: 'amber', message: expect.stringContaining('PumpSwap') });
  });

  it('is red when no pool holds any of the token', () => {
    expect(
      level(checkLiquidity(cleanInputs({ holders: [wallet('A', 60), wallet('B', 40)] }))),
    ).toBe('red');
  });

  it('is amber when holders could not be fetched', () => {
    expect(level(checkLiquidity(cleanInputs({ holders: undefined })))).toBe('amber');
  });
});

describe('dev history', () => {
  const launched = (others: number, truncated = false) =>
    checkDevHistory(
      cleanInputs({
        creatorHistory: {
          creator: CREATOR,
          launchedMints: [
            RISK_MINT,
            ...Array.from({ length: others }, (_, i) => addr(`M${String.fromCharCode(65 + i)}`)),
          ],
          truncated,
        },
      }),
    );

  it('is green for a first launch or one other', () => {
    expect(launched(0)).toMatchObject({
      level: 'green',
      message: expect.stringContaining('No other launches'),
    });
    expect(launched(1)).toMatchObject({
      level: 'green',
      message: expect.stringContaining('1 other token'),
    });
  });

  it('is amber for a few other launches', () => {
    expect(launched(3)).toMatchObject({
      level: 'amber',
      message: expect.stringContaining('3 other tokens'),
    });
  });

  it('is red for a serial launcher, and says when the count is a lower bound', () => {
    expect(launched(5)).toMatchObject({
      level: 'red',
      message: expect.stringContaining('Serial launching'),
    });
    expect(launched(99, true).message).toContain('99+ other tokens');
  });

  it('is amber when the creator is unknown or the lookup failed', () => {
    expect(checkDevHistory(cleanInputs({ creatorHistory: null })).message).toContain(
      "Couldn't identify",
    );
    expect(checkDevHistory(cleanInputs({ creatorHistory: undefined })).message).toContain(
      "Couldn't look up",
    );
  });
});

describe('sell test (honeypot)', () => {
  const quoted = (priceImpactPct: number) =>
    checkSellTest(
      cleanInputs({
        holders: [{ owner: addr('Pool'), amount: pct(30), kind: 'pool', venue: 'Raydium' }],
        sellTest: { status: 'quoted', amountPctOfSupply: 0.1, priceImpactPct, routes: ['Raydium'] },
      }),
    );

  it('is green when a test sale finds a route with low impact', () => {
    expect(quoted(1.2)).toMatchObject({
      level: 'green',
      message: expect.stringContaining('via Raydium'),
    });
  });

  it('is amber or red as the price impact grows', () => {
    expect(level(quoted(15))).toBe('amber');
    expect(quoted(45)).toMatchObject({ level: 'red', message: expect.stringContaining('45%') });
  });

  it('is red when no route to sell exists', () => {
    const r = checkSellTest(
      cleanInputs({
        holders: [wallet('A', 50)],
        sellTest: { status: 'no_route', reason: 'not tradable' },
      }),
    );
    expect(r).toMatchObject({ level: 'red', message: expect.stringContaining('no way to sell') });
  });

  it('is green on an active bonding curve even without a quote (devnet)', () => {
    expect(checkSellTest(cleanInputs())).toMatchObject({
      level: 'green',
      message: expect.stringContaining('buys tokens back'),
    });
  });

  it('is amber when no test sale ran and there is no bonding curve', () => {
    const r = checkSellTest(
      cleanInputs({
        holders: [{ owner: addr('Pool'), amount: pct(30), kind: 'pool', venue: 'Orca' }],
      }),
    );
    expect(level(r)).toBe('amber');
  });
});

describe('pctOf', () => {
  it('works on raw amounts too large for floating point', () => {
    expect(pctOf(123_456_789_000_000_000n, 1_000_000_000_000_000_000n)).toBe(12.34);
    expect(pctOf(1n, 0n)).toBe(0);
  });
});
