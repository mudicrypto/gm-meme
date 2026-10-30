import { isSolanaAddress } from '@sift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Link, router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Star,
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
import { ActivityList, Metrics, RiskSignals } from '../../components/market/TokenPanels';
import { useTokenInfo } from '../../components/market/useTokenInfo';
import { Sheet } from '../../components/Sheet';
import { ErrorState } from '../../components/States';
import { Text } from '../../components/Text';
import { TokenAvatar } from '../../components/TokenAvatar';
import { TokenWatch } from '../../components/TokenWatch';
import { api, socialApi } from '../../lib/api';
import { formatSolPrice, shortAddress } from '../../lib/format';
import { CHART_WINDOWS } from '../../lib/market';
import { useTokenStats } from '../../lib/market-hooks';
import { haptic } from '../../lib/motion';
import { useSession } from '../../lib/session';
import { useWatchlist } from '../../lib/social-hooks';
import { colors, radius, space } from '../../lib/theme';
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
  // On wide screens (web, tablets) the column keeps a readable width, centred.
  const gutter = Math.max(space.screen, (useWindowDimensions().width - 760) / 2);
  const { mint = '' } = useLocalSearchParams<{ mint: string }>();
  const valid = isSolanaAddress(mint);
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [section, setSection] = useState<Section>('activity');
  const [moreOpen, setMoreOpen] = useState(false);
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
  const windowLabel = CHART_WINDOWS.find((w) => w.minutes === windowMinutes)?.label ?? '1h';
  const price = stats.data?.priceSol;
  const footerHeight = 76 + insets.bottom;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: gutter }]}>
      <IconButton
        label="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      >
        <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
      </IconButton>
      <Text style={styles.pair} numberOfLines={1}>
        {symbol}
        <Text style={styles.pairQuote}> / SOL</Text>
      </Text>
      <WatchStar mint={mint} />
      <IconButton label="More" onPress={() => setMoreOpen(true)}>
        <MoreHorizontal size={20} color={colors.text} strokeWidth={2} />
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
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footerHeight + space.lg, paddingHorizontal: gutter },
        ]}
      >
        <View style={styles.identity}>
          <TokenAvatar
            uri={info?.imageUrl}
            label={info?.symbol ?? info?.name}
            seed={mint}
            size={52}
          />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <CopyAddress address={mint} />
          </View>
        </View>

        <View style={styles.priceBlock}>
          {price ? (
            <View style={styles.priceRow}>
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
          <View style={styles.changeRow}>
            <Change pct={stats.data?.changePct} size={16} arrow />
            <Text style={styles.windowText}>{pastWindow(windowMinutes)}</Text>
          </View>
        </View>

        <Tabs
          compact
          label="Chart window"
          options={CHART_WINDOWS.map((w) => ({ value: w.minutes, label: w.label }))}
          value={windowMinutes}
          onChange={setWindowMinutes}
        />
        {chart.isError ? (
          <ErrorState message="Couldn’t load the chart." onRetry={() => chart.refetch()} />
        ) : (
          <CandleChart
            points={chart.data?.points ?? []}
            emptyHeight={140}
            windowMinutes={windowMinutes}
          />
        )}

        <Metrics stats={stats.data} token={info} windowLabel={windowLabel} />
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

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + space.md, paddingHorizontal: gutter },
        ]}
      >
        <Link href={`/trade/${mint}?side=buy`} asChild>
          <Pressable
            style={StyleSheet.flatten([styles.action, styles.buy])}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${symbol}`}
          >
            <Text style={styles.buyText}>Buy</Text>
          </Pressable>
        </Link>
        <Link href={`/trade/${mint}?side=sell`} asChild>
          <Pressable
            style={StyleSheet.flatten([styles.action, styles.sell])}
            accessibilityRole="button"
            accessibilityLabel={`Sell ${symbol}`}
          >
            <Text style={styles.sellText}>Sell</Text>
          </Pressable>
        </Link>
      </View>

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

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(address);
        haptic.select();
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      accessibilityRole="button"
      accessibilityLabel="Copy token address"
      hitSlop={10}
      style={styles.copy}
    >
      <Text mono style={[styles.address, copied && { color: colors.up }]}>
        {copied ? 'Copied' : shortAddress(address)}
      </Text>
      {copied ? (
        <Check size={14} color={colors.up} strokeWidth={2.4} />
      ) : (
        <Copy size={14} color={colors.muted} strokeWidth={2} />
      )}
    </Pressable>
  );
}

/** Watchlist star: needs sign-in; filled when watching. */
export function WatchStar({ mint }: { mint: string }) {
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
        size={20}
        color={watching ? colors.caution : colors.text}
        fill={watching ? colors.caution : 'none'}
        strokeWidth={2}
      />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingBottom: space.sm,
  },
  pair: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  pairQuote: { color: colors.muted, fontWeight: '500' },
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, gap: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  address: { fontSize: 13, color: colors.muted },
  priceBlock: { gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, flexShrink: 1 },
  priceUnit: { fontSize: 17, fontWeight: '600', color: colors.muted },
  noPrice: { fontSize: 24, fontWeight: '600', color: colors.muted },
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
    height: 52,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buy: { backgroundColor: colors.accent },
  sell: { backgroundColor: colors.surface2 },
  buyText: { fontSize: 16, fontWeight: '700', color: colors.onAccent },
  sellText: { fontSize: 16, fontWeight: '700', color: colors.text },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  moreText: { fontSize: 15, fontWeight: '500' },
});
