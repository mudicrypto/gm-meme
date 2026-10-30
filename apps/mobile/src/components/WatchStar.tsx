import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import { socialApi } from '../lib/api';
import { haptic } from '../lib/motion';
import { useSession } from '../lib/session';
import { useWatchlist } from '../lib/social-hooks';
import { colors } from '../lib/theme';
import { IconButton } from './Button';

/** Adds a token to the watchlist, or removes it. Signed-out users go to sign in. */
export function WatchStar({
  mint,
  size = 20,
  color = colors.text,
}: {
  mint: string;
  size?: number;
  /** The outline colour while not watching. */
  color?: string;
}) {
  const { token } = useSession();
  const queryClient = useQueryClient();
  const watchlist = useWatchlist();
  const watching = watchlist.data?.tokens.some((t) => t.mint === mint) ?? false;
  const toggle = useMutation({
    mutationFn: () => (watching ? socialApi.unwatch(token!, mint) : socialApi.watch(token!, mint)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social'] }),
  });
  return (
    <IconButton
      label={watching ? 'Remove from watchlist' : 'Add to watchlist'}
      onPress={() => {
        if (!token) {
          router.push('/watchlist');
          return;
        }
        haptic.select();
        toggle.mutate();
      }}
    >
      <Star
        size={size}
        color={watching ? colors.caution : color}
        fill={watching ? colors.caution : 'none'}
        strokeWidth={2}
      />
    </IconButton>
  );
}
