import { type RiskLevel, type RiskReason, sortBySeverity, worstRiskLevel } from '@sift/shared';
import type { Holder, RiskInputs } from './inputs';

// Each check is a pure function of the gathered inputs and always returns a reason,
// so users see what was checked as well as what went wrong. Missing data is amber:
// "couldn't verify" is a reason for caution, never a pass.

type Check = (inputs: RiskInputs) => RiskReason;

const reason = (check: RiskReason['check'], level: RiskLevel, message: string): RiskReason => ({
  check,
  level,
  message,
});

export const checkMintAuthority: Check = ({ mintInfo }) => {
  if (!mintInfo)
    return reason('mint_authority', 'amber', "Couldn't check whether more tokens can be created.");
  return mintInfo.mintAuthority
    ? reason(
        'mint_authority',
        'red',
        'The creator can still mint new tokens at any time, diluting every holder.',
      )
    : reason(
        'mint_authority',
        'green',
        'Minting is switched off: no one can create more of this token.',
      );
};

export const checkFreezeAuthority: Check = ({ mintInfo }) => {
  if (!mintInfo)
    return reason('freeze_authority', 'amber', "Couldn't check whether tokens can be frozen.");
  return mintInfo.freezeAuthority
    ? reason(
        'freeze_authority',
        'red',
        'The creator can freeze your tokens, so you might not be able to sell them.',
      )
    : reason('freeze_authority', 'green', 'Freezing is switched off: no one can lock your tokens.');
};

/** Token-2022 extensions that can trap or take holders' tokens. */
export const checkTokenExtensions: Check = ({ mintInfo }) => {
  if (!mintInfo)
    return reason('token_extensions', 'amber', "Couldn't check the token's transfer rules.");
  if (mintInfo.tokenProgram === 'spl-token') {
    return reason('token_extensions', 'green', 'Standard token with no special transfer rules.');
  }

  const red: string[] = [];
  const amber: string[] = [];
  for (const { extension, state = {} } of mintInfo.extensions) {
    switch (extension) {
      case 'transferHook':
        if (state.programId) red.push('every transfer runs custom code that could block sales');
        break;
      case 'permanentDelegate':
        if (state.delegate) red.push('a permanent delegate can move or burn anyone’s tokens');
        break;
      case 'nonTransferable':
        red.push('the token cannot be transferred or sold');
        break;
      case 'defaultAccountState':
        if (state.accountState === 'frozen')
          red.push('new holders start frozen and must be unfrozen to sell');
        break;
      case 'pausable':
        if (state.authority) red.push('the creator can pause all transfers');
        break;
      case 'transferFeeConfig': {
        const pct = maxTransferFeeBps(state) / 100;
        if (pct > 10) red.push(`a ${pct}% fee is taken on every transfer`);
        else if (pct > 0) amber.push(`a ${pct}% fee is taken on every transfer`);
        break;
      }
    }
  }

  if (red.length > 0)
    return reason(
      'token_extensions',
      'red',
      `Dangerous transfer rules: ${[...red, ...amber].join('; ')}.`,
    );
  if (amber.length > 0)
    return reason(
      'token_extensions',
      'amber',
      `Transfer rules to know about: ${amber.join('; ')}.`,
    );
  return reason(
    'token_extensions',
    'green',
    'No transfer rules that could trap or take your tokens.',
  );
};

function maxTransferFeeBps(state: Record<string, unknown>): number {
  const bps = (fee: unknown) =>
    typeof fee === 'object' && fee && 'transferFeeBasisPoints' in fee
      ? Number(fee.transferFeeBasisPoints) || 0
      : 0;
  return Math.max(bps(state.newerTransferFee), bps(state.olderTransferFee));
}

export const HOLDER_THRESHOLDS = {
  top10Red: 50,
  top10Amber: 30,
  singleRed: 20,
  singleAmber: 10,
} as const;

/** Share of supply held by the largest wallets. Pools and burned tokens don't count. */
export const checkHolderConcentration: Check = ({ mintInfo, holders, creatorHistory }) => {
  if (!mintInfo || !holders || mintInfo.supply === 0n) {
    return reason(
      'holder_concentration',
      'amber',
      "Couldn't check how the supply is spread across holders.",
    );
  }
  const wallets = holders
    .filter((h) => h.kind === 'wallet')
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  const top10 = wallets.slice(0, 10);
  const top10Pct = pctOf(sum(top10), mintInfo.supply);
  const largest = top10[0];
  const largestPct = largest ? pctOf(largest.amount, mintInfo.supply) : 0;
  const largestIsCreator = largest !== undefined && largest.owner === creatorHistory?.creator;

  const detail =
    `The 10 largest wallets hold ${fmt(top10Pct)}% of the supply` +
    (largest ? ` (largest: ${fmt(largestPct)}%${largestIsCreator ? ', the creator' : ''})` : '') +
    '. Pools and burned tokens are not counted.';

  if (top10Pct >= HOLDER_THRESHOLDS.top10Red || largestPct >= HOLDER_THRESHOLDS.singleRed) {
    return reason(
      'holder_concentration',
      'red',
      `${detail} A few wallets could crash the price by selling.`,
    );
  }
  if (top10Pct >= HOLDER_THRESHOLDS.top10Amber || largestPct >= HOLDER_THRESHOLDS.singleAmber) {
    return reason('holder_concentration', 'amber', `${detail} Ownership is fairly concentrated.`);
  }
  return reason('holder_concentration', 'green', detail);
};

/** The bonding curve only counts while it still holds a real share of the supply. */
const ACTIVE_CURVE_MIN_PCT = 1;

function activeBondingCurve(inputs: RiskInputs): boolean {
  const { mintInfo, holders } = inputs;
  if (!mintInfo || !holders || mintInfo.supply === 0n) return false;
  return holders.some(
    (h) =>
      h.venue === 'pump.fun bonding curve' &&
      pctOf(h.amount, mintInfo.supply) >= ACTIVE_CURVE_MIN_PCT,
  );
}

export const checkLiquidity: Check = (inputs) => {
  if (!inputs.holders)
    return reason('liquidity', 'amber', "Couldn't check where this token's liquidity is held.");
  if (activeBondingCurve(inputs)) {
    return reason(
      'liquidity',
      'green',
      "Still on pump.fun's bonding curve: the liquidity is held by the pump.fun program and the creator can't withdraw it.",
    );
  }
  // An emptied bonding curve (the token migrated) is no longer where liquidity sits.
  const pool = inputs.holders.find(
    (h) => h.kind === 'pool' && h.venue !== 'pump.fun bonding curve',
  );
  if (pool) {
    return reason(
      'liquidity',
      'amber',
      `Trades on ${pool.venue}. Sift can't yet confirm that the pool's liquidity is locked or burned, so it may be possible to remove it.`,
    );
  }
  return reason(
    'liquidity',
    'red',
    'No liquidity pool found among the largest holders: there may be nowhere to sell.',
  );
};

export const DEV_HISTORY_THRESHOLDS = { red: 5, amber: 2 } as const;

export const checkDevHistory: Check = ({ mint, creatorHistory }) => {
  if (creatorHistory === undefined)
    return reason('dev_history', 'amber', "Couldn't look up the creator's past launches.");
  if (creatorHistory === null)
    return reason('dev_history', 'amber', "Couldn't identify the wallet that created this token.");

  const others = creatorHistory.launchedMints.filter((m) => m !== mint).length;
  const count = `${others}${creatorHistory.truncated ? '+' : ''}`;
  if (others >= DEV_HISTORY_THRESHOLDS.red) {
    return reason(
      'dev_history',
      'red',
      `The creator's wallet has launched ${count} other tokens. Serial launching is a common pattern in quick rug pulls.`,
    );
  }
  if (others >= DEV_HISTORY_THRESHOLDS.amber) {
    return reason(
      'dev_history',
      'amber',
      `The creator's wallet has launched ${count} other tokens.`,
    );
  }
  return reason(
    'dev_history',
    'green',
    others === 1
      ? "The creator's wallet has launched 1 other token."
      : "No other launches found from the creator's wallet.",
  );
};

export const SELL_IMPACT_THRESHOLDS = { red: 30, amber: 10 } as const;

/** Can this token be sold? A test sale quote, or the bonding curve's built-in buyback. */
export const checkSellTest: Check = (inputs) => {
  const { sellTest } = inputs;
  if (sellTest?.status === 'quoted') {
    const size = `A test sale of ${fmt(sellTest.amountPctOfSupply)}% of the supply`;
    const route = sellTest.routes.length > 0 ? ` via ${sellTest.routes.join(', ')}` : '';
    const impact = `${fmt(sellTest.priceImpactPct)}%`;
    if (sellTest.priceImpactPct >= SELL_IMPACT_THRESHOLDS.red) {
      return reason(
        'sell_test',
        'red',
        `${size} would drop the price by ${impact}: there is very little liquidity to sell into.`,
      );
    }
    if (sellTest.priceImpactPct >= SELL_IMPACT_THRESHOLDS.amber) {
      return reason(
        'sell_test',
        'amber',
        `${size} found a route${route} but would move the price by ${impact}.`,
      );
    }
    return reason(
      'sell_test',
      'green',
      `${size} found a route${route} with ${impact} price impact.`,
    );
  }

  // A failed test sale outweighs everything else, the curve included.
  if (sellTest?.status === 'no_route') {
    return reason(
      'sell_test',
      'red',
      `A test sale found no way to sell this token (${sellTest.reason}).`,
    );
  }
  if (activeBondingCurve(inputs)) {
    return reason(
      'sell_test',
      'green',
      "Sales go to pump.fun's bonding curve, which buys tokens back at the curve price while the curve is active.",
    );
  }
  return reason(
    'sell_test',
    'amber',
    "Couldn't run a test sale, so it's not confirmed this token can be sold.",
  );
};

export const CHECKS: readonly Check[] = [
  checkMintAuthority,
  checkFreezeAuthority,
  checkTokenExtensions,
  checkHolderConcentration,
  checkLiquidity,
  checkDevHistory,
  checkSellTest,
];

/** Run every check. The overall level is the worst one. */
export function scoreRisk(inputs: RiskInputs): { level: RiskLevel; reasons: RiskReason[] } {
  const reasons = CHECKS.map((check) => check(inputs));
  return { level: worstRiskLevel(reasons.map((r) => r.level)), reasons: sortBySeverity(reasons) };
}

function sum(holders: readonly Holder[]): bigint {
  return holders.reduce((total, h) => total + h.amount, 0n);
}

/** Percentage with two decimals of precision, computed in integers. */
export function pctOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 10_000n) / whole) / 100;
}

function fmt(pct: number): string {
  return pct >= 10 ? pct.toFixed(0) : pct.toFixed(1).replace(/\.0$/, '');
}
