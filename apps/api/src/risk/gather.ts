import { pumpBondingCurveAddress } from '@sift/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { HeliusClient } from '../helius/client';
import { parseTransactions } from '../helius/parse';
import type { TokenRepository } from '../tokens/repository';
import type { CreatorHistory, Holder, MintInfo, RiskInputs, SellTest } from './inputs';
import type { JupiterClient } from './jupiter';
import { BURN_OWNERS, POOL_AUTHORITIES, VENUE_PROGRAMS } from './venues';

export interface GatherDeps {
  helius: HeliusClient;
  /** Null on devnet, where Jupiter has no routes. */
  jupiter: JupiterClient | null;
  repository: TokenRepository;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

/** How many CREATE transactions to scan in a creator's history. */
const LAUNCH_HISTORY_LIMIT = 100;
/** Test sale size: 0.1% of the supply. */
const SELL_TEST_BPS_OF_SUPPLY = 10n;

/**
 * Fetch everything the checks need. Returns null when the address is not a token mint.
 * Each source fails independently: a failure becomes `undefined` for that input only.
 */
export async function gatherRiskInputs(mint: string, deps: GatherDeps): Promise<RiskInputs | null> {
  const guard = async <T>(what: string, task: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await task();
    } catch (err) {
      deps.log.warn({ err, mint, what }, 'risk input unavailable');
      return undefined;
    }
  };

  // The mint first: if the address isn't a token, skip every other lookup.
  const mintInfo = await guard('mint', () => deps.helius.getMint(mint));
  if (mintInfo === null) return null;

  const [holders, creatorHistory, sellTest] = await Promise.all([
    guard('holders', () => fetchHolders(mint, deps.helius)),
    guard('creator', () => fetchCreatorHistory(mint, deps)),
    mintInfo ? guard('sell test', () => runSellTest(mint, mintInfo, deps.jupiter)) : undefined,
  ]);

  return { mint, mintInfo, holders, creatorHistory, sellTest };
}

/** pump.fun's bonding curve for `mint`: the only pump.fun account that is this token's curve. */
export const pumpBondingCurve = pumpBondingCurveAddress;

async function fetchHolders(mint: string, helius: HeliusClient): Promise<Holder[]> {
  const byOwner = new Map<string, Holder>();
  const curve = pumpBondingCurve(mint);
  for (const account of await helius.getLargestTokenAccounts(mint)) {
    const existing = byOwner.get(account.owner);
    if (existing) {
      existing.amount += account.amount;
      continue;
    }
    let venue =
      POOL_AUTHORITIES.get(account.owner) ??
      (account.ownerProgram ? VENUE_PROGRAMS.get(account.ownerProgram) : undefined);
    // Anyone can park tokens under another token's curve (or any pump.fun account), so
    // only this mint's own curve counts as its curve.
    if (venue === 'pump.fun bonding curve' && account.owner !== curve) venue = undefined;
    byOwner.set(account.owner, {
      owner: account.owner,
      amount: account.amount,
      kind: BURN_OWNERS.has(account.owner) ? 'burn' : venue ? 'pool' : 'wallet',
      venue,
    });
  }
  return [...byOwner.values()];
}

/** The creator is the fee payer of the launch: from our database, else from Helius. */
async function fetchCreatorHistory(mint: string, deps: GatherDeps): Promise<CreatorHistory | null> {
  const creator =
    (await deps.repository.getToken(mint))?.creator ??
    parseTransactions(
      await deps.helius.getAddressTransactions(mint, { type: 'CREATE', limit: 1 }),
    ).launches.find((launch) => launch.mint === mint)?.creator;
  if (!creator) return null;

  const transactions = await deps.helius.getAddressTransactions(creator, {
    type: 'CREATE',
    limit: LAUNCH_HISTORY_LIMIT,
  });
  const launchedMints = [
    ...new Set(
      parseTransactions(transactions)
        .launches.filter((launch) => launch.creator === creator)
        .map((launch) => launch.mint),
    ),
  ];
  return { creator, launchedMints, truncated: transactions.length >= LAUNCH_HISTORY_LIMIT };
}

async function runSellTest(
  mint: string,
  mintInfo: MintInfo,
  jupiter: JupiterClient | null,
): Promise<SellTest> {
  if (!jupiter) return { status: 'unavailable', reason: 'test sales need mainnet' };
  const amount = (mintInfo.supply * SELL_TEST_BPS_OF_SUPPLY) / 10_000n;
  if (amount === 0n) return { status: 'unavailable', reason: 'supply too small' };
  const quote = await jupiter.quoteSell(mint, amount);
  return quote.status === 'quoted'
    ? { ...quote, amountPctOfSupply: Number(SELL_TEST_BPS_OF_SUPPLY) / 100 }
    : quote;
}
