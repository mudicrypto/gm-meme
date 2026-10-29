import {
  ORDER_LABELS,
  type OrderKind,
  type SiftOrder,
  describeOrder,
  formatOrderPrice,
  orderProgress,
} from '@sift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackHeader } from '../components/BackHeader';
import { Button, Chip } from '../components/Button';
import { Screen } from '../components/Screen';
import { SignInCard } from '../components/SignInCard';
import { Empty, Loading } from '../components/States';
import { Text } from '../components/Text';
import { TokenAvatar } from '../components/TokenAvatar';
import { api, siftApi } from '../lib/api';
import { formatAgo, formatCompact } from '../lib/format';
import { useSession } from '../lib/session';
import { useOrders, useSiftBalance, useSiftWallet } from '../lib/social-hooks';
import { colors, radius, tint } from '../lib/theme';

const KIND_COLORS: Record<OrderKind, string> = {
  stop_loss: colors.down,
  take_profit: colors.up,
  limit_buy: colors.link,
};

export default function OrdersScreen() {
  const session = useSession();
  const wallet = useSiftWallet();
  const orders = useOrders();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const info = wallet.data?.wallet;
  const balance = useSiftBalance(info?.address);
  const all = orders.data?.orders ?? [];
  const open = all.filter((o) => o.status === 'open' || o.status === 'executing');
  const done = all.filter((o) => o.status !== 'open' && o.status !== 'executing');
  const shown = tab === 'open' ? open : done;
  const mints = [...new Set(open.map((o) => o.token.mint))];
  const prices = useLatestPrices(mints);

  return (
    <Screen
      header={<BackHeader title="Orders" />}
      refreshing={orders.isRefetching}
      onRefresh={() => void orders.refetch()}
    >
      {session.status !== 'signed-in' ? (
        <SignInCard reason="Sign in to see your Sift wallet orders." />
      ) : wallet.isPending ? (
        <Loading />
      ) : !info ? (
        <View style={styles.card}>
          <Text style={styles.ruleText}>
            Orders run from your Sift wallet, so they work while your phone is off.
          </Text>
          <Button label="Set up Sift wallet" onPress={() => router.push('/wallet')} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.summary}>
              <View style={styles.flex}>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          info.frozen || info.signing !== 'live' ? colors.caution : colors.up,
                      },
                    ]}
                  />
                  <Text style={styles.muted}>
                    Sift wallet ·{' '}
                    {info.frozen ? 'frozen' : info.signing === 'live' ? 'orders active' : 'paused'}
                  </Text>
                </View>
                <Text mono style={styles.balance}>
                  {balance.data ? `${formatCompact(balance.data.solBalance)} SOL` : '– SOL'}
                </Text>
                <Text style={styles.muted}>
                  {open.length === 0
                    ? 'No orders running'
                    : `${open.length} ${open.length === 1 ? 'order' : 'orders'} running, even with your phone off`}
                </Text>
              </View>
              <View style={styles.summaryButtons}>
                <Pressable
                  onPress={() => router.push('/wallet')}
                  accessibilityRole="button"
                  style={[styles.smallButton, styles.smallPrimary]}
                >
                  <Text style={styles.smallPrimaryText}>Add funds</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/wallet')}
                  accessibilityRole="button"
                  style={styles.smallButton}
                >
                  <Text style={styles.smallText}>Withdraw</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.tabs}>
            <Chip
              label={`Open (${open.length})`}
              selected={tab === 'open'}
              onPress={() => setTab('open')}
            />
            <Chip label="History" selected={tab === 'done'} onPress={() => setTab('done')} />
          </View>

          {orders.isPending ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty
              message={
                tab === 'open'
                  ? 'No open orders. Open a token and tap “Set order”, or turn on “Protect this trade” when you buy.'
                  : 'Filled, cancelled and expired orders show here.'
              }
            />
          ) : (
            shown.map((order) => (
              <OrderCard key={order.id} order={order} price={prices.get(order.token.mint)} />
            ))
          )}
        </>
      )}
    </Screen>
  );
}

/** The latest price of each token with an open order, from its chart. */
function useLatestPrices(mints: string[]) {
  const query = useQuery({
    queryKey: ['order-prices', mints],
    queryFn: async () => {
      const entries = await Promise.all(
        mints.map(async (mint) => {
          const chart = await api.chart(mint, 1440).catch(() => null);
          const last = chart?.points[chart.points.length - 1]?.priceSol;
          return [mint, last] as const;
        }),
      );
      return new Map(entries.filter((e): e is readonly [string, number] => e[1] !== undefined));
    },
    enabled: mints.length > 0,
    refetchInterval: 15_000,
  });
  return query.data ?? new Map<string, number>();
}

function daysLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expiring';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left`;
  return `${Math.max(1, Math.floor(ms / 3_600_000))}h left`;
}

const STATUS_TEXT: Record<SiftOrder['status'], string> = {
  open: 'Open',
  executing: 'Running now',
  filled: 'Filled',
  failed: 'Didn’t run',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

function OrderCard({ order, price }: { order: SiftOrder; price: number | undefined }) {
  const { token } = useSession();
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => siftApi.cancelOrder(token!, order.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'orders'] }),
  });
  const color = KIND_COLORS[order.kind];
  const progress = orderProgress(order, price);
  const live = order.status === 'open' || order.status === 'executing';
  const name = order.token.name ?? order.token.symbol ?? `${order.token.mint.slice(0, 4)}…`;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.kind, { backgroundColor: tint(color, 0.14) }]}>
          <Text style={[styles.kindText, { color }]}>
            {ORDER_LABELS[order.kind].toUpperCase()}
            {order.trailingPct ? ' · TRAILING' : ''}
          </Text>
        </View>
        <Link href={`/token/${order.token.mint}`} asChild>
          <Pressable style={StyleSheet.flatten(styles.tokenLink)}>
            <TokenAvatar
              uri={order.token.imageUrl}
              label={order.token.name ?? order.token.symbol}
              seed={order.token.mint}
              size={22}
            />
            <Text style={styles.token} numberOfLines={1}>
              {name}
            </Text>
          </Pressable>
        </Link>
        <Text style={styles.muted}>
          {live ? daysLeft(order.expiresAt) : STATUS_TEXT[order.status]}
        </Text>
      </View>
      <Text style={styles.ruleText}>{describeOrder(order)}</Text>

      {live ? (
        <>
          <View style={styles.track}>
            <View
              style={[styles.fill, { width: `${progress?.fill ?? 0}%`, backgroundColor: color }]}
            />
          </View>
          <View style={styles.meta}>
            <Text mono style={styles.metaText}>
              {price ? `Now ${formatOrderPrice(price)}` : 'No recent price'}
            </Text>
            <Text mono style={styles.metaText}>
              {progress ? `${Math.round(progress.pctAway)}% away` : ''}
            </Text>
          </View>
        </>
      ) : null}

      {order.message ? <Text style={styles.message}>{order.message}</Text> : null}
      {!live && order.filledAt ? (
        <Text style={styles.muted}>{formatAgo(order.filledAt)} ago</Text>
      ) : null}

      {order.status === 'open' ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/order/[mint]',
                params: {
                  mint: order.token.mint,
                  kind: order.kind,
                  ...(order.token.symbol ? { symbol: order.token.symbol } : {}),
                  ...(order.token.name ? { name: order.token.name } : {}),
                },
              })
            }
            accessibilityRole="button"
            style={styles.smallButton}
          >
            <Text style={styles.smallText}>New order</Text>
          </Pressable>
          <Pressable
            onPress={() => cancel.mutate()}
            disabled={cancel.isPending}
            accessibilityRole="button"
            style={[styles.smallButton, styles.cancel]}
          >
            <Text style={styles.cancelText}>{cancel.isPending ? 'Cancelling…' : 'Cancel'}</Text>
          </Pressable>
        </View>
      ) : null}
      {cancel.isError ? <Text style={styles.error}>{cancel.error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    padding: 16,
    gap: 10,
    borderRadius: radius.cardLarge,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  muted: { fontSize: 12, color: colors.muted },
  balance: { fontSize: 26, fontWeight: '600', letterSpacing: -0.8, marginTop: 4 },
  summaryButtons: { gap: 6 },
  smallButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallPrimaryText: { fontSize: 12, fontWeight: '800', color: colors.onAccent },
  smallText: { fontSize: 13, fontWeight: '700', color: colors.text },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kind: { height: 24, paddingHorizontal: 8, borderRadius: 8, justifyContent: 'center' },
  kindText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  tokenLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  token: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  ruleText: { fontSize: 14, lineHeight: 20, color: colors.body },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.borderStrong, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  metaText: { fontSize: 12, color: colors.muted },
  message: { fontSize: 12, lineHeight: 17, color: colors.caution },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  cancel: { borderColor: tint(colors.down, 0.35) },
  cancelText: { fontSize: 13, fontWeight: '700', color: colors.down },
  error: { fontSize: 13, color: colors.down },
});
