import type { TokenStats } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ExternalLink, Settings } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../../lib/api';
import { formatAge, formatCompact, shortAddress } from '../../lib/format';
import { CHART_WINDOWS, type MarketToken } from '../../lib/market';
import { useTokenStats } from '../../lib/market-hooks';
import { dark, radius, space } from '../../lib/theme';
import { IconButton } from '../Button';
import { Ink, Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { WatchStar } from '../WatchStar';
import { CandleChart } from './CandleChart';
import { Change } from './Change';
import { Tabs } from './Tabs';
import { SolPrice } from './SolPrice';
import { RiskTag } from './RiskTag';
import { RiskSignals } from './TokenPanels';
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
  const form = useTradeForm(mint, symbol, price, token);

  const age = formatAge(token.launchedAt ?? token.firstSeenAt);
  const metrics: Array<[string, string]> = [
    ['Mkt cap', stats?.marketCapSol ? formatCompact(stats.marketCapSol) : '–'],
    [`Vol ${windowLabel}`, stats ? formatCompact(stats.volumeSol) : '–'],
    ['Trades', stats ? formatCompact(stats.buys + stats.sells) : '–'],
    ['Age', age === 'just now' ? 'New' : age],
  ];

  return (
    <Ink color={dark.text}>
      <View style={styles.panel}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>TOKEN OVERVIEW</Text>
            <WatchStar mint={mint} size={18} color={dark.muted} />
            <IconButton
              label={`Open ${symbol} details`}
              onPress={() => router.push(`/token/${mint}`)}
            >
              <ExternalLink size={18} color={dark.muted} strokeWidth={2} />
            </IconButton>
          </View>

          <View style={styles.identity}>
            <TokenAvatar
              uri={token.imageUrl}
              label={token.symbol ?? token.name}
              seed={mint}
              size={44}
            />
            <View style={styles.flex}>
              <Text style={styles.symbol} numberOfLines={1}>
                {symbol} <Text style={styles.pair}>/ SOL</Text>
              </Text>
              <Text style={styles.name} numberOfLines={1}>
                {token.name ?? shortAddress(mint)}
              </Text>
            </View>
            <RiskTag level={token.riskLevel} />
          </View>

          <View style={styles.priceBlock}>
            <SolPrice price={price} size={30} />
            <Change pct={stats?.changePct} size={15} arrow />
          </View>

          <Tabs
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
              height={180}
              emptyHeight={140}
              windowMinutes={windowMinutes}
              tone="dark"
            />
          )}

          <View style={styles.metrics}>
            {metrics.map(([label, value]) => (
              <View key={label} style={styles.metric}>
                <Text style={styles.metricLabel} numberOfLines={1}>
                  {label}
                </Text>
                <Text mono style={styles.metricValue} numberOfLines={1}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
          <RiskSignals
            risk={risk.data}
            unavailable={risk.isError}
            onRetry={() => void risk.refetch()}
            tone="dark"
          />

          <View style={styles.form}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow} accessibilityRole="header">
                TRADE
              </Text>
              <IconButton
                label="Full trade screen and settings"
                onPress={() => router.push(`/trade/${mint}?side=${form.side}`)}
              >
                <Settings size={18} color={dark.muted} strokeWidth={2} />
              </IconButton>
            </View>
            <TradeFields form={form} />
          </View>
        </ScrollView>
        {/* Pinned so the trade action stays in reach on any desktop height. */}
        <View style={styles.footer}>
          <TradeAction form={form} />
        </View>
      </View>
    </Ink>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  panel: { flex: 1, backgroundColor: dark.bg },
  // Room below the form so the last control scrolls clear of the window edge.
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.md },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    backgroundColor: dark.bg,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginVertical: -8 },
  eyebrow: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    color: dark.muted,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  symbol: { fontSize: 20, fontWeight: '700' },
  pair: { fontSize: 16, fontWeight: '400', color: dark.muted },
  name: { fontSize: 13, color: dark.muted, marginTop: 2 },
  priceBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  note: { fontSize: 12, color: dark.muted, lineHeight: 17 },
  metrics: {
    flexDirection: 'row',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
  },
  metric: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 10, gap: 3 },
  metricLabel: { fontSize: 11, color: dark.muted },
  metricValue: { fontSize: 14, fontWeight: '600' },
  // The trade controls, set off from the token details by one divider.
  form: {
    gap: space.md,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
});
