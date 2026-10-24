import {
  type TradeQuote,
  type TradeQuoteRequest,
  type TradeSide,
  isSolanaAddress,
} from '@sift/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Check, ShieldCheck, ShieldX } from 'lucide-react-native';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip } from '../../components/Button';
import { Card } from '../../components/Card';
import { DevnetBadge } from '../../components/DevnetBadge';
import { RiskBadge } from '../../components/RiskBadge';
import { Segmented } from '../../components/Segmented';
import { ErrorState } from '../../components/States';
import { Switch } from '../../components/Switch';
import { Text, TextInput } from '../../components/Text';
import { parseSolToLamports, percentOfRaw, rawToTokens } from '../../lib/amounts';
import { FEE_WALLET, api } from '../../lib/api';
import { costLines, secondsLeft } from '../../lib/costs';
import { formatCompact, shortAddress } from '../../lib/format';
import { useMode } from '../../lib/mode';
import { RISK_COLORS, colors, radius, space, tint } from '../../lib/theme';
import { createRpcReader, onChainProblems } from '../../lib/chain-check';
import { mwaErrorMessage } from '../../lib/mwa-results';
import { checkQuote } from '../../lib/trade-check';
import { cancelPhantomRequest, isCancelled } from '../../lib/phantom';
import { useWallet } from '../../lib/wallet';

const BUY_PRESETS = ['0.01', '0.05', '0.1', '0.5'];
const SELL_PRESETS = [25, 50, 100];
const SLIPPAGES = [
  { value: '100', label: '1%' },
  { value: '500', label: '5%' },
  { value: '1000', label: '10%' },
  { value: '2000', label: '20%' },
] as const;

type Stage =
  | { name: 'edit' }
  | { name: 'quoting' }
  | { name: 'review'; quote: TradeQuote; request: TradeQuoteRequest; problems: string[] }
  | { name: 'sending'; quote: TradeQuote }
  | { name: 'pending' | 'done'; quote: TradeQuote; signature: string }
  | { name: 'failed'; message: string };

const chain = createRpcReader();

const PAYING_FROM = {
  embedded: 'this phone’s wallet',
  phantom: 'Phantom',
  walletApp: 'your wallet app',
} as const;

export default function TradeScreen() {
  const { mode } = useMode();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ mint: string; side?: string }>();
  const mint = params.mint ?? '';
  const [side, setSide] = useState<TradeSide>(params.side === 'sell' ? 'sell' : 'buy');
  const [solInput, setSolInput] = useState('0.05');
  const [sellPercent, setSellPercent] = useState(50);
  const [slippage, setSlippage] = useState<(typeof SLIPPAGES)[number]['value']>('500');
  const [understood, setUnderstood] = useState(false);
  const [stage, setStage] = useState<Stage>({ name: 'edit' });
  const [, tick] = useState(0);

  const risk = useQuery({
    queryKey: ['risk', mint],
    queryFn: () => api.risk(mint),
    enabled: isSolanaAddress(mint),
  });
  const holdings = useQuery({
    queryKey: ['holdings', wallet.address],
    queryFn: () => api.holdings(wallet.address!),
    enabled: wallet.address !== null,
  });
  const holding = holdings.data?.holdings.find((h) => h.mint === mint);

  // Countdown on the quote; poll the network once sent.
  useEffect(() => {
    if (stage.name !== 'review' && stage.name !== 'pending') return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [stage.name]);
  useEffect(() => {
    if (stage.name !== 'pending') return;
    let cancelled = false;
    const started = Date.now();
    const poll = async () => {
      while (!cancelled && Date.now() - started < 90_000) {
        const status = await api.tradeStatus(stage.signature).catch(() => null);
        if (status?.status === 'confirmed' || status?.status === 'finalized') {
          if (!cancelled)
            setStage({ name: 'done', quote: stage.quote, signature: stage.signature });
          void queryClient.invalidateQueries({ queryKey: ['holdings'] });
          return;
        }
        if (status?.status === 'failed') {
          if (!cancelled)
            setStage({
              name: 'failed',
              message:
                'The trade failed on chain. No tokens were bought or sold; you paid only network fees.',
            });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled)
        setStage({
          name: 'failed',
          message:
            'Still not confirmed after 90 seconds. Check your wallet history before trying again.',
        });
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [stage, queryClient]);

  if (!isSolanaAddress(mint)) return <ErrorState message="That isn't a valid token address." />;
  if (wallet.status === 'loading') return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!wallet.address) {
    return (
      <View style={styles.screen}>
        <Card title="Set up a wallet to trade">
          <Text style={styles.muted}>
            Create a wallet on this phone or connect your wallet app. Either way, your key never
            leaves your device.
          </Text>
          <Link href="/portfolio" asChild>
            <Pressable style={StyleSheet.flatten(styles.linkButton)}>
              <Text style={styles.linkButtonText}>Set up wallet</Text>
            </Pressable>
          </Link>
        </Card>
      </View>
    );
  }

  const highRisk = risk.data?.level === 'red';
  const request = (): TradeQuoteRequest | null => {
    if (side === 'buy') {
      const lamports = parseSolToLamports(solInput);
      return lamports
        ? { mint, wallet: wallet.address!, side, amount: lamports, slippageBps: Number(slippage) }
        : null;
    }
    if (!holding) return null;
    const amount = percentOfRaw(holding.amountRaw, sellPercent);
    return amount !== '0'
      ? { mint, wallet: wallet.address!, side, amount, slippageBps: Number(slippage) }
      : null;
  };

  const review = async () => {
    const req = request();
    if (!req) return;
    setStage({ name: 'quoting' });
    try {
      const quote = await api.quote(req);
      const problems = checkQuote(quote, req, FEE_WALLET);
      // Then the price, decimals and deposits, read from Solana directly (not via Sift).
      if (problems.length === 0) {
        problems.push(
          ...(await onChainProblems(quote, chain).catch(() => [
            'couldn’t check the price on the Solana network; try again in a moment',
          ])),
        );
      }
      setStage({ name: 'review', quote, request: req, problems });
    } catch (err) {
      setStage({ name: 'failed', message: (err as Error).message });
    }
  };

  const confirm = async (quote: TradeQuote) => {
    setStage({ name: 'sending', quote });
    try {
      const signed = await wallet.signTransaction(quote.transaction);
      const { signature } = await api.submit(quote.quoteId, signed);
      setStage({ name: 'pending', quote, signature });
    } catch (err) {
      if (isCancelled(err)) setStage({ name: 'edit' });
      else if (wallet.kind === 'walletApp') {
        const message = mwaErrorMessage(err);
        setStage(message ? { name: 'failed', message } : { name: 'edit' });
      } else setStage({ name: 'failed', message: (err as Error).message });
    }
  };

  const title = side === 'buy' ? 'Buy' : 'Sell';
  const solBalance = holdings.data?.solBalance;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen
        options={{
          title: `${title} ${holding?.symbol ?? shortAddress(mint)}`,
          headerRight: () => (
            <View style={styles.headerBadge}>
              <DevnetBadge />
            </View>
          ),
        }}
      />

      {stage.name === 'edit' || stage.name === 'quoting' ? (
        <>
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />
          <View style={styles.rowBetween}>
            <RiskBadge level={risk.data?.level} />
            <Text mono style={styles.muted}>
              {solBalance !== undefined ? `${formatCompact(solBalance)} SOL available` : ' '}
            </Text>
          </View>
          {side === 'buy' ? (
            <>
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>You pay</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    value={solInput}
                    onChangeText={setSolInput}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Amount to spend in SOL"
                    mono
                    style={styles.amountInput}
                  />
                  <Text mono style={styles.amountUnit}>
                    SOL
                  </Text>
                </View>
                <Text style={styles.caption}>
                  Includes Sift’s fee. Network fees are added on top.
                </Text>
              </View>
              <View style={styles.presets}>
                {BUY_PRESETS.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    mono
                    filled={false}
                    selected={solInput === p}
                    onPress={() => setSolInput(p)}
                  />
                ))}
              </View>
            </>
          ) : holding ? (
            <>
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>You sell</Text>
                <Text mono style={styles.amountInput}>
                  {sellPercent}%
                </Text>
                <Text style={styles.caption}>
                  of {formatCompact(rawToTokens(holding.amountRaw, holding.decimals))}{' '}
                  {holding.symbol ?? 'tokens'}
                </Text>
              </View>
              <View style={styles.presets}>
                {SELL_PRESETS.map((p) => (
                  <Chip
                    key={p}
                    label={p === 100 ? 'All' : `${p}%`}
                    mono
                    filled={false}
                    selected={sellPercent === p}
                    onPress={() => setSellPercent(p)}
                  />
                ))}
              </View>
            </>
          ) : (
            <Card>
              <Text style={styles.muted}>
                {holdings.isPending ? 'Loading your balance…' : 'You don’t hold this token.'}
              </Text>
            </Card>
          )}
          {mode === 'pro' ? (
            <View style={styles.slippage}>
              <Text style={styles.label}>Max slippage</Text>
              <Segmented compact value={slippage} onChange={setSlippage} options={SLIPPAGES} />
            </View>
          ) : (
            <Text style={styles.caption}>Max slippage 5% (change in Pro mode).</Text>
          )}

          {highRisk ? (
            <View style={[styles.warning, styles.redBox]}>
              <Text style={styles.redStrong}>Sift flagged this token as high risk.</Text>
              <View style={styles.rowBetween}>
                <Text style={[styles.red, styles.flex]}>
                  I understand I could lose everything I put in.
                </Text>
                <Switch
                  value={understood}
                  onValueChange={setUnderstood}
                  label="I understand the risk"
                />
              </View>
            </View>
          ) : null}

          <PayingFrom kind={wallet.kind} address={wallet.address} solBalance={solBalance} />
          <Button
            label={stage.name === 'quoting' ? 'Getting price…' : `Review ${title.toLowerCase()}`}
            onPress={review}
            disabled={stage.name === 'quoting' || !request() || (highRisk && !understood)}
          />
        </>
      ) : null}

      {stage.name === 'review' ? (
        <Review
          payingFrom={
            <PayingFrom kind={wallet.kind} address={wallet.address} solBalance={solBalance} />
          }
          quote={stage.quote}
          problems={stage.problems}
          onConfirm={() => confirm(stage.quote)}
          onBack={() => setStage({ name: 'edit' })}
          onRefresh={review}
        />
      ) : null}

      {stage.name === 'sending' || stage.name === 'pending' ? (
        <Card>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.center}>
            {stage.name === 'pending'
              ? 'Waiting for the network to confirm…'
              : wallet.kind === 'phantom'
                ? 'Approve the trade in Phantom…'
                : wallet.kind === 'walletApp'
                  ? 'Approve the trade in your wallet app…'
                  : 'Signing on this phone and sending…'}
          </Text>
          {stage.name === 'sending' && wallet.kind === 'phantom' ? (
            <Pressable onPress={cancelPhantomRequest}>
              <Text style={[styles.center, styles.muted]}>Cancel</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {stage.name === 'done' ? (
        <Card>
          <View style={styles.doneIcon}>
            <Check size={26} color={colors.up} strokeWidth={2.4} />
          </View>
          <Text style={styles.doneTitle}>{stage.quote.side === 'buy' ? 'Bought' : 'Sold'}</Text>
          <Text style={styles.center}>
            Confirmed on Solana.{' '}
            {stage.quote.side === 'buy'
              ? 'The tokens are in your wallet.'
              : 'The SOL is in your wallet.'}
          </Text>
          <Pressable onPress={() => Linking.openURL(explorerUrl(stage.signature))}>
            <Text style={[styles.center, styles.link]}>View on Solscan</Text>
          </Pressable>
          <Button
            label="Trade again"
            variant="secondary"
            onPress={() => setStage({ name: 'edit' })}
          />
        </Card>
      ) : null}

      {stage.name === 'failed' ? (
        <Card title="Trade not completed">
          <Text style={styles.bodyText}>{stage.message}</Text>
          <Button label="Back" variant="secondary" onPress={() => setStage({ name: 'edit' })} />
        </Card>
      ) : null}

      <Text style={styles.note}>
        Trades run on Solana devnet with test SOL. Not financial advice.
      </Text>
    </ScrollView>
  );
}

function Review({
  quote,
  problems,
  payingFrom,
  onConfirm,
  onBack,
  onRefresh,
}: {
  quote: TradeQuote;
  problems: string[];
  payingFrom: ReactNode;
  onConfirm: () => void;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const left = secondsLeft(quote);
  const tokens = formatCompact(rawToTokens(quote.tokenAmount, quote.tokenDecimals));
  const verified = problems.length === 0;
  const status = verified ? RISK_COLORS.green : RISK_COLORS.red;
  const StatusIcon = verified ? ShieldCheck : ShieldX;

  return (
    <>
      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>
          {quote.side === 'buy' ? 'You get about' : 'You sell'}
        </Text>
        <Text mono style={styles.amountInput}>
          {tokens}
        </Text>
        <Text style={styles.caption}>tokens</Text>
      </View>

      <Card title="Full cost">
        {costLines(quote).map((line) => (
          <View key={line.label} style={styles.costLine}>
            <View style={styles.rowBetween}>
              <Text style={line.emphasis ? styles.costStrong : styles.costLabel}>{line.label}</Text>
              <Text mono style={line.emphasis ? styles.costStrong : styles.costValue}>
                {line.value}
              </Text>
            </View>
            {line.note ? <Text style={styles.caption}>{line.note}</Text> : null}
          </View>
        ))}
        {quote.priceImpactPct !== null ? (
          <Text style={[styles.caption, quote.priceImpactPct >= 10 && { color: colors.down }]}>
            Price impact {quote.priceImpactPct.toFixed(1)}% (fees included) · via {quote.venue}
          </Text>
        ) : null}
      </Card>

      <View
        style={[styles.warning, { backgroundColor: status.bg, borderColor: tint(status.fg, 0.3) }]}
      >
        <View style={styles.statusRow}>
          <StatusIcon size={18} color={status.fg} strokeWidth={2} />
          <Text style={[styles.flex, { color: status.fg, fontWeight: '700' }]}>
            {verified
              ? 'Checked on this phone against Solana: the transaction does exactly this.'
              : 'Do not sign: this transaction doesn’t match the quote.'}
          </Text>
        </View>
        {problems.map((p) => (
          <Text key={p} style={styles.red}>
            • {p}
          </Text>
        ))}
      </View>

      {payingFrom}
      {left > 0 ? (
        <Button
          label={`Confirm ${quote.side} · ${left}s`}
          onPress={onConfirm}
          disabled={!verified}
        />
      ) : (
        <Button label="Price expired · get a new one" onPress={onRefresh} />
      )}
      <Button label="Change amount" variant="secondary" onPress={onBack} />
    </>
  );
}

function PayingFrom({
  kind,
  address,
  solBalance,
}: {
  kind: keyof typeof PAYING_FROM | null;
  address: string;
  solBalance: number | undefined;
}) {
  return (
    <Text style={styles.payingFrom}>
      Paying from {kind ? PAYING_FROM[kind] : 'your wallet'}{' '}
      <Text mono style={styles.payingFrom}>
        {shortAddress(address)}
      </Text>
      {solBalance !== undefined ? ` · ${formatCompact(solBalance)} SOL` : ''}
    </Text>
  );
}

function explorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

const styles = StyleSheet.create({
  screen: { padding: space.screen, gap: 12, paddingBottom: 40 },
  flex: { flex: 1 },
  headerBadge: { marginRight: 12 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  muted: { fontSize: 13, color: colors.muted },
  caption: { fontSize: 12, color: colors.faint },
  label: { fontWeight: '700', fontSize: 14 },
  amountBox: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: space.card,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  amountLabel: { fontSize: 13, color: colors.muted },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountInput: {
    fontSize: 44,
    fontWeight: '600',
    letterSpacing: -1.5,
    textAlign: 'center',
    minWidth: 80,
    padding: 0,
  },
  amountUnit: { fontSize: 18, fontWeight: '600', color: colors.muted },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  slippage: { gap: 8 },
  warning: { borderRadius: radius.input, padding: 14, gap: 6, borderWidth: 1 },
  redBox: { backgroundColor: RISK_COLORS.red.bg, borderColor: tint(colors.down, 0.3) },
  red: { color: RISK_COLORS.red.fg },
  redStrong: { color: RISK_COLORS.red.fg, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  costLine: { gap: 2 },
  costLabel: { fontSize: 14, color: colors.text2 },
  costValue: { fontSize: 14, color: colors.text },
  costStrong: { fontSize: 15, fontWeight: '700', color: colors.text },
  payingFrom: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  linkButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: { fontSize: 16, fontWeight: '800', color: colors.onAccent },
  doneIcon: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tint(colors.up, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  bodyText: { fontSize: 14, color: colors.text2 },
  link: { color: colors.link, fontWeight: '700' },
  center: { textAlign: 'center', color: colors.text },
  note: { fontSize: 12, textAlign: 'center', color: colors.faint },
});
