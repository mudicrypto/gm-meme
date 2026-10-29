import { useQuery } from '@tanstack/react-query';
import { api, siftApi, socialApi } from './api';
import { useSession } from './session';

/** Your Sift profile (null until you pick a name). Signs you out if the session expired. */
export function useMe() {
  const session = useSession();
  const token = session.token;
  return useQuery({
    queryKey: ['social', 'me', token],
    queryFn: async () => {
      try {
        return await socialApi.me(token!);
      } catch (err) {
        session.expired(err);
        throw err;
      }
    },
    enabled: token !== null,
  });
}

export function useWatchlist() {
  const { token } = useSession();
  return useQuery({
    queryKey: ['social', 'watchlist', token],
    queryFn: () => socialApi.watchlist(token!),
    enabled: token !== null,
  });
}

export function useAlerts() {
  const { token } = useSession();
  return useQuery({
    queryKey: ['social', 'alerts', token],
    queryFn: () => socialApi.alerts(token!),
    enabled: token !== null,
    refetchInterval: 60_000,
  });
}

/** The signed-in account's Sift wallet (null until created) and whether signing is live. */
export function useSiftWallet() {
  const { token } = useSession();
  return useQuery({
    queryKey: ['social', 'sift-wallet', token],
    queryFn: () => siftApi.wallet(token!),
    enabled: token !== null,
    refetchInterval: 30_000,
  });
}

/** The Sift wallet's SOL balance, read through the API's holdings route. */
export function useSiftBalance(address: string | undefined) {
  return useQuery({
    queryKey: ['holdings', address],
    queryFn: () => api.holdings(address!),
    enabled: address !== undefined,
    refetchInterval: 30_000,
  });
}

export function useOrders() {
  const { token } = useSession();
  return useQuery({
    queryKey: ['social', 'orders', token],
    queryFn: () => siftApi.orders(token!),
    enabled: token !== null,
    refetchInterval: 15_000,
  });
}
