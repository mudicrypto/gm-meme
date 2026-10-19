/** Solana clusters Sift can talk to. Devnet is the default until the security review. */
export type SolanaCluster = 'devnet' | 'mainnet-beta';

export const DEFAULT_CLUSTER: SolanaCluster = 'devnet';

// Base58 alphabet: no 0, O, I or l. Public keys encode to 32-44 characters.
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Cheap shape check for a Solana address (wallet or mint). Use it to reject bad
 * input at the API boundary; it does not prove the account exists on chain.
 */
export function isSolanaAddress(value: unknown): value is string {
  return typeof value === 'string' && BASE58_ADDRESS.test(value);
}
