import { useQuery } from '@tanstack/react-query';
import { socialApi } from './api';
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
