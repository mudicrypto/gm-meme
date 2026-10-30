import { SIFT_PLATFORM_FEE_BPS } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../lib/api';
import { formatCompact } from '../../lib/format';
import { transition } from '../../lib/motion';
import { useNetwork } from '../../lib/network';
import { useSiftWallet } from '../../lib/social-hooks';
import { colors, radius, space } from '../../lib/theme';
import { useWallet } from '../../lib/wallet';
import { Button } from '../Button';
import { Text, TextInput } from '../Text';
import { Tabs } from './Tabs';

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
 * The buy/sell form used beside the Discover table and on the desktop token page. It only
 * prepares the trade: "Review" opens the trade screen, which quotes, checks and asks you
 * to confirm before anything is signed. Fields and action render separately so a layout
 * can pin the action.
 */
export function useTradeForm(mint: string, symbol: string, price: number | undefined) {
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
  const holdings = useQuery({
    queryKey: ['holdings', payer],
    queryFn: () => api.holdings(payer!),
    enabled: payer !== null,
  });
  const solBalance = holdings.data?.solBalance;
  const holding = holdings.data?.holdings.find((h) => h.mint === mint);
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
  return {
    symbol,
    side,
    setSide,
    amount,
    setAmount,
    sellPercent,
    setSellPercent,
    slippage,
    setSlippage,
    payer,
    solBalance,
    holding,
    amountOk,
    tooMuch,
    estimate,
    review,
    isDevnet,
  };
}

export type TradeFormState = ReturnType<typeof useTradeForm>;

/** Buy/Sell tabs, amount, presets, balance, estimate, slippage and fees. */
export function TradeFields({ form }: { form: TradeFormState }) {
  const {
    symbol,
    side,
    setSide,
    amount,
    setAmount,
    sellPercent,
    setSellPercent,
    slippage,
    setSlippage,
    payer,
    solBalance,
    holding,
    estimate,
  } = form;
  return (
    <View style={styles.fields}>
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
  );
}

/** The one primary action (or Connect), with the balance warning and the reminder. */
export function TradeAction({ form }: { form: TradeFormState }) {
  const { side, sellPercent, payer, solBalance, holding, amountOk, tooMuch, review, isDevnet } =
    form;
  return (
    <View style={styles.action}>
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
  fields: { gap: space.md },
  action: { gap: space.sm },
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
