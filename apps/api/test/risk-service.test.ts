import { RISK_DISCLAIMER } from '@sift/shared';
import { describe, expect, it, vi } from 'vitest';
import { createRiskService } from '../src/risk/service';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { addr, createTx } from './fixtures/helius';
import { CREATOR, RISK_MINT, cleanMint, pct } from './fixtures/risk';
import { fakeHelius, silentLog } from './helpers/fake-helius';

const PUMP_FUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const T = Date.UTC(2026, 9, 19, 12) / 1000;

/** Helius returning a clean pump.fun token whose creator launched `otherLaunches` other tokens. */
function heliusFor({ otherLaunches = 0 } = {}) {
  const helius = fakeHelius();
  helius.getMint.mockResolvedValue(cleanMint());
  helius.getLargestTokenAccounts.mockResolvedValue([
    { owner: addr('Curve'), ownerProgram: PUMP_FUN, amount: pct(80) },
    { owner: CREATOR, ownerProgram: null, amount: pct(4) },
    { owner: addr('Buyer'), ownerProgram: null, amount: pct(1) },
    { owner: addr('Buyer'), ownerProgram: null, amount: pct(1) }, // second account, same owner
  ]);
  helius.getAddressTransactions.mockImplementation(async (address, options) => {
    if (options?.type !== 'CREATE') return [];
    if (address === RISK_MINT) return [createTx(RISK_MINT, CREATOR, T)];
    if (address === CREATOR) {
      const others = Array.from({ length: otherLaunches }, (_, i) =>
        createTx(addr(`Prev${String.fromCharCode(65 + i)}`), CREATOR, T - 3600 * (i + 1)),
      );
      return [createTx(RISK_MINT, CREATOR, T), ...others];
    }
    return [];
  });
  return helius;
}

function setup(helius = heliusFor(), now = () => new Date('2026-10-19T12:00:00Z')) {
  const repository = new InMemoryTokenRepository();
  const risk = createRiskService({ helius, jupiter: null, repository, log: silentLog, now });
  return { risk, repository, helius };
}

describe('risk service', () => {
  it('scores a clean pump.fun token green with the disclaimer', async () => {
    const score = await setup().risk.getRisk(RISK_MINT);
    expect(score).toMatchObject({ mint: RISK_MINT, level: 'green', disclaimer: RISK_DISCLAIMER });
    expect(score?.checkedAt).toBe('2026-10-19T12:00:00.000Z');
    expect(score?.reasons.find((r) => r.check === 'holder_concentration')?.message).toContain(
      'hold 6% of the supply',
    );
  });

  it('merges token accounts of the same owner before ranking holders', async () => {
    const helius = heliusFor();
    helius.getLargestTokenAccounts.mockResolvedValue([
      { owner: addr('Curve'), ownerProgram: PUMP_FUN, amount: pct(60) },
      ...Array.from({ length: 4 }, () => ({
        owner: addr('Whale'),
        ownerProgram: null,
        amount: pct(6),
      })),
    ]);
    const score = await setup(helius).risk.getRisk(RISK_MINT);
    expect(score?.reasons.find((r) => r.check === 'holder_concentration')).toMatchObject({
      level: 'red',
      message: expect.stringContaining('largest: 24%'),
    });
  });

  it('flags a serial launcher found through Helius history', async () => {
    const score = await setup(heliusFor({ otherLaunches: 6 })).risk.getRisk(RISK_MINT);
    expect(score?.level).toBe('red');
    expect(score?.reasons[0]).toMatchObject({
      check: 'dev_history',
      message: expect.stringContaining('6 other'),
    });
  });

  it('uses the creator stored at launch and skips the Helius lookup for it', async () => {
    const { risk, repository, helius } = setup();
    await repository.upsertTokens([{ mint: RISK_MINT, creator: CREATOR }]);
    await risk.getRisk(RISK_MINT);
    const lookedUp = helius.getAddressTransactions.mock.calls.map(([address]) => address);
    expect(lookedUp).toEqual([CREATOR]);
  });

  it('returns null for an address that is not a mint, without other lookups', async () => {
    const helius = heliusFor();
    helius.getMint.mockResolvedValue(null);
    expect(await setup(helius).risk.getRisk(RISK_MINT)).toBeNull();
    expect(helius.getLargestTokenAccounts).not.toHaveBeenCalled();
  });

  it('turns a failing data source into amber for that check only', async () => {
    const helius = heliusFor();
    helius.getLargestTokenAccounts.mockRejectedValue(new Error('Helius HTTP 503'));
    const score = await setup(helius).risk.getRisk(RISK_MINT);
    expect(score?.level).toBe('amber');
    const byCheck = Object.fromEntries(score!.reasons.map((r) => [r.check, r.level]));
    expect(byCheck).toMatchObject({
      holder_concentration: 'amber',
      liquidity: 'amber',
      mint_authority: 'green',
    });
  });

  it('shares one lookup between concurrent requests and caches the result', async () => {
    const { risk, helius } = setup();
    const [a, b] = await Promise.all([risk.getRisk(RISK_MINT), risk.getRisk(RISK_MINT)]);
    await risk.getRisk(RISK_MINT);
    expect(a).toBe(b);
    expect(helius.getMint).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the cache expires, and sooner when a check could not run', async () => {
    let clock = new Date('2026-10-19T12:00:00Z').getTime();
    const helius = heliusFor();
    helius.getLargestTokenAccounts.mockRejectedValueOnce(new Error('timeout'));
    const { risk } = setup(helius, () => new Date(clock));

    await risk.getRisk(RISK_MINT); // partial: holders failed
    clock += 11_000;
    expect((await risk.getRisk(RISK_MINT))?.level).toBe('green'); // retried
    clock += 30_000;
    await risk.getRisk(RISK_MINT); // complete result still cached
    expect(helius.getMint).toHaveBeenCalledTimes(2);
    clock += 31_000;
    await risk.getRisk(RISK_MINT);
    expect(helius.getMint).toHaveBeenCalledTimes(3);
  });

  it('runs the Jupiter test sale for 0.1% of the supply when available', async () => {
    const helius = heliusFor();
    helius.getLargestTokenAccounts.mockResolvedValue([
      {
        owner: addr('Pool'),
        ownerProgram: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
        amount: pct(40),
      },
    ]);
    const jupiter = {
      quoteSell: vi.fn().mockResolvedValue({ status: 'no_route', reason: 'not tradable' }),
    };
    const risk = createRiskService({
      helius,
      jupiter,
      repository: new InMemoryTokenRepository(),
      log: silentLog,
    });
    const score = await risk.getRisk(RISK_MINT);
    expect(jupiter.quoteSell).toHaveBeenCalledWith(RISK_MINT, pct(0.1));
    expect(score?.reasons.find((r) => r.check === 'sell_test')).toMatchObject({ level: 'red' });
    expect(score?.reasons.find((r) => r.check === 'liquidity')?.message).toContain('PumpSwap');
  });
});
