// Everything the risk checks look at. Gathered from Helius, Jupiter and our own
// database by gather.ts; the checks themselves (checks.ts) are pure functions of this.
//
// Convention: a field is `undefined` when fetching it failed, so the check can say
// "couldn't verify" rather than pretend everything is fine.

export interface MintInfo {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Raw supply in base units. */
  supply: bigint;
  decimals: number;
  tokenProgram: 'spl-token' | 'spl-token-2022';
  /** Token-2022 extensions as returned by jsonParsed RPC. */
  extensions: ReadonlyArray<{ extension: string; state?: Record<string, unknown> }>;
}

export type HolderKind = 'wallet' | 'pool' | 'burn';

export interface Holder {
  owner: string;
  /** Raw amount in base units, summed over the owner's token accounts. */
  amount: bigint;
  kind: HolderKind;
  /** Trading venue, for pools. */
  venue?: Venue;
}

export type Venue =
  'pump.fun bonding curve' | 'PumpSwap' | 'Raydium' | 'Meteora' | 'Orca' | 'Raydium LaunchLab';

export interface CreatorHistory {
  creator: string;
  /** Mints this wallet launched, including the token being checked. */
  launchedMints: readonly string[];
  /** True when there may be more launches than we fetched. */
  truncated: boolean;
}

export type SellTest =
  | {
      status: 'quoted';
      amountPctOfSupply: number;
      priceImpactPct: number;
      routes: readonly string[];
    }
  | { status: 'no_route'; reason: string }
  /** Jupiter only routes mainnet. */
  | { status: 'unavailable'; reason: string };

export interface RiskInputs {
  mint: string;
  mintInfo: MintInfo | undefined;
  /** Largest holders (as returned by RPC, up to 20 token accounts), merged per owner. */
  holders: readonly Holder[] | undefined;
  /** null when the creator is unknown. */
  creatorHistory: CreatorHistory | null | undefined;
  sellTest: SellTest | undefined;
}
