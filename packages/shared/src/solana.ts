/** Solana clusters Sift can talk to. Devnet is the default until the security review. */
export type SolanaCluster = 'devnet' | 'mainnet-beta';

export const DEFAULT_CLUSTER: SolanaCluster = 'devnet';

/** Wrapped SOL mint. Same address on every cluster. */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Mints that are the "money" side of a meme coin trade, never the token being traded.
 * Discovery ignores them.
 */
export const QUOTE_MINTS: ReadonlySet<string> = new Set([
  WSOL_MINT,
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT mainnet
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
]);

/** pump.fun bonding-curve program, where most new meme coins launch. */
export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export const LAMPORTS_PER_SOL = 1_000_000_000;

// Base58 alphabet: no 0, O, I or l. Public keys encode to 32-44 characters.
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Cheap shape check for a Solana address (wallet or mint). Use it to reject bad
 * input at the API boundary; it does not prove the account exists on chain.
 */
export function isSolanaAddress(value: unknown): value is string {
  return typeof value === 'string' && BASE58_ADDRESS.test(value);
}
