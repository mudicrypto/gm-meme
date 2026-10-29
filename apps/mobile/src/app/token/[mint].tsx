import type { RiskLevel, TokenSummary } from '@sift/shared';
import { RISK_DISCLAIMER, isSolanaAddress } from '@sift/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { ModeToggle } from '../../components/ModeToggle';
import { PriceChart } from '../../components/PriceChart';
import { ErrorState, Loading } from '../../components/States';
import { Text } from '../../components/Text';
import { TokenAvatar } from '../../components/TokenAvatar';
import { TokenWatch } from '../../components/TokenWatch';
import { api } from '../../lib/api';
import {
  formatAge,
  formatCompact,
  formatPct,
  formatSol,
  formatSolPrice,
  priceChangePct,
  shortAddress,
} from '../../lib/format';
import { useMode } from '../../lib/mode';
import { RISK_COLORS, RISK_LABELS, colors, space, tint } from '../../lib/theme';

// The chart API takes 5 minutes to 24 hours.
const WINDOWS = [
  { value: 5, label: '5M' },
  { value: 60, label: '1H' },
  { value: 360, label: '6H' },
  { value: 1440, label: '24H' },
] as const;

const CHECK_NAMES: Record<string, string> = {
  mint_authority: 'Minting',
  freeze_authority: 'Freezing',
  token_extensions: 'Transfer rules',
  holder_concentration: 'Holders',
  liquidity: 'Liquidity',
  dev_history: 'Creator history',
  sell_test: 'Selling',
};

const MARKS: Record<RiskLevel, string> = { green: '✓', amber: '!', red: '×' };

export default function TokenScreen() {
  const insets = useSafeAreaInsets();
  const { mode } = useMode();
  const queryClient = useQueryClient();
  const { mint = '' } = useLocalSearchParams<{ mint: string }>();
  const [window, setWindow] = useState<(typeof WINDOWS)[number]['value']>(60);
  const [showDetails, setShowDetails] = useState(false);
  const valid = isSolanaAddress(mint);

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
    queryKey: ['chart', mint, window],
    queryFn: () => api.chart(mint, window),
    enabled: valid,
    refetchInterval: 15_000,
  });

  // Name, symbol and image come from the Discover lists already loaded, if any.
  const info = queryClient
    .getQueriesData<{ tokens: TokenSummary[] }>({ queryKey: ['feed'] })
    .flatMap(([, data]) => data?.tokens ?? [])
    .find((token) => token.mint === mint);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <IconButton
        label="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      >
        <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
      </IconButton>
      <View style={styles.identity}>
        <TokenAvatar
          uri={info?.imageUrl}
          label={info?.name ?? info?.symbol}
          seed={mint}
          size={32}
        />
        <View style={styles.flexShrink}>
          <Text style={styles.name} numberOfLines={1}>
            {info?.name ?? info?.symbol ?? shortAddress(mint)}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[
              info?.symbol,
              info ? `${formatAge(info.launchedAt ?? info.firstSeenAt)} old` : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || 'Token'}
          </Text>
        </View>
      </View>
      <ModeToggle />
    </View>
  );

  if (!valid)
    return (
      <View style={styles.root}>
        {header}
        <ErrorState message="That isn't a valid token address." />
      </View>
    );
  if (risk.isPending)
    return (
      <View style={styles.root}>
        {header}
        <Loading label="Checking this token…" />
      </View>
    );
  if (risk.isError)
    return (
      <View style={styles.root}>
        {header}
        <ErrorState message={risk.error.message} onRetry={() => risk.refetch()} />
      </View>
    );

  const points = chart.data?.points ?? [];
  const lastPrice = points[points.length - 1]?.priceSol;
  const change = priceChangePct(points);
  const volume = points.reduce((total, p) => total + p.volumeSol, 0);
  const reasons = risk.data.reasons;
  const passed = reasons.filter((r) => r.level === 'green').length;
  const level = risk.data.level;
  const VerdictIcon = level === 'green' ? ShieldCheck : ShieldAlert;
  const symbol = info?.symbol;

  return (
    <View style={styles.root}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          {lastPrice ? (
            <Text mono style={styles.price}>
              {formatSolPrice(lastPrice)} SOL
            </Text>
          ) : (
            <Text style={styles.noPrice}>No trades yet</Text>
          )}
          <View style={styles.changeRow}>
            {change !== undefined ? (
              <Text mono style={[styles.change, { color: change >= 0 ? colors.up : colors.down }]}>
                {formatPct(change)}
              </Text>
            ) : null}
            <Text style={styles.sub}>
              {[
                `last ${WINDOWS.find((w) => w.value === window)?.label.toLowerCase()}`,
                info?.marketCapUsd !== undefined
                  ? `MC $${formatCompact(info.marketCapUsd)}`
                  : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <View>
          <PriceChart points={points} />
          <View style={styles.ranges}>
            {WINDOWS.map((option) => {
              const selected = option.value === window;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setWindow(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.range, selected && styles.rangeOn]}
                >
                  <Text
                    mono
                    style={[styles.rangeLabel, { color: selected ? colors.text : colors.muted }]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {mode === 'pro' ? (
            <Text style={styles.proLine}>
              {formatSol(volume)} traded · prices from trades Sift recorded · {mint}
            </Text>
          ) : null}
        </View>

        <Card>
          <View style={styles.verdictRow}>
            <View style={styles.verdict}>
              <View
                style={[styles.verdictIcon, { backgroundColor: tint(RISK_COLORS[level].fg, 0.14) }]}
              >
                <VerdictIcon size={22} color={RISK_COLORS[level].fg} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.verdictLabel, { color: RISK_COLORS[level].fg }]}>
                  {RISK_LABELS[level]}
                </Text>
                <Text style={styles.sub}>
                  {passed} of {reasons.length} checks passed
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setShowDetails((value) => !value)}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.link}>{showDetails || mode === 'pro' ? 'Less' : 'Details'}</Text>
            </Pressable>
          </View>
          {showDetails || mode === 'pro' ? (
            <View style={styles.details}>
              {reasons.map((reason) => (
                <View key={reason.check} style={styles.detail}>
                  <Mark level={reason.level} />
                  <View style={styles.flex}>
                    <Text style={styles.checkName}>
                      {CHECK_NAMES[reason.check] ?? reason.check}
                    </Text>
                    <Text style={styles.checkText}>{reason.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {reasons.map((reason) => (
                <View key={reason.check} style={styles.cell}>
                  <Mark level={reason.level} />
                  <Text style={styles.checkText} numberOfLines={1}>
                    {CHECK_NAMES[reason.check] ?? reason.check}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card>
          <View style={styles.eyebrowRow}>
            <Sparkles size={14} color={colors.link} strokeWidth={2} />
            <Text style={styles.eyebrow}>In plain words</Text>
            {summary.data?.source === 'ai' ? <Text style={styles.aiTag}>AI</Text> : null}
          </View>
          {summary.isPending ? (
            <Text style={styles.checkText}>Writing a summary…</Text>
          ) : summary.isError ? (
            <Text style={styles.checkText}>Summary unavailable right now.</Text>
          ) : (
            <>
              <Text style={styles.body}>{summary.data.summary}</Text>
              {summary.data.redFlags.length > 0 ? (
                <View style={styles.flags}>
                  {summary.data.redFlags.map((flag) => (
                    <Text key={flag} style={styles.flag}>
                      {flag}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </Card>

        {mode === 'pro' ? (
          <Link
            href={{
              pathname: '/order/[mint]',
              params: {
                mint,
                ...(info?.symbol ? { symbol: info.symbol } : {}),
                ...(info?.name ? { name: info.name } : {}),
              },
            }}
            asChild
          >
            <Pressable style={StyleSheet.flatten(styles.orderLink)}>
              <View style={styles.orderIcon}>
                <Timer size={18} color={colors.link} strokeWidth={2} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.checkName}>Set an order</Text>
                <Text style={styles.sub}>
                  Limit, stop loss or take profit · runs while your phone is off
                </Text>
              </View>
              <ChevronRight size={18} color={colors.muted} strokeWidth={2} />
            </Pressable>
          </Link>
        ) : null}

        <TokenWatch mint={mint} priceSol={lastPrice} />
        <Text style={styles.note}>{risk.data.disclaimer ?? RISK_DISCLAIMER}</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.actions}>
          <Link href={`/trade/${mint}?side=sell`} asChild>
            <Pressable style={StyleSheet.flatten([styles.action, styles.sell])}>
              <Text style={styles.sellText}>Sell</Text>
            </Pressable>
          </Link>
          <Link href={`/trade/${mint}?side=buy`} asChild>
            <Pressable style={StyleSheet.flatten([styles.action, styles.buy])}>
              <Text style={styles.buyText}>{symbol ? `Buy ${symbol}` : 'Buy'}</Text>
            </Pressable>
          </Link>
        </View>
        <Text style={styles.footNote}>
          Safety checks reduce risk, they don’t remove it. Not financial advice.
        </Text>
      </View>
    </View>
  );
}

function Mark({ level }: { level: RiskLevel }) {
  const { fg } = RISK_COLORS[level];
  return (
    <View
      style={[styles.mark, { backgroundColor: tint(fg, 0.16) }]}
      accessibilityLabel={RISK_LABELS[level]}
    >
      <Text style={[styles.markText, { color: fg }]}>{MARKS[level]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.screen,
    paddingBottom: 8,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12, color: colors.muted },
  content: { paddingHorizontal: space.screen, paddingTop: 10, paddingBottom: 24, gap: space.gap },
  price: { fontSize: 32, fontWeight: '600', letterSpacing: -1 },
  noPrice: { fontSize: 24, fontWeight: '800', color: colors.muted },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  change: { fontSize: 14, fontWeight: '600' },
  ranges: { flexDirection: 'row', gap: 6, marginTop: 8 },
  range: { height: 32, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  rangeOn: { backgroundColor: colors.surface2 },
  rangeLabel: { fontSize: 12, fontWeight: '600' },
  proLine: { fontSize: 12, color: colors.faint, marginTop: 8 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verdictIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictLabel: { fontSize: 18, fontWeight: '800' },
  link: { fontSize: 13, fontWeight: '700', color: colors.link },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 4 },
  cell: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  details: { gap: 12, marginTop: 4 },
  detail: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 11, fontWeight: '800' },
  checkName: { fontSize: 14, fontWeight: '700' },
  checkText: { fontSize: 13, color: colors.text2, flexShrink: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.link,
  },
  aiTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.link,
    borderWidth: 1,
    borderColor: tint(colors.link, 0.35),
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  body: { fontSize: 14, lineHeight: 21, color: colors.body },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: {
    fontSize: 12,
    fontWeight: '700',
    color: RISK_COLORS.red.fg,
    backgroundColor: RISK_COLORS.red.bg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  note: { fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: 4 },
  footer: {
    paddingTop: 12,
    paddingHorizontal: space.screen,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: 10 },
  orderLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: tint(colors.accent, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  buy: { flex: 2, backgroundColor: colors.accent },
  sellText: { fontSize: 16, fontWeight: '800', color: colors.text },
  buyText: { fontSize: 16, fontWeight: '800', color: colors.onAccent },
  footNote: { marginTop: 8, textAlign: 'center', fontSize: 11, color: colors.faint },
});
