import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type Cluster = 'devnet' | 'mainnet-beta';

/**
 * The Solana network the server trades on (from GET /config), so the app's labels and
 * links follow it: switching Sift to mainnet is a server setting, not an app change.
 * `isDevnet` and `isMainnet` are true only once the server has said so: until then
 * neither "test SOL" nor "real SOL" wording is shown, so real money is never called test
 * money, or the reverse. Links default to devnet.
 */
export function useNetwork() {
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });
  const known = config.data?.cluster;
  const cluster: Cluster = known === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  return { cluster, isDevnet: known === 'devnet', isMainnet: known === 'mainnet-beta' };
}

/** A Solscan link for a token or transaction on this network. */
export function solscanUrl(kind: 'token' | 'tx', id: string, cluster: Cluster): string {
  return `https://solscan.io/${kind}/${id}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
}

/** "test SOL" on devnet, "SOL" on mainnet: for sentences about amounts. */
export const solWord = (isDevnet: boolean) => (isDevnet ? 'test SOL' : 'SOL');
