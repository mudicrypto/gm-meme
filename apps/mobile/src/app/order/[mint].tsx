import {
  type CreateOrderRequest,
  DEFAULT_ORDER_SLIPPAGE_BPS,
  LAMPORTS_PER_SOL,
  type OrderKind,
  TRIGGER_STEPS,
  type TokenSummary,
  formatOrderPrice,
  isSolanaAddress,
  orderRequestProblems,
  orderSummary,
} from '@sift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/BackHeader';
import { Button } from '../../components/Button';
import { RiskBadge } from '../../components/RiskBadge';
import { SignInCard } from '../../components/SignInCard';
import { ErrorState, Loading } from '../../components/States';
import { Switch } from '../../components/Switch';
import { Text, TextInput } from '../../components/Text';
import { api, siftApi } from '../../lib/api';
import { rawToTokens } from '../../lib/amounts';
import { formatCompact, shortAddress } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useSiftBalance, useSiftWallet } from '../../lib/social-hooks';
import { breakpoints, colors, radius, space, tint } from '../../lib/theme';

type Tab = 'market' | OrderKind;

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'market', label: 'Market' },
  { value: 'limit_buy', label: 'Limit' },
  { value: 'stop_loss', label: 'Stop loss' },
  { value: 'take_profit', label: 'Take profit' },
];

const TRIGGER_LABEL: Record<OrderKind, string> = {
  limit_buy: 'Buy when price drops to',
  stop_loss: 'Sell if price falls to',
  take_profit: 'Sell when price reaches',
};

const CTA: Record<OrderKind, string> = {
  limit_buy: 'Place limit buy',
  stop_loss: 'Place stop loss',
  take_profit: 'Place take profit',
};

const SELL_SHARES = [25, 50, 75, 100];
const BUY_AMOUNTS = ['0.1', '0.25', '0.5'];
const EXPIRIES = [1, 7, 30];
const SLIPPAGES = [500, 1000, 2000];

export default function OrderScreen() {
  const wideScreen = useWindowDimensions().width >= breakpoints.tablet;
  const insets = useSafeAreaInsets();
  const session = useSession();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    mint: string;
    kind?: string;
    symbol?: string;
    name?: string;
  }>();
  const mint = params.mint ?? '';
  const initial = TABS.some((t) => t.value === params.kind) ? (params.kind as Tab) : 'stop_loss';
  const [tab, setTab] = useState<Tab>(initial);
  // Null until the user picks a chip or types: then the default (the second chip) applies.
  const [triggerInput, setTriggerInput] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [share, setShare] = useState(100);
  const [buySol, setBuySol] = useState('0.1');
  const [trailing, setTrailing] = useState(false);
  const [expiry, setExpiry] = useState(7);
  const [slippage, setSlippage] = useState(DEFAULT_ORDER_SLIPPAGE_BPS);

  const valid = isSolanaAddress(mint);
  const wallet = useSiftWallet();
  const info = wallet.data?.wallet;
  const holdings = useSiftBalance(info?.address);
  const risk = useQuery({
    queryKey: ['risk', mint],
    queryFn: () => api.risk(mint),
    enabled: valid,
  });
  const chart = useQuery({
    queryKey: ['chart', mint, 1440],
    queryFn: () => api.chart(mint, 1440),
    enabled: valid,
    refetchInterval: 15_000,
  });
  const price = chart.data?.points[chart.data.points.length - 1]?.priceSol;
  const token = queryClient
    .getQueriesData<{ tokens: TokenSummary[] }>({ queryKey: ['feed'] })
    .flatMap(([, data]) => data?.tokens ?? [])
    .find((t) => t.mint === mint);
  const holding = holdings.data?.holdings.find((h) => h.mint === mint);
  // Names are attacker-controlled token metadata: only used as display text, capped.
  const symbol = (token?.symbol ?? holding?.symbol ?? params.symbol ?? shortAddress(mint)).slice(
    0,
    20,
  );
  const name = (
    token?.name ??
    holding?.name ??
    params.name ??
    token?.symbol ??
    'Set an order'
  ).slice(0, 32);

  const kind = tab === 'market' ? null : tab;
  const priceAt = (pct: number) =>
    price ? String(Number((price * (1 + pct / 100)).toPrecision(3))) : '';
  const defaultStep = kind ? TRIGGER_STEPS[kind][1]! : null;
  const shownStep = triggerInput === null ? defaultStep : step;
  const trigger = triggerInput ?? (defaultStep !== null ? priceAt(defaultStep) : '');
  const applyStep = (pct: number) => {
    setStep(pct);
    setTriggerInput(priceAt(pct));
  };

  const request: CreateOrderRequest | null = kind
    ? {
        mint,
        kind,
        triggerPriceSol: Number(trigger),
        ...(kind === 'limit_buy'
          ? { buyLamports: Math.round(Number(buySol) * LAMPORTS_PER_SOL) }
          : { sellPercent: share }),
        ...(kind === 'stop_loss' && trailing ? { trailing: true } : {}),
        slippageBps: slippage,
        expiresInDays: expiry,
      }
    : null;
  const problems = request && info ? orderRequestProblems(request, info.limits) : [];
  const place = useMutation({
    mutationFn: () => siftApi.placeOrders(session.token!, [request!]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['social', 'orders'] });
      router.replace('/orders');
    },
  });

  if (!valid) return <ErrorState message="That isn't a valid token address." />;

  const summary =
    kind && !(Number(trigger) > 0)
      ? 'Set a trigger price to see exactly what this order will do.'
      : kind
        ? orderSummary({
            kind,
            symbol,
            triggerPriceSol: Number(trigger) || 0,
            currentPriceSol: price,
            buyLamports: Math.round(Number(buySol) * LAMPORTS_PER_SOL),
            sellPercent: share,
            trailing: kind === 'stop_loss' && trailing,
            slippageBps: slippage,
          })
        : 'Buys or sells right away at the best price now. You review the full cost first, then confirm.';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: wideScreen }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <BackHeader
          close
          center
          title={name}
          subtitle={price ? `Now ${formatOrderPrice(price)}` : 'No recent price'}
          right={
            <View style={styles.pro}>
              <Text style={styles.proText}>PRO</Text>
            </View>
          }
        />

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((option) => {
            const selected = tab === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setTab(option.value);
                  setTriggerInput(null);
                  setTrailing(false);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.tab, selected && styles.tabOn]}
              >
                <Text
                  style={[styles.tabText, { color: selected ? colors.onAccent : colors.text2 }]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {risk.data?.level === 'red' ? (
          <View style={styles.redNote}>
            <RiskBadge level="red" />
            <Text style={styles.redText}>
              {kind === 'limit_buy'
                ? 'Sift won’t buy red-rated tokens automatically.'
                : 'Red flags on this token: a stop may not be able to sell.'}
            </Text>
          </View>
        ) : null}

        {session.status !== 'signed-in' ? (
          <SignInCard reason="Place orders from your Sift wallet." />
        ) : wallet.isPending ? (
          <Loading />
        ) : !info && kind ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              Orders run from your Sift wallet, so they work while your phone is off.
            </Text>
            <Button label="Set up Sift wallet" onPress={() => router.push('/wallet')} />
          </View>
        ) : kind ? (
          <>
            <View>
              <Text style={styles.label}>{TRIGGER_LABEL[kind]}</Text>
              <View style={styles.triggerBox}>
                <TextInput
                  mono
                  value={trigger}
                  onChangeText={(text) => {
                    setTriggerInput(text);
                    setStep(null);
                  }}
                  placeholder={price ? String(Number(price.toPrecision(3))) : '0.0'}
                  keyboardType="decimal-pad"
                  accessibilityLabel={TRIGGER_LABEL[kind]}
                  style={styles.triggerInput}
                />
                <Text mono style={styles.unit}>
                  SOL
                </Text>
              </View>
              <View style={styles.grid}>
                {TRIGGER_STEPS[kind].map((pct) => (
                  <GridChip
                    key={pct}
                    label={`${pct > 0 ? '+' : ''}${pct}%`}
                    selected={shownStep === pct}
                    onPress={() => applyStep(pct)}
                    mono
                  />
                ))}
              </View>
            </View>

            {kind === 'limit_buy' ? (
              <View>
                <Text style={styles.label}>Amount to spend</Text>
                <View style={styles.grid}>
                  {BUY_AMOUNTS.map((amount) => (
                    <GridChip
                      key={amount}
                      label={`${amount} SOL`}
                      selected={buySol === amount}
                      onPress={() => setBuySol(amount)}
                    />
                  ))}
                  <TextInput
                    mono
                    value={BUY_AMOUNTS.includes(buySol) ? '' : buySol}
                    onChangeText={setBuySol}
                    placeholder="Other"
                    keyboardType="decimal-pad"
                    style={styles.otherInput}
                  />
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Amount to sell</Text>
                  {holding ? (
                    <Text mono style={styles.hint}>
                      {formatCompact(
                        (rawToTokens(holding.amountRaw, holding.decimals) * share) / 100,
                      )}{' '}
                      {symbol}
                    </Text>
                  ) : (
                    <Text style={styles.hint}>Not in your Sift wallet yet</Text>
                  )}
                </View>
                <View style={styles.grid}>
                  {SELL_SHARES.map((pct) => (
                    <GridChip
                      key={pct}
                      label={`${pct}%`}
                      selected={share === pct}
                      onPress={() => setShare(pct)}
                      tall
                    />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.card}>
              {kind === 'stop_loss' ? (
                <View style={[styles.optionRow, styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.optionTitle}>Trailing</Text>
                    <Text style={styles.optionSub}>Stop rises as the price rises</Text>
                  </View>
                  <Switch value={trailing} onValueChange={setTrailing} label="Trailing" />
                </View>
              ) : null}
              <View style={[styles.optionRow, styles.divider]}>
                <Text style={[styles.optionTitle, styles.flex]}>Expires</Text>
                <View style={styles.inline}>
                  {EXPIRIES.map((days) => (
                    <MiniChip
                      key={days}
                      label={days === 1 ? '1 day' : `${days} days`}
                      selected={expiry === days}
                      onPress={() => setExpiry(days)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.optionRow}>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>Max price move</Text>
                  <Text style={styles.optionSub}>Beyond this, the order waits</Text>
                </View>
                <View style={styles.inline}>
                  {SLIPPAGES.map((bps) => (
                    <MiniChip
                      key={bps}
                      label={`${bps / 100}%`}
                      selected={slippage === bps}
                      onPress={() => setSlippage(bps)}
                      mono
                    />
                  ))}
                </View>
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.summary}>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
        {problems.length > 0 && Number(trigger) > 0 ? (
          <Text style={styles.error}>{problems.join(' ')}</Text>
        ) : null}
        {place.isError ? <Text style={styles.error}>{place.error.message}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.runs}>
          <View style={styles.dot} />
          <Text style={styles.runsText}>
            {kind
              ? 'Runs automatically, even when your phone is off'
              : 'You review the full cost before confirming'}
          </Text>
        </View>
        {kind ? (
          <Button
            confirm
            label={place.isPending ? 'Placing…' : CTA[kind]}
            disabled={!info || problems.length > 0 || !(Number(trigger) > 0) || place.isPending}
            onPress={() => place.mutate()}
          />
        ) : (
          <Button label="Review trade" onPress={() => router.replace(`/trade/${mint}`)} />
        )}
      </View>
    </View>
  );
}

function GridChip({
  label,
  selected,
  onPress,
  mono = false,
  tall = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  mono?: boolean;
  tall?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.gridChip, tall && styles.gridChipTall, selected && styles.chipOn]}
    >
      <Text mono={mono} style={[styles.chipText, { color: selected ? colors.text : colors.text2 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MiniChip({
  label,
  selected,
  onPress,
  mono = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  mono?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.mini, selected && styles.chipOn]}
    >
      <Text mono={mono} style={[styles.miniText, { color: selected ? colors.text : colors.muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.screen, paddingBottom: 24, gap: 16 },
  flex: { flex: 1 },
  pro: {
    width: 44,
    height: 28,
    borderRadius: 999,
    backgroundColor: tint(colors.accent, 0.16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  proText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.link },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.accent },
  tabText: { fontSize: 12, fontWeight: '800' },
  redNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.input,
    backgroundColor: tint(colors.down, 0.08),
    borderWidth: 1,
    borderColor: tint(colors.down, 0.25),
  },
  redText: { flex: 1, fontSize: 13, color: colors.body },
  label: { fontSize: 13, color: colors.muted },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hint: { fontSize: 12, color: colors.faint },
  triggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    marginTop: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  triggerInput: { flex: 1, minWidth: 0, fontSize: 24, fontWeight: '600', padding: 0 },
  unit: { fontSize: 15, fontWeight: '600', color: colors.muted },
  grid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  gridChip: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridChipTall: { height: 44, borderRadius: 12 },
  chipOn: { borderColor: colors.accent, backgroundColor: tint(colors.accent, 0.14) },
  chipText: { fontSize: 13, fontWeight: '700' },
  otherInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 13,
    padding: 0,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 0,
  },
  body: { fontSize: 13, lineHeight: 19, color: colors.text2, paddingVertical: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  optionTitle: { fontSize: 14, color: colors.body },
  optionSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  inline: { flexDirection: 'row', gap: 6 },
  mini: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniText: { fontSize: 12, fontWeight: '700' },
  summary: {
    padding: 14,
    borderRadius: radius.input,
    backgroundColor: tint(colors.accent, 0.1),
    borderWidth: 1,
    borderColor: tint(colors.accent, 0.3),
  },
  summaryText: { fontSize: 13, lineHeight: 20, color: colors.body },
  error: { fontSize: 13, color: colors.down },
  footer: { paddingHorizontal: space.screen, paddingTop: 10, backgroundColor: colors.bg },
  runs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.up },
  runsText: { fontSize: 12, color: colors.muted },
});
