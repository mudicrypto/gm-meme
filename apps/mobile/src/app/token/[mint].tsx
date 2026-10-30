import { isSolanaAddress } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CandlestickChart,
  ChartLine,
  ChevronLeft,
  ExternalLink,
  MoreHorizontal,
  Timer,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../../components/Button';
import { FlashText } from '../../components/FlashText';
import { CandleChart } from '../../components/market/CandleChart';
import { Change } from '../../components/market/Change';
import { Tabs } from '../../components/market/Tabs';
import { ActivityList, RiskSignals, StatTiles } from '../../components/market/TokenPanels';
import { Logo } from '../../components/Logo';
import { PriceChart } from '../../components/PriceChart';
import { TradeAction, TradeFields, useTradeForm } from '../../components/market/TradeForm';
import { useTokenInfo } from '../../components/market/useTokenInfo';
import { Sheet } from '../../components/Sheet';
import { ErrorState } from '../../components/States';
import { Text } from '../../components/Text';
import { TokenAvatar } from '../../components/TokenAvatar';
import { TokenWatch } from '../../components/TokenWatch';
import { WatchStar } from '../../components/WatchStar';
import { api } from '../../lib/api';
import { formatSolPrice, shortAddress } from '../../lib/format';
import { CHART_WINDOWS } from '../../lib/market';
import { useTokenStats } from '../../lib/market-hooks';
import { breakpoints, colors, dark, radius, space } from '../../lib/theme';
import { solscanUrl, useNetwork } from '../../lib/network';

type Section = 'activity' | 'holders' | 'info';

/** "past hour", "past 4 hours": the period a % change covers, in words. */
function pastWindow(minutes: number): string {
  if (minutes < 60) return `past ${minutes} min`;
  if (minutes === 60) return 'past hour';
  if (minutes < 1440) return `past ${minutes / 60} hours`;
  return 'past day';
}

export default function TokenScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Desktop: an exchange layout, details on the left and the trade form on the right.
  const exchange = width >= 1100;
  // Tablets keep one readable centred column.
  const gutter = exchange ? space.xl : Math.max(space.screen, (width - 760) / 2);
  const { mint = '' } = useLocalSearchParams<{ mint: string }>();
  const valid = isSolanaAddress(mint);
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [section, setSection] = useState<Section>('activity');
  const [moreOpen, setMoreOpen] = useState(false);
  const [lineChart, setLineChart] = useState(false);
  const { cluster } = useNetwork();
  const info = useTokenInfo(mint);

  const risk = useQuery({
    queryKey: ['risk', mint],
    queryFn: () => api.risk(mint),
    enabled: valid,
  });
  const summary = useQuery({
    queryKey: ['summary', mint],
    queryFn: () => api.summary(mint),
    enabled: valid,
  });
  const chart = useQuery({
    queryKey: ['chart', mint, windowMinutes],
    queryFn: () => api.chart(mint, windowMinutes),
    enabled: valid,
    refetchInterval: 15_000,
  });
  const stats = useTokenStats(mint, windowMinutes, valid);
  const activity = useQuery({
    queryKey: ['activity', mint],
    queryFn: () => api.activity(mint),
    enabled: valid && section === 'activity',
    refetchInterval: 15_000,
  });

  const symbol = (info?.symbol ?? shortAddress(mint)).slice(0, 12);
  const name = (info?.name ?? info?.symbol ?? shortAddress(mint)).slice(0, 32);
  const price = stats.data?.priceSol;
  const [tradeOpen, setTradeOpen] = useState(false);
  const form = useTradeForm(mint, symbol, price, { name, imageUrl: info?.imageUrl }, () =>
    setTradeOpen(false),
  );
  const footerHeight = 76 + insets.bottom;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: gutter }]}>
      <IconButton
        label="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      >
        <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
      </IconButton>
      {/* Wide screens already show the logo in the app header. */}
      <View style={styles.headerLogo}>
        {width < breakpoints.tablet ? <Logo size={24} /> : null}
      </View>
      <WatchStar mint={mint} />
      <IconButton label="More" onPress={() => setMoreOpen(true)}>
        <MoreHorizontal size={24} color={colors.text} strokeWidth={2} />
      </IconButton>
    </View>
  );

  if (!valid)
    return (
      <View style={styles.root}>
        {header}
        <ErrorState message="That isn't a valid token address." />
      </View>
    );

  return (
    <View style={styles.root}>
      {header}
      <View style={exchange ? styles.columns : styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: exchange ? space.xl * 2 : footerHeight + space.lg,
              paddingHorizontal: gutter,
            },
          ]}
        >
          <View style={styles.identity}>
            <TokenAvatar
              uri={info?.imageUrl}
              label={info?.symbol ?? info?.name}
              seed={mint}
              size={exchange ? 44 : 48}
            />
            <View style={styles.flex}>
              <Text style={styles.pairTitle} numberOfLines={1}>
                {symbol}
                <Text style={styles.pairQuote}> / SOL</Text>
              </Text>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow} accessibilityLabel={`Change ${pastWindow(windowMinutes)}`}>
            {price ? (
              <View style={styles.priceValue}>
                <FlashText value={price} style={styles.price}>
                  {formatSolPrice(price)}
                </FlashText>
                <Text style={styles.priceUnit}>SOL</Text>
              </View>
            ) : (
              <Text style={styles.noPrice}>
                {stats.isPending ? 'Loading price…' : 'No trades yet'}
              </Text>
            )}
            <Change pct={stats.data?.changePct} size={16} />
          </View>

          <View style={styles.chartControls}>
            <View style={styles.flex}>
              <Tabs
                compact
                label="Chart window"
                options={CHART_WINDOWS.map((w) => ({ value: w.minutes, label: w.label }))}
                value={windowMinutes}
                onChange={setWindowMinutes}
              />
            </View>
            <Pressable
              onPress={() => setLineChart((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={lineChart ? 'Show candles' : 'Show a line chart'}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.chartType,
                hovered && { backgroundColor: colors.surface2 },
              ]}
            >
              {lineChart ? (
                <CandlestickChart size={20} color={colors.text} strokeWidth={2} />
              ) : (
                <ChartLine size={20} color={colors.text} strokeWidth={2} />
              )}
            </Pressable>
          </View>
          {chart.isError ? (
            <ErrorState message="Couldn’t load the chart." onRetry={() => chart.refetch()} />
          ) : lineChart && (chart.data?.points.length ?? 0) > 1 ? (
            <PriceChart points={chart.data?.points ?? []} />
          ) : (
            <CandleChart
              points={chart.data?.points ?? []}
              height={exchange ? 340 : 260}
              emptyHeight={140}
              windowMinutes={windowMinutes}
            />
          )}

          <StatTiles mint={mint} enabled={valid} />
          <RiskSignals
            risk={risk.data}
            unavailable={risk.isError}
            onRetry={() => void risk.refetch()}
          />

          <Tabs
            label="Token sections"
            options={[
              { value: 'activity', label: 'Activity' },
              { value: 'holders', label: 'Holders' },
              { value: 'info', label: 'Info' },
            ]}
            value={section}
            onChange={setSection}
          />

          {section === 'activity' ? (
            <ActivityList
              trades={activity.data?.trades}
              symbol={symbol}
              loading={activity.isPending}
            />
          ) : section === 'holders' ? (
            <View style={styles.sectionBody}>
              {(risk.data?.reasons ?? [])
                .filter((r) => r.check === 'holder_concentration' || r.check === 'dev_history')
                .map((r) => (
                  <View key={r.check} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>
                      {r.check === 'holder_concentration' ? 'Top holders' : 'Creator'}
                    </Text>
                    <Text style={styles.infoText}>{r.message}</Text>
                  </View>
                ))}
              <Text style={styles.note}>
                Sift checks the 20 largest accounts. A full holder list isn’t available yet.
              </Text>
            </View>
          ) : (
            <View style={styles.sectionBody}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  In plain words{summary.data?.source === 'ai' ? ' · AI' : ''}
                </Text>
                <Text style={styles.infoText}>
                  {summary.isPending
                    ? 'Writing a summary…'
                    : summary.isError
                      ? 'Summary unavailable right now.'
                      : summary.data.summary}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Token address</Text>
                <Text mono selectable style={styles.infoText}>
                  {mint}
                </Text>
              </View>
              <TokenWatch mint={mint} priceSol={price} />
            </View>
          )}
        </ScrollView>
        {exchange ? (
          <View style={styles.side}>
            <ScrollView style={styles.flex} contentContainerStyle={styles.sideContent}>
              <Text style={styles.sideTitle} accessibilityRole="header">
                TRADE
              </Text>
              <TradeFields form={form} />
            </ScrollView>
            <View style={styles.sideFoot}>
              <TradeAction form={form} />
            </View>
          </View>
        ) : null}
      </View>

      {exchange ? null : (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + space.md, paddingHorizontal: gutter },
          ]}
        >
          {(['buy', 'sell'] as const).map((side) => (
            <Pressable
              key={side}
              onPress={() => {
                form.setSide(side);
                setTradeOpen(true);
              }}
              style={({ pressed }) => [
                styles.action,
                side === 'buy' ? styles.buy : styles.sell,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
            >
              <Text style={side === 'buy' ? styles.buyText : styles.sellText}>
                {side === 'buy' ? 'Buy' : 'Sell'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Buy/Sell slide up over the coin page; Review opens the checked quote. */}
      <Sheet visible={tradeOpen} onClose={() => setTradeOpen(false)} tone="dark">
        <TradeFields form={form} />
        <TradeAction form={form} />
      </Sheet>

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title={name}>
        <MoreRow
          icon={<Timer size={18} color={colors.text} strokeWidth={2} />}
          label="Set an order (limit, stop loss, take profit)"
          onPress={() => {
            setMoreOpen(false);
            router.push({ pathname: '/order/[mint]', params: { mint, symbol, name } });
          }}
        />
        <MoreRow
          icon={<ExternalLink size={18} color={colors.text} strokeWidth={2} />}
          label="View on Solscan"
          onPress={() => void Linking.openURL(solscanUrl('token', mint, cluster))}
        />
        <Text style={styles.note}>
          Safety checks reduce risk, they don’t remove it. Not financial advice.
        </Text>
      </Sheet>
    </View>
  );
}

function MoreRow({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.moreRow, pressed && { opacity: 0.7 }]}
    >
      {icon}
      <Text style={styles.moreText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  columns: { flex: 1, flexDirection: 'row' },
  side: { width: 400, backgroundColor: dark.bg },
  sideContent: { padding: space.lg, gap: space.md },
  sideTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: dark.muted },
  sideFoot: { padding: space.lg, borderTopWidth: 1, borderTopColor: dark.border },
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingBottom: space.sm,
  },
  headerLogo: { flex: 1, alignItems: 'center' },
  pairTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  pairQuote: { color: colors.text2, fontWeight: '400' },
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, gap: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 13, color: colors.muted, marginTop: 1 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  address: { fontSize: 13, color: colors.muted },
  priceBlock: { gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  priceValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  chartControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chartType: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8, flexShrink: 1 },
  priceUnit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  noPrice: { fontSize: 20, fontWeight: '600', color: colors.muted },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  windowText: { fontSize: 14, color: colors.muted },
  sectionBody: { gap: space.md, paddingTop: space.sm },
  infoRow: { gap: 4 },
  infoLabel: { fontSize: 13, color: colors.muted },
  infoText: { fontSize: 14, lineHeight: 21, color: colors.body },
  note: { fontSize: 12, lineHeight: 17, color: colors.faint },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
    height: 46,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buy: { backgroundColor: colors.accent },
  sell: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.accent },
  buyText: { fontSize: 15, fontWeight: '700', color: colors.onAccent },
  sellText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  moreText: { fontSize: 15, fontWeight: '500' },
});
