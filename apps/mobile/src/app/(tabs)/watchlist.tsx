import type { PriceAlert } from '@sift/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { NotificationsCard } from '../../components/NotificationsCard';
import { RiskBadge } from '../../components/RiskBadge';
import { SignInCard } from '../../components/SignInCard';
import { Empty, ErrorState, Loading } from '../../components/States';
import { TokenAvatar } from '../../components/TokenAvatar';
import { socialApi } from '../../lib/api';
import { formatAgo, formatSolPrice } from '../../lib/format';
import { useSession } from '../../lib/session';
import { describeAlert, tokenLabel } from '../../lib/social';
import { useAlerts, useWatchlist } from '../../lib/social-hooks';
import { usePalette } from '../../lib/theme';

export default function WatchlistScreen() {
  const palette = usePalette();
  const session = useSession();
  const watchlist = useWatchlist();
  const alerts = useAlerts();

  if (session.status === 'loading') return <Loading />;
  if (session.status === 'signed-out') {
    return (
      <Screen title="Watchlist">
        <SignInCard reason="Sign in to keep a watchlist and get price alerts." />
      </Screen>
    );
  }

  const fired = (alerts.data?.alerts ?? []).filter((a) => a.triggeredAt);
  const active = (alerts.data?.alerts ?? []).filter((a) => !a.triggeredAt);
  return (
    <Screen
      title="Watchlist"
      refreshing={watchlist.isRefetching || alerts.isRefetching}
      onRefresh={() => {
        void watchlist.refetch();
        void alerts.refetch();
      }}
    >
      {fired.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: palette.text }]}>Alerts that went off</Text>
          {fired.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </>
      ) : null}

      <Text style={[styles.heading, { color: palette.text }]}>Watchlist</Text>
      {watchlist.isPending ? (
        <Loading />
      ) : watchlist.isError ? (
        <ErrorState message={watchlist.error.message} onRetry={() => watchlist.refetch()} />
      ) : watchlist.data.tokens.length === 0 ? (
        <Empty message="Open a token and tap “Add to watchlist” to keep an eye on it here." />
      ) : (
        watchlist.data.tokens.map((token) => (
          <Link key={token.mint} href={`/token/${token.mint}`} asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.row,
                { backgroundColor: palette.card, borderColor: palette.border },
              ])}
            >
              <TokenAvatar uri={token.imageUrl} label={tokenLabel(token)} size={36} />
              <View style={styles.flex}>
                <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
                  {tokenLabel(token)}
                </Text>
                <Text style={{ color: palette.muted }}>
                  {token.priceSol ? `${formatSolPrice(token.priceSol)} SOL` : 'No price yet'}
                </Text>
              </View>
              <RiskBadge level={token.riskLevel} />
            </Pressable>
          </Link>
        ))
      )}

      <Text style={[styles.heading, { color: palette.text }]}>Price alerts</Text>
      {active.length === 0 ? (
        <Empty message="Set alerts from a token’s page. Each alert goes off once." />
      ) : (
        active.map((alert) => <AlertRow key={alert.id} alert={alert} />)
      )}

      <NotificationsCard />
    </Screen>
  );
}

function AlertRow({ alert }: { alert: PriceAlert }) {
  const palette = usePalette();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => socialApi.deleteAlert(token!, alert.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'alerts'] }),
  });
  return (
    <View style={[styles.row, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Link href={`/token/${alert.mint}`} asChild>
        <Pressable style={styles.flex}>
          <Text style={[styles.name, { color: palette.text }]}>
            {tokenLabel(alert.token)} · {describeAlert(alert)}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {alert.triggeredAt && alert.triggeredPriceSol
              ? `Went off ${formatAgo(alert.triggeredAt)} at ${formatSolPrice(alert.triggeredPriceSol)} SOL`
              : `Set ${formatAgo(alert.createdAt)}`}
          </Text>
        </Pressable>
      </Link>
      <Pressable onPress={() => remove.mutate()} disabled={remove.isPending} hitSlop={8}>
        <Text style={{ color: palette.down, fontWeight: '600' }}>
          {alert.triggeredAt ? 'Clear' : 'Delete'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
});
