import { SIFT_PLATFORM_FEE_BPS } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ArrowDown } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../lib/api';
import { formatCompact } from '../../lib/format';
import { transition } from '../../lib/motion';
import { useNetwork } from '../../lib/network';
import { useSiftWallet } from '../../lib/social-hooks';
import { dark, radius, space } from '../../lib/theme';
import { useWallet } from '../../lib/wallet';
import { Button } from '../Button';
import { Ink, Text, TextInput } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { SolanaMark } from './Network';

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
export function useTradeForm(
  mint: string,
  symbol: string,
  price: number | undefined,
  token?: { name?: string; imageUrl?: string },
) {
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
  const held = holding ? Number(holding.amountRaw) / 10 ** holding.decimals : 0;
  // At the last price, after Sift's fee: the review screen shows the real quote.
  const estimate =
    price === undefined || price <= 0
      ? null
      : side === 'buy'
        ? sol > 0
          ? formatCompact((sol * (1 - PLATFORM_FEE_RATE)) / price)
          : null
        : held > 0
          ? formatCompact(((held * sellPercent) / 100) * price * (1 - PLATFORM_FEE_RATE))
          : null;
  const review = () => {
    const query =
      side === 'buy'
        ? `side=buy&amount=${encodeURIComponent(amount)}&slippage=${slippage}`
        : `side=sell&slippage=${slippage}`;
    router.push(`/trade/${mint}?${query}`);
  };
  return {
    mint,
    symbol,
    name: token?.name,
    imageUrl: token?.imageUrl,
    held,
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

/**
 * Buy/Sell tabs, the "You pay" and "Estimated receive" cards, presets, slippage and fees,
 * on the dark trade surface.
 */
export function TradeFields({ form }: { form: TradeFormState }) {
  const {
    mint,
    symbol,
    name,
    imageUrl,
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
    held,
    estimate,
  } = form;
  const token = { symbol, name, mint, imageUrl };
  const balance =
    payer === null
      ? 'Not connected'
      : side === 'buy'
        ? solBalance !== undefined
          ? `${formatCompact(solBalance)} SOL`
          : '…'
        : `${formatCompact(held)} ${symbol}`;
  return (
    <Ink color={dark.text}>
      <View style={styles.fields}>
        <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Buy or sell">
          {(['buy', 'sell'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setSide(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: side === value }}
              style={[styles.tab, side === value && styles.tabOn]}
            >
              <Text style={[styles.tabText, side !== value && { color: dark.muted }]}>
                {value === 'buy' ? 'Buy' : 'Sell'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>You pay</Text>
            <Text style={styles.cardLabel} numberOfLines={1}>
              Balance <Text style={styles.cardBalance}>{balance}</Text>
            </Text>
          </View>
          <View style={styles.cardBody}>
            {side === 'buy' ? <Chip sol /> : <Chip {...token} />}
            {side === 'buy' ? (
              <TextInput
                mono
                value={amount}
                onChangeText={(v) => setAmount(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount in SOL"
                style={styles.input}
                placeholder="0.0"
                placeholderTextColor={dark.faint}
              />
            ) : (
              <Text mono style={styles.amount} numberOfLines={1}>
                {sellPercent}%
              </Text>
            )}
          </View>
        </View>

        <View style={styles.presets}>
          {side === 'buy'
            ? BUY_PRESETS.map((p) => (
                <Preset key={p} label={p} selected={amount === p} onPress={() => setAmount(p)} />
              ))
            : SELL_PRESETS.map((p) => (
                <Preset
                  key={p}
                  label={`${p}%`}
                  selected={sellPercent === p}
                  onPress={() => setSellPercent(p)}
                />
              ))}
        </View>

        <View style={styles.swapRow}>
          <View style={styles.swapLine} />
          <Pressable
            onPress={() => setSide(side === 'buy' ? 'sell' : 'buy')}
            accessibilityRole="button"
            accessibilityLabel={side === 'buy' ? 'Switch to sell' : 'Switch to buy'}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.swap,
              hovered && { borderColor: dark.lime },
              transition,
            ]}
          >
            <ArrowDown size={18} color={dark.text} strokeWidth={2} />
          </Pressable>
          <View style={styles.swapLine} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>Estimated receive</Text>
          </View>
          <View style={styles.cardBody}>
            {side === 'buy' ? <Chip {...token} /> : <Chip sol />}
            <Text mono style={styles.amount} numberOfLines={1}>
              {estimate ?? '–'}
            </Text>
          </View>
        </View>

        <View style={styles.lines}>
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
                    style={[styles.slipText, slippage === s.value && { color: dark.lime }]}
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
    </Ink>
  );
}

/** The one primary action (or Connect), with the balance warning and the reminder. */
export function TradeAction({ form }: { form: TradeFormState }) {
  const { side, sellPercent, payer, solBalance, holding, amountOk, tooMuch, review, isDevnet } =
    form;
  return (
    <Ink color={dark.text}>
      <View style={styles.action}>
        {tooMuch ? (
          <Text style={[styles.note, { color: dark.caution }]}>
            More than your balance of {formatCompact(solBalance ?? 0)} SOL (keep about{' '}
            {FEE_RESERVE_SOL} SOL for fees).
          </Text>
        ) : null}

        {payer === null ? (
          <Button
            label="Connect wallet"
            variant="lime"
            onPress={() => router.navigate('/portfolio')}
          />
        ) : (
          <Button
            label={side === 'buy' ? `Review buy` : `Review sell ${sellPercent}%`}
            variant="lime"
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
    </Ink>
  );
}

function Chip({
  sol = false,
  symbol,
  name,
  mint,
  imageUrl,
}: {
  sol?: boolean;
  symbol?: string;
  name?: string;
  mint?: string;
  imageUrl?: string;
}) {
  return (
    <View style={styles.chip}>
      {sol ? (
        <View style={styles.solLogo}>
          <SolanaMark size={16} />
        </View>
      ) : (
        <TokenAvatar uri={imageUrl} label={symbol ?? name} seed={mint} size={32} />
      )}
      <Text style={styles.chipSymbol} numberOfLines={1}>
        {sol ? 'SOL' : symbol}
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
        hovered && !selected && { backgroundColor: dark.surface2 },
        selected && styles.presetOn,
        transition,
      ]}
    >
      <Text mono style={[styles.presetText, selected && { color: dark.lime }]}>
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
  tabs: { flexDirection: 'row' },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: dark.border,
  },
  tabOn: { borderBottomColor: dark.lime },
  tabText: { fontSize: 15, fontWeight: '600' },
  card: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardLabel: { fontSize: 13, color: dark.muted, flexShrink: 1 },
  cardBalance: { fontSize: 13, color: dark.text, fontWeight: '500' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: dark.surface2,
    maxWidth: 150,
  },
  solLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSymbol: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  input: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontSize: 26,
    fontWeight: '700',
    padding: 0,
    outlineStyle: 'none',
  } as object,
  amount: { flex: 1, textAlign: 'right', fontSize: 26, fontWeight: '700' },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: -6 },
  swapLine: { flex: 1, height: 1, backgroundColor: dark.border },
  swap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { fontSize: 12, color: dark.muted, lineHeight: 17 },
  presets: { flexDirection: 'row', gap: space.sm },
  preset: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetOn: { borderColor: dark.lime, backgroundColor: dark.surface2 },
  presetText: { fontSize: 14, fontWeight: '600' },
  lines: { gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  lineLabel: { fontSize: 13, color: dark.muted },
  lineValue: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  slips: { flexDirection: 'row', gap: 4 },
  slip: {
    minHeight: 32,
    minWidth: 44,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slipOn: { borderColor: dark.lime },
  slipText: { fontSize: 12, fontWeight: '600', color: dark.muted },
});
