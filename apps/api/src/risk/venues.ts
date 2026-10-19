import type { Venue } from './inputs';

// Programs whose accounts hold liquidity. A token account owned by an account that
// belongs to one of these programs is a pool vault, not a holder.
export const VENUE_PROGRAMS: ReadonlyMap<string, Venue> = new Map([
  ['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'pump.fun bonding curve'],
  ['pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', 'PumpSwap'],
  ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'Raydium'], // AMM v4
  ['CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', 'Raydium'], // CPMM
  ['CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', 'Raydium'], // CLMM
  ['LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj', 'Raydium LaunchLab'],
  ['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', 'Meteora'], // DLMM
  ['Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', 'Meteora'], // DAMM v1
  ['cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', 'Meteora'], // DAMM v2
  ['dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', 'Meteora'], // Dynamic bonding curve
  ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', 'Orca'],
]);

// Some pools hold vaults under a data-less PDA, so the owner has no program to look up.
export const POOL_AUTHORITIES: ReadonlyMap<string, Venue> = new Map([
  ['5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', 'Raydium'], // AMM v4 authority
  ['GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL', 'Raydium'], // CPMM authority
]);

/** Tokens sent here can never move again. */
export const BURN_OWNERS: ReadonlySet<string> = new Set([
  '1nc1nerator11111111111111111111111111111111',
]);
