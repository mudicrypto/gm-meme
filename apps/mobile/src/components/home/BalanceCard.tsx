import { router } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatCompact } from '../../lib/format';
import { useNetwork } from '../../lib/network';
import { useActiveAddress, usePortfolio } from '../../lib/portfolio-hooks';
import { useSession } from '../../lib/session';
import { useSiftWallet } from '../../lib/social-hooks';
import { colors, radius, space } from '../../lib/theme';
import { useWallet } from '../../lib/wallet';
import { Button } from '../Button';
import { FlashText } from '../FlashText';
import { Text } from '../Text';

/**
 * The top of Home: your estimated total in SOL, or, before you have a wallet, a one-tap
 * account. Values use last traded prices; there's no profit or loss (no cost basis).
 */
export function BalanceCard() {
  const wallet = useWallet();
  const address = useActiveAddress();
  const sift = useSiftWallet().data?.wallet;
  const portfolio = usePortfolio(address);
  const { isDevnet } = useNetwork();
  const [hidden, setHidden] = useState(false);

  if (wallet.status === 'loading') return <View style={[styles.card, styles.loading]} />;
  if (!address) return <CreateAccount />;

  const source =
    sift && address === sift.address
      ? 'Sift wallet'
      : wallet.kind === 'embedded'
        ? Platform.OS === 'web'
          ? 'Test wallet'
          : 'This phone'
        : 'Your wallet';
  const mask = (text: string) => (hidden ? '••••' : text);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Est. total value</Text>
        <Pressable
          onPress={() => setHidden((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
          hitSlop={12}
        >
          {hidden ? (
            <EyeOff size={16} color={colors.muted} strokeWidth={2} />
          ) : (
            <Eye size={16} color={colors.muted} strokeWidth={2} />
          )}
        </Pressable>
        <View style={styles.flex} />
        <View style={styles.source}>
          <Text style={styles.sourceText}>{source}</Text>
        </View>
      </View>
      <View style={styles.totalRow}>
        <FlashText value={portfolio.total} style={styles.total}>
          {portfolio.total !== undefined ? mask(formatCompact(portfolio.total)) : '…'}
        </FlashText>
        <Text style={styles.unit}>{isDevnet ? 'test SOL' : 'SOL'}</Text>
      </View>
      <Text style={styles.split} numberOfLines={1}>
        SOL {portfolio.sol !== undefined ? mask(formatCompact(portfolio.sol)) : '…'} · Tokens{' '}
        {portfolio.pricesPending ? '…' : mask(formatCompact(portfolio.tokenValue))}
      </Text>
    </View>
  );
}

/**
 * One tap to a working account: a wallet made on this device (its key never leaves it),
 * then sign-in. On the web the key lives only in the tab, so it's offered on devnet only.
 */
function CreateAccount() {
  const wallet = useWallet();
  const session = useSession();
  const { isDevnet } = useNetwork();
  const [step, setStep] = useState<'idle' | 'creating' | 'signing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const canCreate = wallet.persistent || isDevnet;

  // Sign in once the new wallet is in place (the wallet context updates after create).
  useEffect(() => {
    if (step !== 'creating' || !wallet.address || session.status !== 'signed-out') return;
    const timer = setTimeout(() => {
      setStep('signing');
      session
        .signIn()
        .catch((err: Error) => setError(`Your wallet is ready, but sign-in failed: ${err.message}`))
        .finally(() => setStep('idle'));
    }, 0);
    return () => clearTimeout(timer);
  }, [step, wallet.address, session]);

  const start = async () => {
    setError(null);
    setStep('creating');
    try {
      await wallet.create();
    } catch (err) {
      setStep('idle');
      setError((err as Error).message);
    }
  };

  return (
    <View style={[styles.card, styles.welcome]}>
      <Text style={styles.welcomeTitle}>Welcome to Sift</Text>
      <Text style={styles.welcomeBody}>
        Solana meme coins with a risk check on every token and the full cost before every trade.
      </Text>
      {canCreate ? (
        <Button
          variant="lime"
          label={step === 'idle' ? 'Create your account' : 'Setting up…'}
          onPress={() => void start()}
          disabled={step !== 'idle'}
        />
      ) : null}
      <Button
        variant="secondary"
        label="I already have a wallet"
        onPress={() => router.push('/portfolio')}
      />
      <Text style={styles.note}>
        {wallet.persistent
          ? 'Your wallet is made on this phone. Its key stays in secure storage and is never sent to Sift.'
          : 'Web test account: devnet only, and gone when you close this tab. Use the app for a real one.'}
      </Text>
      {error ? <Text style={[styles.note, { color: colors.down }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: 6,
    padding: space.lg,
    borderRadius: radius.card + 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loading: { height: 128 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: colors.muted },
  source: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surface2,
  },
  sourceText: { fontSize: 11, fontWeight: '600', color: colors.muted },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  total: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8 },
  unit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  split: { fontSize: 13, color: colors.muted },
  welcome: { gap: space.md },
  welcomeTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  welcomeBody: { fontSize: 14, lineHeight: 20, color: colors.text2 },
  note: { fontSize: 12, lineHeight: 17, color: colors.muted },
});
