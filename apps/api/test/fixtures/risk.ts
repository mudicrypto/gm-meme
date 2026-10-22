import type { Holder, MintInfo, RiskInputs } from '../../src/risk/inputs';
import { addr } from './helius';

export const RISK_MINT = 'E8NT2qghrktonV3RSSAc9nRmhhNxganaFo7ZWZpAFdCf';
export const CREATOR = addr('Creator');
export const SUPPLY = 1_000_000_000_000_000n; // 1B tokens at 6 decimals

/** Percent of supply as a raw amount. */
export const pct = (p: number) => (SUPPLY * BigInt(Math.round(p * 100))) / 10_000n;

export const wallet = (label: string, p: number): Holder => ({
  owner: addr(label),
  amount: pct(p),
  kind: 'wallet',
});

export const curve = (p: number): Holder => ({
  owner: addr('Curve'),
  amount: pct(p),
  kind: 'pool',
  venue: 'pump.fun bonding curve',
});

export const cleanMint = (overrides: Partial<MintInfo> = {}): MintInfo => ({
  mintAuthority: null,
  freezeAuthority: null,
  supply: SUPPLY,
  decimals: 6,
  tokenProgram: 'spl-token-2022',
  extensions: [
    { extension: 'metadataPointer', state: {} },
    { extension: 'tokenMetadata', state: {} },
  ],
  ...overrides,
});

/** A token fresh on pump.fun with nothing wrong: every check should be green. */
export function cleanInputs(overrides: Partial<RiskInputs> = {}): RiskInputs {
  return {
    mint: RISK_MINT,
    mintInfo: cleanMint(),
    holders: [curve(85), wallet('Creator', 3), wallet('A', 2), wallet('B', 1)].map((h) =>
      h.owner === addr('Creator') ? { ...h, owner: CREATOR } : h,
    ),
    creatorHistory: { creator: CREATOR, launchedMints: [RISK_MINT], truncated: false },
    sellTest: { status: 'unavailable', reason: 'test sales need mainnet' },
    ...overrides,
  };
}
