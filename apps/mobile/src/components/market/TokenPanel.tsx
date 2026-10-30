import type { TokenStats } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../../lib/api';
import { shortAddress } from '../../lib/format';
import { CHART_WINDOWS, type MarketToken } from '../../lib/market';
import { useTokenStats } from '../../lib/market-hooks';
import { colors, radius, space } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { CandleChart } from './CandleChart';
import { Change } from './Change';
import { Tabs } from './Tabs';
import { SolPrice } from './SolPrice';
import { Metrics, RiskSignals } from './TokenPanels';
import { TradeAction, TradeFields, useTradeForm } from './TradeForm';

/**
 * The selected token beside the desktop table: chart, key numbers, risk signals and a
 * buy/sell form. "Review" opens the trade screen, which quotes, checks and asks the user
 * to confirm before anything is signed; nothing trades from here.
 */
export function TokenPanel({
  token,
  listStats,
  listWindowMinutes,
}: {
  token: MarketToken;
  /** Stats from the table, shown until the panel's own window loads. */
  listStats: TokenStats | undefined;
  /** The table's window: the chart starts on the closest one. */
  listWindowMinutes: number;
}) {
  const mint = token.mint;
  const [windowMinutes, setWindowMinutes] = useState(
    () => [...CHART_WINDOWS].reverse().find((w) => w.minutes <= listWindowMinutes)?.minutes ?? 60,
  );
  const chart = useQuery({
    queryKey: ['chart', mint, windowMinutes],
    queryFn: () => api.chart(mint, windowMinutes),
    refetchInterval: 15_000,
  });
  const statsQuery = useTokenStats(mint, windowMinutes, true);
  const risk = useQuery({ queryKey: ['risk', mint], queryFn: () => api.risk(mint) });

  // The last trade in a day, so a quiet hour still shows a price.
  const dayStats = useTokenStats(mint, 1440, true);
  const stats = statsQuery.data ?? listStats;
  const windowLabel = CHART_WINDOWS.find((w) => w.minutes === windowMinutes)?.label ?? '1h';
  const symbol = (token.symbol ?? token.name ?? shortAddress(mint)).slice(0, 12);
  const price = stats?.priceSol ?? dayStats.data?.priceSol;
  const form = useTradeForm(mint, symbol, price);

  return (
    <View style={styles.panel}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <TokenAvatar
            uri={token.imageUrl}
            label={token.symbol ?? token.name}
            seed={mint}
            size={40}
          />
          <View style={styles.flex}>
            <Text style={styles.symbol} numberOfLines={1}>
              {symbol} <Text style={styles.pair}>/ SOL</Text>
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {token.name ?? shortAddress(mint)}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(`/token/${mint}`)}
            accessibilityRole="link"
            accessibilityLabel={`Open ${symbol} details`}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.open,
              hovered && { borderColor: colors.accent },
            ]}
          >
            <Text style={styles.openText}>Details</Text>
            <ExternalLink size={14} color={colors.muted} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.priceBlock}>
          <SolPrice price={price} size={28} />
          <Change pct={stats?.changePct} size={14} arrow />
        </View>

        <Tabs
          compact
          label="Chart window"
          options={CHART_WINDOWS.map((w) => ({ value: w.minutes, label: w.label }))}
          value={windowMinutes}
          onChange={setWindowMinutes}
        />
        {chart.isError ? (
          <Text style={styles.note}>Couldn’t load the chart. It retries on its own.</Text>
        ) : (
          <CandleChart
            points={chart.data?.points ?? []}
            height={176}
            emptyHeight={140}
            windowMinutes={windowMinutes}
          />
        )}

        <Metrics stats={stats} token={token} windowLabel={windowLabel} flat />
        <RiskSignals
          risk={risk.data}
          unavailable={risk.isError}
          onRetry={() => void risk.refetch()}
          flat
        />

        <View style={styles.form}>
          <Text style={styles.heading} accessibilityRole="header">
            Trade
          </Text>
          <TradeFields form={form} />
        </View>
      </ScrollView>
      {/* Pinned so the trade action stays in reach on any desktop height. */}
      <View style={styles.footer}>
        <TradeAction form={form} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  panel: { flex: 1 },
  // Room below the form so the last control scrolls clear of the window edge.
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.md },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  symbol: { fontSize: 18, fontWeight: '600' },
  pair: { fontSize: 14, fontWeight: '500', color: colors.muted },
  name: { fontSize: 13, color: colors.muted, marginTop: 2 },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.surface2,
  },
  openText: { fontSize: 13, fontWeight: '600' },
  priceBlock: { gap: 4 },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  // The trade controls, set off from the token details by one divider.
  form: {
    gap: space.md,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  heading: { fontSize: 15, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: { flex: 1, fontSize: 24, fontWeight: '600', color: colors.text, minWidth: 0 },
  unit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  presets: { flexDirection: 'row', gap: space.sm },
  preset: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetOn: { borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  presetText: { fontSize: 14, fontWeight: '600', color: colors.text2 },
  lines: { gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  lineLabel: { fontSize: 13, color: colors.muted },
  lineValue: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  slips: { flexDirection: 'row', gap: 4 },
  slip: {
    minHeight: 32,
    minWidth: 44,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slipOn: { borderColor: colors.accent },
  slipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
