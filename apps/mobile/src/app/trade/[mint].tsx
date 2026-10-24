import {
  type TradeQuote,
  type TradeQuoteRequest,
  type TradeSide,
  isSolanaAddress,
} from '@sift/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card } from '../../components/Card';
import { RiskBadge } from '../../components/RiskBadge';
import { Segmented } from '../../components/Segmented';
import { ErrorState } from '../../components/States';
import { parseSolToLamports, percentOfRaw, rawToTokens } from '../../lib/amounts';
import { FEE_WALLET, api } from '../../lib/api';
import { costLines, secondsLeft } from '../../lib/costs';
import { formatCompact, shortAddress } from '../../lib/format';
import { useMode } from '../../lib/mode';
import { RISK_COLORS, usePalette } from '../../lib/theme';
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

export default function TradeScreen() {
  const palette = usePalette();
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
          <Text style={{ color: palette.muted }}>
            Create a wallet on this phone or connect your wallet app. Either way, your key never
            leaves your device.
          </Text>
          <Link href="/portfolio" asChild>
            <Pressable
              style={StyleSheet.flatten([styles.primary, { backgroundColor: palette.accent }])}
            >
              <Text style={[styles.primaryText, { color: palette.accentText }]}>Set up wallet</Text>
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
      <Stack.Screen options={{ title: `${title} ${holding?.symbol ?? shortAddress(mint)}` }} />

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
          <Card>
            <View style={styles.rowBetween}>
              <RiskBadge level={risk.data?.level} />
              <Text style={{ color: palette.muted }}>
                {solBalance !== undefined ? `${formatCompact(solBalance)} SOL available` : ' '}
              </Text>
            </View>
            {side === 'buy' ? (
              <>
                <Text style={[styles.label, { color: palette.text }]}>Amount to spend (SOL)</Text>
                <TextInput
                  value={solInput}
                  onChangeText={setSolInput}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                />
                <View style={styles.presets}>
                  {BUY_PRESETS.map((p) => (
                    <Chip
                      key={p}
                      label={`${p} SOL`}
                      selected={solInput === p}
                      onPress={() => setSolInput(p)}
                    />
                  ))}
                </View>
                <Text style={{ color: palette.muted, fontSize: 13 }}>
                  Includes Sift’s fee. Network fees are added on top.
                </Text>
              </>
            ) : holding ? (
              <>
                <Text style={[styles.label, { color: palette.text }]}>
                  Sell {sellPercent}% of{' '}
                  {formatCompact(rawToTokens(holding.amountRaw, holding.decimals))}{' '}
                  {holding.symbol ?? 'tokens'}
                </Text>
                <View style={styles.presets}>
                  {SELL_PRESETS.map((p) => (
                    <Chip
                      key={p}
                      label={p === 100 ? 'All' : `${p}%`}
                      selected={sellPercent === p}
                      onPress={() => setSellPercent(p)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Text style={{ color: palette.muted }}>
                {holdings.isPending ? 'Loading your balance…' : 'You don’t hold this token.'}
              </Text>
            )}
            {mode === 'pro' ? (
              <>
                <Text style={[styles.label, { color: palette.text }]}>Max slippage</Text>
                <Segmented compact value={slippage} onChange={setSlippage} options={SLIPPAGES} />
              </>
            ) : (
              <Text style={{ color: palette.muted, fontSize: 13 }}>
                Max slippage 5% (change in Pro mode).
              </Text>
            )}
          </Card>

          {highRisk ? (
            <View style={[styles.warning, { backgroundColor: RISK_COLORS.red.bg }]}>
              <Text style={{ color: RISK_COLORS.red.fg, fontWeight: '700' }}>
                Sift flagged this token as high risk.
              </Text>
              <View style={styles.rowBetween}>
                <Text style={{ color: RISK_COLORS.red.fg, flex: 1 }}>
                  I understand I could lose everything I put in.
                </Text>
                <Switch
                  value={understood}
                  onValueChange={setUnderstood}
                  accessibilityLabel="I understand the risk"
                />
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={review}
            disabled={stage.name === 'quoting' || !request() || (highRisk && !understood)}
            style={[
              styles.primary,
              {
                backgroundColor: palette.accent,
                opacity:
                  stage.name === 'quoting' || !request() || (highRisk && !understood) ? 0.4 : 1,
              },
            ]}
          >
            <Text style={[styles.primaryText, { color: palette.accentText }]}>
              {stage.name === 'quoting' ? 'Getting price…' : `Review ${title.toLowerCase()}`}
            </Text>
          </Pressable>
        </>
      ) : null}

      {stage.name === 'review' ? (
        <Review
          quote={stage.quote}
          problems={stage.problems}
          onConfirm={() => confirm(stage.quote)}
          onBack={() => setStage({ name: 'edit' })}
          onRefresh={review}
        />
      ) : null}

      {stage.name === 'sending' || stage.name === 'pending' ? (
        <Card>
          <ActivityIndicator color={palette.accent} />
          <Text style={[styles.center, { color: palette.text }]}>
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
              <Text style={[styles.center, { color: palette.muted }]}>Cancel</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {stage.name === 'done' ? (
        <Card title={stage.quote.side === 'buy' ? 'Bought' : 'Sold'}>
          <Text style={{ color: palette.text }}>
            Confirmed on Solana.{' '}
            {stage.quote.side === 'buy'
              ? 'The tokens are in your wallet.'
              : 'The SOL is in your wallet.'}
          </Text>
          <Pressable onPress={() => Linking.openURL(explorerUrl(stage.signature))}>
            <Text style={{ color: palette.accent, fontWeight: '600' }}>View on Solscan</Text>
          </Pressable>
          <Pressable
            onPress={() => setStage({ name: 'edit' })}
            style={[styles.secondary, { borderColor: palette.border }]}
          >
            <Text style={{ color: palette.text, fontWeight: '600' }}>Trade again</Text>
          </Pressable>
        </Card>
      ) : null}

      {stage.name === 'failed' ? (
        <Card title="Trade not completed">
          <Text style={{ color: palette.text }}>{stage.message}</Text>
          <Pressable
            onPress={() => setStage({ name: 'edit' })}
            style={[styles.secondary, { borderColor: palette.border }]}
          >
            <Text style={{ color: palette.text, fontWeight: '600' }}>Back</Text>
          </Pressable>
        </Card>
      ) : null}

      <Text style={[styles.note, { color: palette.muted }]}>
        Trades run on Solana devnet with test SOL. Not financial advice.
      </Text>
    </ScrollView>
  );
}

function Review({
  quote,
  problems,
  onConfirm,
  onBack,
  onRefresh,
}: {
  quote: TradeQuote;
  problems: string[];
  onConfirm: () => void;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const palette = usePalette();
  const left = secondsLeft(quote);
  const tokens = formatCompact(rawToTokens(quote.tokenAmount, quote.tokenDecimals));
  const verified = problems.length === 0;

  return (
    <>
      <Card title={quote.side === 'buy' ? `You get ${tokens} tokens` : `You sell ${tokens} tokens`}>
        {costLines(quote).map((line) => (
          <View key={line.label} style={{ gap: 2 }}>
            <View style={styles.rowBetween}>
              <Text style={[{ color: palette.text }, line.emphasis && styles.bold]}>
                {line.label}
              </Text>
              <Text style={[{ color: palette.text }, line.emphasis && styles.bold]}>
                {line.value}
              </Text>
            </View>
            {line.note ? (
              <Text style={{ color: palette.muted, fontSize: 12 }}>{line.note}</Text>
            ) : null}
          </View>
        ))}
        {quote.priceImpactPct !== null ? (
          <Text
            style={{
              color: quote.priceImpactPct >= 10 ? palette.down : palette.muted,
              fontSize: 13,
            }}
          >
            Price impact {quote.priceImpactPct.toFixed(1)}% (fees included) · via {quote.venue}
          </Text>
        ) : null}
      </Card>

      <View
        style={[
          styles.warning,
          { backgroundColor: verified ? RISK_COLORS.green.bg : RISK_COLORS.red.bg },
        ]}
      >
        <Text
          style={{ color: verified ? RISK_COLORS.green.fg : RISK_COLORS.red.fg, fontWeight: '700' }}
        >
          {verified
            ? 'Checked on this phone: the transaction does exactly this.'
            : 'Do not sign: this transaction doesn’t match the quote.'}
        </Text>
        {problems.map((p) => (
          <Text key={p} style={{ color: RISK_COLORS.red.fg }}>
            • {p}
          </Text>
        ))}
      </View>

      {left > 0 ? (
        <Pressable
          onPress={onConfirm}
          disabled={!verified}
          style={[styles.primary, { backgroundColor: palette.accent, opacity: verified ? 1 : 0.4 }]}
        >
          <Text style={[styles.primaryText, { color: palette.accentText }]}>
            Confirm {quote.side} · {left}s
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onRefresh}
          style={[styles.primary, { backgroundColor: palette.accent }]}
        >
          <Text style={[styles.primaryText, { color: palette.accentText }]}>
            Price expired · get a new one
          </Text>
        </Pressable>
      )}
      <Pressable onPress={onBack} style={[styles.secondary, { borderColor: palette.border }]}>
        <Text style={{ color: palette.text, fontWeight: '600' }}>Change amount</Text>
      </Pressable>
    </>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? palette.accent : palette.border,
          backgroundColor: selected ? palette.accent : 'transparent',
        },
      ]}
    >
      <Text style={{ color: selected ? palette.accentText : palette.text, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function explorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: { fontWeight: '600', fontSize: 15 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 20,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  warning: { borderRadius: 12, padding: 12, gap: 6 },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondary: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  note: { fontSize: 12, textAlign: 'center' },
});
