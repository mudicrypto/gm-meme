import { SIFT_PLATFORM_FEE_BPS, type TokenStats } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../../lib/api';
import { formatCompact, shortAddress } from '../../lib/format';
import { CHART_WINDOWS, type MarketToken } from '../../lib/market';
import { useTokenStats } from '../../lib/market-hooks';
import { useSiftWallet } from '../../lib/social-hooks';
import { colors, radius, space } from '../../lib/theme';
import { useWallet } from '../../lib/wallet';
import { Button } from '../Button';
import { Text, TextInput } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { CandleChart } from './CandleChart';
import { Change } from './Change';
import { Tabs } from './Tabs';
import { SolPrice } from './SolPrice';
import { Metrics, RiskSignals } from './TokenPanels';
import { transition } from '../../lib/motion';
import { useNetwork } from '../../lib/network';

const BUY_PRESETS = ['0.1', '0.5', '1', '5'];
const SELL_PRESETS = [25, 50, 75, 100];
const SLIPPAGES = [
  { value: 100, label: '1%' },
  { value: 500, label: '5%' },
  { value: 1000, label: '10%' },
  { value: 2000, label: '20%' },
];
const FEE_RESERVE_SOL = 0.01;
const PLATFORM_FEE_RATE = SIFT_PLATFORM_FEE_BPS / 10_000;

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
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('0.1');
  const [sellPercent, setSellPercent] = useState(50);
  const [slippage, setSlippage] = useState(500);
  const wallet = useWallet();
  const { isDevnet } = useNetwork();
  const sift = useSiftWallet();
  const siftWallet = sift.data?.wallet;
  const payer =
    siftWallet && !siftWallet.frozen && siftWallet.signing === 'live'
      ? siftWallet.address
      : wallet.address;

  const chart = useQuery({
    queryKey: ['chart', mint, windowMinutes],
    queryFn: () => api.chart(mint, windowMinutes),
    refetchInterval: 15_000,
  });
  const statsQuery = useTokenStats(mint, windowMinutes, true);
  const risk = useQuery({ queryKey: ['risk', mint], queryFn: () => api.risk(mint) });
  const holdings = useQuery({
    queryKey: ['holdings', payer],
    queryFn: () => api.holdings(payer!),
    enabled: payer !== null,
  });

  // The last trade in a day, so a quiet hour still shows a price.
  const dayStats = useTokenStats(mint, 1440, true);
  const stats = statsQuery.data ?? listStats;
  const windowLabel = CHART_WINDOWS.find((w) => w.minutes === windowMinutes)?.label ?? '1h';
  const symbol = (token.symbol ?? token.name ?? shortAddress(mint)).slice(0, 12);
  const solBalance = holdings.data?.solBalance;
  const holding = holdings.data?.holdings.find((h) => h.mint === mint);
  const price = stats?.priceSol ?? dayStats.data?.priceSol;
  const sol = Number(amount);
  const amountOk = side === 'sell' || (Number.isFinite(sol) && sol > 0);
  const tooMuch = side === 'buy' && solBalance !== undefined && sol > solBalance;
  const estimate =
    price === undefined
      ? null
      : side === 'buy'
        ? sol > 0
          ? `≈ ${formatCompact((sol * (1 - PLATFORM_FEE_RATE)) / price)} ${symbol}`
          : null
        : null;

  const review = () => {
    const query =
      side === 'buy'
        ? `side=buy&amount=${encodeURIComponent(amount)}&slippage=${slippage}`
        : `side=sell&slippage=${slippage}`;
    router.push(`/trade/${mint}?${query}`);
  };

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
          <Tabs
            compact
            label="Buy or sell"
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
            value={side}
            onChange={setSide}
          />

          {side === 'buy' ? (
            <>
              <View style={styles.inputRow}>
                <TextInput
                  value={amount}
                  onChangeText={(v) => setAmount(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Amount in SOL"
                  style={styles.input}
                  placeholder="0.0"
                  placeholderTextColor={colors.faint}
                />
                <Text style={styles.unit}>SOL</Text>
              </View>
              <View style={styles.presets}>
                {BUY_PRESETS.map((p) => (
                  <Preset key={p} label={p} selected={amount === p} onPress={() => setAmount(p)} />
                ))}
              </View>
            </>
          ) : (
            <View style={styles.presets}>
              {SELL_PRESETS.map((p) => (
                <Preset
                  key={p}
                  label={`${p}%`}
                  selected={sellPercent === p}
                  onPress={() => setSellPercent(p)}
                />
              ))}
            </View>
          )}

          <View style={styles.lines}>
            <Line
              label="Balance"
              value={
                payer === null
                  ? 'No wallet connected'
                  : side === 'buy'
                    ? solBalance !== undefined
                      ? `${formatCompact(solBalance)} SOL`
                      : '…'
                    : holding
                      ? `${formatCompact(Number(holding.amountRaw) / 10 ** holding.decimals)} ${symbol}`
                      : `0 ${symbol}`
              }
            />
            {side === 'buy' ? <Line label="You receive (est.)" value={estimate ?? '–'} /> : null}
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Slippage</Text>
              <View style={styles.slips}>
                {SLIPPAGES.map((s) => (
                  <Pressable
                    key={s.value}
                    onPress={() => setSlippage(s.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: slippage === s.value }}
                    accessibilityLabel={`Slippage ${s.label}`}
                    style={[styles.slip, slippage === s.value && styles.slipOn]}
                  >
                    <Text
                      mono
                      style={[styles.slipText, slippage === s.value && { color: colors.text }]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Line label="Sift fee" value={`${PLATFORM_FEE_RATE * 100}%`} />
            <Line label="Network fee" value="~0.000005 SOL + priority" />
          </View>
        </View>
      </ScrollView>
      {/* Pinned so the trade action stays in reach on any desktop height. */}
      <View style={styles.footer}>
        {tooMuch ? (
          <Text style={[styles.note, { color: colors.caution }]}>
            More than your balance of {formatCompact(solBalance ?? 0)} SOL (keep about{' '}
            {FEE_RESERVE_SOL} SOL for fees).
          </Text>
        ) : null}

        {payer === null ? (
          <Button label="Connect a wallet to trade" onPress={() => router.navigate('/portfolio')} />
        ) : (
          <Button
            label={side === 'buy' ? `Review buy` : `Review sell ${sellPercent}%`}
            onPress={review}
            disabled={!amountOk || tooMuch || (side === 'sell' && !holding)}
            confirm
          />
        )}
        <Text style={styles.note}>
          Review shows the full cost and minimum received. You confirm before anything is signed.
          {isDevnet ? ' Devnet, test SOL only.' : ''}
        </Text>
      </View>
    </View>
  );
}

function Preset({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.preset,
        hovered && { backgroundColor: colors.surface2 },
        selected && styles.presetOn,
        transition,
      ]}
    >
      <Text mono style={[styles.presetText, selected && { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text mono style={styles.lineValue} numberOfLines={1}>
        {value}
      </Text>
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
