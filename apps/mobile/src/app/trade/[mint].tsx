import {
  DEFAULT_ORDER_SLIPPAGE_BPS,
  LAMPORTS_PER_SOL,
  protectPreset,
  type TradeQuote,
  type TradeQuoteRequest,
  type TradeSide,
  SIFT_PLATFORM_FEE_BPS,
  isSolanaAddress,
} from '@sift/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
  ShieldCheck,
  ShieldX,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NATIVE, haptic, transition, useReduceMotion } from '../../lib/motion';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { Confetti } from '../../components/Confetti';
import { EmptyState } from '../../components/EmptyState';
import { SolanaMark } from '../../components/market/Network';
import { useTokenInfo } from '../../components/market/useTokenInfo';
import { Segmented } from '../../components/Segmented';
import { ErrorState } from '../../components/States';
import { Sheet } from '../../components/Sheet';
import { SlideToConfirm } from '../../components/SlideToConfirm';
import { Switch } from '../../components/Switch';
import { Text, TextInput } from '../../components/Text';
import { parseSolToLamports, percentOfRaw, rawToTokens } from '../../lib/amounts';
import { FEE_WALLET, api, siftApi } from '../../lib/api';
import { costLines, secondsLeft } from '../../lib/costs';
import { formatCompact, shortAddress } from '../../lib/format';
import { useTokenStats } from '../../lib/market-hooks';
import { useMode } from '../../lib/mode';
import { breakpoints, RISK_COLORS, colors, radius, space, tint } from '../../lib/theme';
import { createRpcReader, onChainProblems } from '../../lib/chain-check';
import { mwaErrorMessage } from '../../lib/mwa-results';
import { checkQuote } from '../../lib/trade-check';
import { cancelPhantomRequest, isCancelled } from '../../lib/phantom';
import { useSession } from '../../lib/session';
import { useSiftWallet } from '../../lib/social-hooks';
import { useWallet } from '../../lib/wallet';
import { solscanUrl, useNetwork } from '../../lib/network';

const BUY_PRESETS = ['0.1', '0.5', '1'];
const SELL_PRESETS = [25, 50, 75, 100];
/** SOL kept back by "Max" for network fees and first-buy account deposits. */
const FEE_RESERVE_SOL = 0.01;
const PLATFORM_FEE_RATE = SIFT_PLATFORM_FEE_BPS / 10_000;
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
  sift: 'Sift wallet',
  embedded: 'Phone wallet',
  phantom: 'Phantom',
  walletApp: 'your wallet app',
  browser: 'Browser wallet',
} as const;

/** The done tick: pops in with one success haptic. */
function SuccessCheck() {
  const reduce = useReduceMotion();
  const scale = useState(() => new Animated.Value(reduce ? 1 : 0.4))[0];
  useEffect(() => {
    haptic.success();
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 140,
      useNativeDriver: NATIVE,
    }).start();
  }, [scale]);
  return (
    <Animated.View style={[styles.doneIcon, { transform: [{ scale }] }]}>
      <Check size={28} color={colors.up} strokeWidth={2.6} />
    </Animated.View>
  );
}

export default function TradeScreen() {
  const wideScreen = useWindowDimensions().width >= breakpoints.tablet;
  const { mode } = useMode();
  const { cluster, isDevnet, isMainnet } = useNetwork();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    mint: string;
    side?: string;
    amount?: string;
    slippage?: string;
  }>();
  const mint = params.mint ?? '';
  const [side, setSide] = useState<TradeSide>(params.side === 'sell' ? 'sell' : 'buy');
  // The desktop panel passes its amount and slippage along; anything odd falls back.
  const [solInput, setSolInput] = useState(
    params.amount && /^\d{1,6}(\.\d{1,9})?$/.test(params.amount) ? params.amount : '0.1',
  );
  const [sellPercent, setSellPercent] = useState(50);
  const [slippage, setSlippage] = useState<(typeof SLIPPAGES)[number]['value']>(
    SLIPPAGES.find((option) => option.value === params.slippage)?.value ?? '500',
  );
  const [understood, setUnderstood] = useState(false);
  const [stage, setStage] = useState<Stage>({ name: 'edit' });
  const [, tick] = useState(0);
  const session = useSession();
  const sift = useSiftWallet();
  const siftWallet = sift.data?.wallet;
  const siftUsable =
    siftWallet !== undefined &&
    siftWallet !== null &&
    !siftWallet.frozen &&
    siftWallet.signing === 'live';
  // The Sift wallet pays by default once it exists; the phone wallet stays one tap away.
  const [payWith, setPayWith] = useState<'sift' | 'phone' | null>(null);
  const fromSift = siftUsable && payWith !== 'phone';
  const payer = fromSift ? siftWallet.address : wallet.address;
  const [protect, setProtect] = useState(true);
  const [protectNote, setProtectNote] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  // On wide screens (web, tablets) the column keeps a readable width, centred.
  const gutter = Math.max(space.screen, (useWindowDimensions().width - 600) / 2);
  const tokenInfo = useTokenInfo(mint);
  // The last trade in a day: new tokens can go quiet for an hour.
  const priceStats = useTokenStats(mint, 1440, isSolanaAddress(mint));

  const risk = useQuery({
    queryKey: ['risk', mint],
    queryFn: () => api.risk(mint),
    enabled: isSolanaAddress(mint),
  });
  // A light warning buzz, once, when the token turns out to be red (the design's only
  // risk haptic).
  const isRed = risk.data?.level === 'red';
  useEffect(() => {
    if (isRed) haptic.warning();
  }, [isRed]);
  const holdings = useQuery({
    queryKey: ['holdings', payer],
    queryFn: () => api.holdings(payer!),
    enabled: payer !== null,
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
      <View style={styles.root}>
        <EmptyState
          icon={WalletIcon}
          title={Platform.OS === 'web' ? 'Connect a wallet to trade' : 'Set up a wallet to trade'}
          body="Your keys stay with you. Sift shows the full cost before anything is signed."
          action={{
            label: Platform.OS === 'web' ? 'Connect wallet' : 'Set up wallet',
            onPress: () => router.navigate('/portfolio'),
          }}
          secondary={{
            label: 'Back',
            onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
          }}
        />
      </View>
    );
  }

  const highRisk = risk.data?.level === 'red';
  const request = (): TradeQuoteRequest | null => {
    if (side === 'buy') {
      const lamports = parseSolToLamports(solInput);
      return lamports
        ? { mint, wallet: payer!, side, amount: lamports, slippageBps: Number(slippage) }
        : null;
    }
    if (!holding) return null;
    const amount = percentOfRaw(holding.amountRaw, sellPercent);
    return amount !== '0'
      ? { mint, wallet: payer!, side, amount, slippageBps: Number(slippage) }
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

  // "Protect this trade": a stop loss at -30% and a take profit at 2x, from the buy price.
  const placeProtection = async (quote: TradeQuote) => {
    const tokens = rawToTokens(quote.tokenAmount, quote.tokenDecimals);
    if (!(tokens > 0)) return;
    const entry = quote.expectedLamports / LAMPORTS_PER_SOL / tokens;
    try {
      await siftApi.placeOrders(
        session.token!,
        protectPreset(entry).map((order) => ({
          ...order,
          mint,
          slippageBps: DEFAULT_ORDER_SLIPPAGE_BPS,
          expiresInDays: 30,
        })),
        true,
      );
      setProtectNote('Protection is on: Sift sells if it falls 30%, and sells half if it doubles.');
      void queryClient.invalidateQueries({ queryKey: ['social', 'orders'] });
    } catch (err) {
      setProtectNote(
        `The buy went through, but protection couldn’t be set: ${(err as Error).message}`,
      );
    }
  };

  const confirm = async (quote: TradeQuote) => {
    setStage({ name: 'sending', quote });
    if (fromSift) {
      // Same checks as above already passed on this phone; Sift's server checks again,
      // applies your limits, then signs through the signing vault.
      try {
        const { signature } = await siftApi.trade(session.token!, quote.quoteId);
        setStage({ name: 'pending', quote, signature });
        if (quote.side === 'buy' && protect) void placeProtection(quote);
      } catch (err) {
        setStage({ name: 'failed', message: (err as Error).message });
      }
      return;
    }
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
  const symbol = (holding?.symbol ?? tokenInfo?.symbol ?? shortAddress(mint)).slice(0, 12);
  const flags = risk.data?.reasons.filter((r) => r.level !== 'green') ?? [];
  const editing = stage.name === 'edit' || stage.name === 'quoting';
  // Keep enough SOL for fees and a first-buy account deposit when using "Max".
  const maxSpend = solBalance !== undefined ? Math.max(0, solBalance - FEE_RESERVE_SOL) : 0;
  const setSol = (sol: number) => setSolInput(String(Number(sol.toFixed(4))));
  const lastPrice = priceStats.data?.priceSol;
  const feeShare = 1 - PLATFORM_FEE_RATE;
  const estimate =
    lastPrice === undefined
      ? null
      : side === 'buy'
        ? Number(solInput) > 0
          ? `≈ ${formatCompact((Number(solInput) * feeShare) / lastPrice)} ${symbol}`
          : null
        : holding
          ? `≈ ${formatCompact(rawToTokens(holding.amountRaw, holding.decimals) * (sellPercent / 100) * lastPrice * feeShare)} SOL`
          : null;
  const footerHeight = 112 + insets.bottom;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: wideScreen }} />
      <View
        style={[styles.header, { paddingTop: insets.top + space.sm, paddingHorizontal: gutter }]}
      >
        <IconButton
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/token/${mint}`))}
        >
          <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
        </IconButton>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {stage.name === 'review' ? `Review ${title.toLowerCase()}` : `Trade ${symbol}`}
          </Text>
          <View style={styles.networkPill}>
            <View
              style={[
                styles.networkDot,
                {
                  backgroundColor: isDevnet
                    ? colors.caution
                    : isMainnet
                      ? colors.accent
                      : colors.muted,
                },
              ]}
            />
            <Text style={styles.networkText}>
              {isDevnet ? 'Devnet · Test SOL' : isMainnet ? 'Solana · Real SOL' : 'Solana'}
            </Text>
          </View>
        </View>
        <IconButton label="Trade settings" onPress={() => setSettingsOpen(true)}>
          <Settings size={20} color={colors.text} strokeWidth={2} />
        </IconButton>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.screen,
          { paddingHorizontal: gutter },
          editing && { paddingBottom: footerHeight + space.lg },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {editing ? (
          <>
            <SideToggle side={side} onChange={setSide} />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Pay with</Text>
              <Pressable
                onPress={
                  siftUsable && wallet.address
                    ? () => setPayWith(fromSift ? 'phone' : 'sift')
                    : undefined
                }
                accessibilityRole="button"
                accessibilityLabel={`Paying from ${fromSift ? 'Sift wallet' : PAYING_FROM[wallet.kind ?? 'embedded']}${siftUsable ? ', tap to switch' : ''}`}
                style={({ pressed }) => [styles.panelRow, pressed && siftUsable && styles.pressed]}
              >
                <SolanaMark size={18} />
                <Text style={styles.payWith}>SOL</Text>
                <Text style={styles.payFrom} numberOfLines={1}>
                  {fromSift ? 'Sift wallet' : PAYING_FROM[wallet.kind ?? 'embedded']}
                </Text>
                {siftUsable && wallet.address ? (
                  <ChevronRight size={16} color={colors.muted} strokeWidth={2} />
                ) : null}
                <View style={styles.flex} />
                <Text mono style={styles.balance}>
                  {solBalance !== undefined
                    ? `Balance: ${formatCompact(solBalance)} SOL`
                    : 'Loading…'}
                </Text>
              </Pressable>
            </View>

            {side === 'buy' ? (
              <View style={styles.field}>
                <View style={styles.fieldHead}>
                  <Text style={styles.fieldLabel}>You pay</Text>
                  <Text style={styles.fieldHint}>
                    {isDevnet ? 'Test SOL, no real value' : isMainnet ? 'Trades are final' : ''}
                  </Text>
                </View>
                <View style={styles.amountPanel}>
                  <View style={styles.amountRow}>
                    <TextInput
                      mono
                      value={solInput}
                      onChangeText={(text) =>
                        setSolInput(text.replace(',', '.').replace(/[^0-9.]/g, ''))
                      }
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      accessibilityLabel="Amount to spend in SOL"
                      style={styles.amountInput}
                    />
                    <Text style={styles.amountUnit}>SOL</Text>
                  </View>
                  <View style={styles.amountFoot}>
                    <Text mono style={styles.available}>
                      Available {formatCompact(solBalance ?? 0)} SOL
                    </Text>
                    <View style={styles.flex} />
                    <Pressable
                      onPress={() => setSol(maxSpend / 2)}
                      hitSlop={10}
                      accessibilityRole="button"
                    >
                      <Text style={styles.quick}>50%</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSol(maxSpend)}
                      hitSlop={10}
                      accessibilityRole="button"
                    >
                      <Text style={styles.quick}>Max</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.presets}>
                  {BUY_PRESETS.map((p) => (
                    <PresetButton
                      key={p}
                      label={p}
                      selected={solInput === p}
                      onPress={() => setSolInput(p)}
                    />
                  ))}
                  <PresetButton
                    label="Max"
                    selected={maxSpend > 0 && Number(solInput) === Number(maxSpend.toFixed(4))}
                    onPress={() => setSol(maxSpend)}
                  />
                </View>
              </View>
            ) : holding ? (
              <View style={styles.field}>
                <View style={styles.fieldHead}>
                  <Text style={styles.fieldLabel}>You sell</Text>
                  <Text mono style={styles.fieldHint}>
                    Available {formatCompact(rawToTokens(holding.amountRaw, holding.decimals))}{' '}
                    {symbol}
                  </Text>
                </View>
                <View style={styles.amountPanel}>
                  <View style={styles.amountRow}>
                    <Text mono style={styles.amountInput}>
                      {sellPercent}%
                    </Text>
                    <Text style={styles.amountUnit}>of {symbol}</Text>
                  </View>
                </View>
                <View style={styles.presets}>
                  {SELL_PRESETS.map((p) => (
                    <PresetButton
                      key={p}
                      label={p === 100 ? 'All' : `${p}%`}
                      selected={sellPercent === p}
                      onPress={() => setSellPercent(p)}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.panel}>
                <Text style={styles.muted}>
                  {holdings.isPending
                    ? 'Loading your balance…'
                    : `This wallet doesn’t hold ${symbol}.`}
                </Text>
              </View>
            )}

            {/* What you get and what it costs, together so the fees are easy to check. */}
            <View style={styles.summary}>
              <View style={styles.summaryTop}>
                <View style={styles.fieldHead}>
                  <Text style={styles.fieldLabel}>
                    Estimated {side === 'buy' ? 'receive' : 'proceeds'}
                  </Text>
                  <Text style={styles.fieldHint}>At the last price</Text>
                </View>
                <Text mono style={styles.estimate} numberOfLines={1} adjustsFontSizeToFit>
                  {estimate ?? '–'}
                </Text>
                <Text style={styles.caption}>
                  The review shows the exact amount, fees and minimum before you confirm.
                </Text>
              </View>
              <View style={styles.summaryRows}>
                <DetailRow
                  label="Slippage"
                  value={`${Number(slippage) / 100}%`}
                  onPress={() => setSettingsOpen(true)}
                />
                <DetailRow label="Sift fee" value={`${PLATFORM_FEE_RATE * 100}%`} />
                <DetailRow label="Network fee" value="~0.000005 SOL + priority" />
                <DetailRow label="Price impact" value="Shown in review" last />
              </View>
            </View>

            {flags.length > 0 ? (
              <View style={[styles.flagsBox, highRisk ? styles.flagsRed : null]}>
                <View style={styles.flagsHead}>
                  <AlertTriangle
                    size={18}
                    color={highRisk ? colors.down : colors.caution}
                    strokeWidth={2}
                  />
                  <Text style={styles.flagsTitle}>
                    {flags.length} risk {flags.length === 1 ? 'flag' : 'flags'}
                    {highRisk ? ' · rated Risky' : ''}
                  </Text>
                </View>
                <Text style={styles.flagsBody}>
                  {flags
                    .slice(0, 2)
                    .map((f) => f.message)
                    .join(' ')}
                </Text>
                <Pressable
                  onPress={() => router.push(`/token/${mint}`)}
                  accessibilityRole="link"
                  hitSlop={8}
                >
                  <Text style={styles.quick}>Review token details</Text>
                </Pressable>
                {highRisk ? (
                  <View style={styles.rowBetween}>
                    <Text style={[styles.flagsBody, styles.flex]}>
                      I understand I could lose everything I put in.
                    </Text>
                    <Switch
                      value={understood}
                      onValueChange={setUnderstood}
                      label="I understand the risk"
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {fromSift && side === 'buy' ? (
              <ProtectCard
                on={protect}
                onChange={setProtect}
                simple={mode === 'simple'}
                onCustomize={() => router.push(`/order/${mint}?kind=stop_loss`)}
              />
            ) : null}
          </>
        ) : null}

        {stage.name === 'review' ? (
          <Review
            payingFrom={
              <PayingFrom
                kind={fromSift ? 'sift' : wallet.kind}
                address={payer!}
                solBalance={solBalance}
              />
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
                : fromSift
                  ? 'Signing from your Sift wallet…'
                  : wallet.kind === 'phantom'
                    ? 'Approve the trade in Phantom…'
                    : wallet.kind === 'walletApp'
                      ? 'Approve the trade in your wallet app…'
                      : wallet.kind === 'browser'
                        ? `Approve the trade in ${wallet.browserWalletName ?? 'your wallet'}…`
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
            <SuccessCheck />
            <Text style={styles.doneTitle}>{stage.quote.side === 'buy' ? 'Bought' : 'Sold'}</Text>
            <Text style={styles.center}>
              Confirmed on Solana.{' '}
              {stage.quote.side === 'buy'
                ? 'The tokens are in your wallet.'
                : 'The SOL is in your wallet.'}
            </Text>
            {protectNote ? <Text style={styles.protectNote}>{protectNote}</Text> : null}
            <Pressable onPress={() => Linking.openURL(solscanUrl('tx', stage.signature, cluster))}>
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
          {isDevnet
            ? 'Trades run on Solana devnet with test SOL. Not financial advice.'
            : isMainnet
              ? 'Trades run on Solana with real SOL and are final. Not financial advice.'
              : 'Not financial advice.'}
        </Text>
      </ScrollView>

      {editing ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + space.md, paddingHorizontal: gutter },
          ]}
        >
          <Button
            confirm
            label={stage.name === 'quoting' ? 'Getting price…' : `Review ${title.toLowerCase()}`}
            onPress={review}
            disabled={stage.name === 'quoting' || !request() || (highRisk && !understood)}
          />
          <Text style={styles.footNote}>You confirm before anything is signed.</Text>
        </View>
      ) : null}

      <Sheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} title="Trade settings">
        <Text style={styles.fieldLabel}>Max slippage</Text>
        <Segmented value={slippage} onChange={setSlippage} options={SLIPPAGES} />
        <Text style={styles.caption}>
          If the price moves more than this before your trade lands, it cancels and you pay only
          network fees. Wider slippage fills more often but can cost more.
        </Text>
        <Button small label="Done" onPress={() => setSettingsOpen(false)} />
      </Sheet>
      {stage.name === 'done' ? <Confetti /> : null}
    </KeyboardAvoidingView>
  );
}

function SideToggle({ side, onChange }: { side: TradeSide; onChange: (side: TradeSide) => void }) {
  return (
    <View style={styles.sides} accessibilityRole="tablist" accessibilityLabel="Buy or sell">
      {(['buy', 'sell'] as const).map((value) => {
        const selected = side === value;
        return (
          <Pressable
            key={value}
            onPress={() => {
              if (!selected) haptic.select();
              onChange(value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.side, selected && (value === 'buy' ? styles.sideBuy : styles.sideSell)]}
          >
            <Text
              style={[
                styles.sideText,
                selected && { color: value === 'buy' ? colors.onAccent : colors.text },
              ]}
            >
              {value === 'buy' ? 'Buy' : 'Sell'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PresetButton({
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
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.preset,
        hovered && !selected && { backgroundColor: colors.surface2 },
        selected && styles.presetOn,
        pressed && styles.pressed,
        transition,
      ]}
    >
      <Text mono style={[styles.presetText, selected && { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  onPress,
  last = false,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.flex} />
      <Text mono style={styles.detailValue}>
        {value}
      </Text>
      {onPress ? <ChevronRight size={16} color={colors.muted} strokeWidth={2} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.detail,
        !last && styles.detailDivider,
        pressed && styles.pressed,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={[styles.detail, !last && styles.detailDivider]}>{body}</View>
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
              ? `Checked ${Platform.OS === 'web' ? 'in this browser' : 'on this phone'} against Solana: the transaction does exactly this.`
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
        // Phones slide to confirm (hard to do by accident in a pocket); on the web a click is
        // easier, and the browser wallet still asks for its own approval after this.
        Platform.OS === 'web' ? (
          <Button
            label={
              verified
                ? `Confirm ${quote.side} · ${left}s`
                : 'Can’t confirm: this transaction doesn’t match the quote'
            }
            onPress={onConfirm}
            disabled={!verified}
            confirm
          />
        ) : (
          <SlideToConfirm
            label={`Slide to ${quote.side} · ${left}s`}
            onConfirm={onConfirm}
            disabled={!verified}
          />
        )
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
  onSwitch,
}: {
  kind: keyof typeof PAYING_FROM | null;
  address: string;
  solBalance: number | undefined;
  onSwitch?: () => void;
}) {
  return (
    <View style={styles.payingRow}>
      <Text style={styles.payingFrom}>
        Paying from{' '}
        <Text style={styles.payingStrong}>{kind ? PAYING_FROM[kind] : 'your wallet'}</Text>{' '}
        <Text mono style={styles.payingFrom}>
          {kind === 'sift' ? '' : shortAddress(address)}
          {solBalance !== undefined
            ? `${kind === 'sift' ? '' : ' '}· ${formatCompact(solBalance)} SOL`
            : ''}
        </Text>
      </Text>
      {onSwitch ? (
        <Pressable onPress={onSwitch} accessibilityRole="button" hitSlop={10}>
          <Text style={styles.switchLink}>Change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Protect this trade": on by default when buying from the Sift wallet. */
function ProtectCard({
  on,
  onChange,
  simple,
  onCustomize,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  simple: boolean;
  onCustomize: () => void;
}) {
  return (
    <View style={[styles.protect, on ? styles.protectOn : null]}>
      <View style={[styles.protectIcon, on ? styles.protectIconOn : null]}>
        <ShieldCheck size={20} color={on ? colors.up : colors.muted} strokeWidth={2} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.protectTitle}>Protect this trade</Text>
        <Text style={styles.protectBody}>
          {simple
            ? 'Auto-sell if it falls 30% · sell half when it doubles'
            : 'Stop loss −30% (all) · take profit +100% (half)'}
        </Text>
        <Pressable onPress={onCustomize} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.switchLink}>Customize</Text>
        </Pressable>
      </View>
      <Switch value={on} onValueChange={onChange} label="Protect this trade" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: space.screen, gap: space.md, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingBottom: space.sm,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerTitle: { textAlign: 'center', fontSize: 17, fontWeight: '600' },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  networkDot: { width: 6, height: 6, borderRadius: 3 },
  networkText: { fontSize: 11, fontWeight: '500', color: colors.muted },
  pressed: { opacity: 0.7 },
  sides: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  side: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.input - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBuy: { backgroundColor: colors.accent },
  sideSell: { backgroundColor: tint(colors.down, 0.2) },
  sideText: { fontSize: 15, fontWeight: '600', color: colors.text2 },
  field: { gap: space.sm },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: { fontSize: 14, color: colors.text2, fontWeight: '500' },
  fieldHint: { fontSize: 13, color: colors.muted },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  payWith: { fontSize: 16, fontWeight: '600' },
  payFrom: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  balance: { fontSize: 13, color: colors.muted },
  amountPanel: {
    padding: 16,
    gap: 8,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  amountFoot: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  available: { fontSize: 13, color: colors.muted },
  quick: { fontSize: 14, fontWeight: '600', color: colors.accent },
  panel: {
    padding: 16,
    gap: 6,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  summary: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' },
  summaryTop: { padding: 16, gap: 6 },
  summaryRows: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  estimate: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  preset: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetOn: { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
  presetText: { fontSize: 15, fontWeight: '600', color: colors.text2 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  detailDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { fontSize: 14, color: colors.muted },
  detailValue: { fontSize: 14, color: colors.text },
  flagsBox: {
    padding: 14,
    gap: 6,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: tint(colors.caution, 0.55),
    backgroundColor: tint(colors.caution, 0.06),
  },
  flagsRed: { borderColor: tint(colors.down, 0.55), backgroundColor: tint(colors.down, 0.06) },
  flagsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flagsTitle: { fontSize: 15, fontWeight: '600' },
  flagsBody: { fontSize: 13, lineHeight: 19, color: colors.text2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 8,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footNote: { fontSize: 12, textAlign: 'center', color: colors.muted },
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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    padding: 0,
  },
  amountEmpty: { color: colors.faint },
  amountUnit: { fontSize: 18, fontWeight: '600', color: colors.text2 },
  presets: { flexDirection: 'row', gap: 8 },
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
  payingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  payingFrom: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  payingStrong: { fontSize: 13, fontWeight: '700', color: colors.body },
  switchLink: { fontSize: 13, fontWeight: '700', color: colors.link },
  protect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  protectOn: { backgroundColor: tint(colors.up, 0.08), borderColor: tint(colors.up, 0.3) },
  protectIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectIconOn: { backgroundColor: tint(colors.up, 0.14) },
  protectTitle: { fontSize: 15, fontWeight: '800' },
  protectBody: { fontSize: 12, lineHeight: 17, color: colors.text2, marginTop: 2, marginBottom: 4 },
  protectNote: { fontSize: 13, lineHeight: 19, color: colors.up, textAlign: 'center' },
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
