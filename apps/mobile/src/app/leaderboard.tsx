import type { LeaderboardEntry } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackHeader } from '../components/BackHeader';
import { Tabs } from '../components/market/Tabs';
import { PersonAvatar } from '../components/PersonAvatar';
import { Screen } from '../components/Screen';
import { Empty, ErrorState } from '../components/States';
import { Text } from '../components/Text';
import { api } from '../lib/api';
import { formatCompact } from '../lib/format';
import { colors, radius, space } from '../lib/theme';
import { useNetwork } from '../lib/network';

const PERIODS = [
  { value: 1, label: '24h' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
] as const;

type Days = (typeof PERIODS)[number]['value'];

/**
 * Traders ranked by realized profit, from trades they chose to share. Past results, in
 * test SOL: it shows who did well, never what to buy.
 */
export default function LeaderboardScreen() {
  const [days, setDays] = useState<Days>(7);
  const { isDevnet } = useNetwork();
  const board = useQuery({
    queryKey: ['leaderboard', days],
    queryFn: () => api.leaderboard(days),
  });
  return (
    <Screen
      header={<BackHeader title="Top traders" subtitle="Realized profit from shared trades" />}
      refreshing={board.isRefetching}
      onRefresh={() => void board.refetch()}
    >
      <Tabs label="Period" options={PERIODS} value={days} onChange={setDays} />
      {board.isError ? (
        <ErrorState message={board.error.message} onRetry={() => board.refetch()} />
      ) : board.isPending ? (
        <View style={styles.list} accessibilityLabel="Loading leaderboard">
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.skAvatar} />
              <View style={styles.skLine} />
            </View>
          ))}
        </View>
      ) : board.data.entries.length === 0 ? (
        <Empty message="No shared sells in this period yet. Traders appear here once they share a trade and sell." />
      ) : (
        <View style={styles.list}>
          {board.data.entries.map((entry, i) => (
            <Row key={entry.handle} entry={entry} first={i === 0} />
          ))}
        </View>
      )}
      <Text style={styles.note}>
        Profit counts only sells of tokens the trader’s shared buys cover, at their average cost.
        Only trades people chose to share are included.
        {isDevnet ? ' Devnet test SOL, no real value.' : ''} Past results don’t predict anything,
        and this isn’t financial advice.
      </Text>
    </Screen>
  );
}

function Row({ entry, first }: { entry: LeaderboardEntry; first: boolean }) {
  const sol = entry.realizedLamports / 1e9;
  const gain = sol >= 0;
  const amount = `${gain ? '+' : '−'}${formatCompact(Math.abs(sol))} SOL`;
  return (
    <Pressable
      onPress={() => router.push(`/u/${entry.handle}`)}
      accessibilityRole="link"
      accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}, ${gain ? 'profit' : 'loss'} ${amount}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !first && styles.divider,
        (pressed || hovered) && { backgroundColor: colors.surface2 },
      ]}
    >
      <Text mono style={[styles.rank, entry.rank <= 3 && { color: colors.text }]}>
        {entry.rank}
      </Text>
      <PersonAvatar name={entry.displayName} seed={entry.handle} size={40} />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.displayName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          @{entry.handle} · {entry.trades} {entry.trades === 1 ? 'trade' : 'trades'} ·{' '}
          {entry.winningTokens}/{entry.soldTokens} tokens in profit
        </Text>
      </View>
      <View style={styles.right}>
        <Text mono style={[styles.amount, { color: gain ? colors.up : colors.down }]}>
          {amount}
        </Text>
        <Text style={styles.meta}>{gain ? 'profit' : 'loss'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rank: { width: 22, fontSize: 14, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, color: colors.faint, lineHeight: 18, marginTop: space.sm },
  skAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2 },
  skLine: { flex: 1, height: 12, borderRadius: 4, backgroundColor: colors.surface2 },
});
