import { router } from 'expo-router';
import { ChevronRight, ListOrdered, ShieldCheck, Wallet as WalletIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatCompact } from '../lib/format';
import { useSession } from '../lib/session';
import { useOrders, useSiftBalance, useSiftWallet } from '../lib/social-hooks';
import { colors, radius, tint } from '../lib/theme';
import { Text } from './Text';

/** The Sift wallet at the top of Portfolio: balance, running orders, and the way in. */
export function SiftWalletCard() {
  const session = useSession();
  const query = useSiftWallet();
  const wallet = query.data?.wallet;
  const balance = useSiftBalance(wallet?.address);
  const orders = useOrders();
  if (session.status !== 'signed-in' || query.isPending) return null;
  if (query.data?.signing === 'not_configured' && !wallet) return null;

  if (!wallet) {
    return (
      <Pressable
        onPress={() => router.push('/wallet')}
        accessibilityRole="button"
        style={styles.promo}
      >
        <View style={styles.icon}>
          <WalletIcon size={22} color={colors.onAccent} strokeWidth={2} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>Get your Sift wallet</Text>
          <Text style={styles.sub}>
            Stop losses and take profits that run while your phone is off
          </Text>
        </View>
        <ChevronRight size={18} color={colors.muted} strokeWidth={2} />
      </Pressable>
    );
  }

  const open = (orders.data?.orders ?? []).filter((o) => o.status === 'open').length;
  const healthy = !wallet.frozen && wallet.signing === 'live';
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: healthy ? colors.up : colors.caution }]} />
            <Text style={styles.sub}>
              Sift wallet · {wallet.frozen ? 'frozen' : healthy ? 'orders active' : 'paused'}
            </Text>
          </View>
          <Text mono style={styles.balance}>
            {balance.data ? formatCompact(balance.data.solBalance) : '–'}
            <Text mono style={styles.unit}>
              {' '}
              SOL
            </Text>
          </Text>
        </View>
        <View
          style={[
            styles.shield,
            { backgroundColor: tint(healthy ? colors.up : colors.caution, 0.14) },
          ]}
        >
          <ShieldCheck size={20} color={healthy ? colors.up : colors.caution} strokeWidth={2} />
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/orders')}
          accessibilityRole="button"
          style={[styles.action, styles.primary]}
        >
          <ListOrdered size={16} color={colors.onAccent} strokeWidth={2.2} />
          <Text style={styles.primaryText}>{open > 0 ? `Orders (${open})` : 'Orders'}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/wallet')}
          accessibilityRole="button"
          style={styles.action}
        >
          <Text style={styles.actionText}>Wallet & security</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.cardLarge,
    backgroundColor: tint(colors.accent, 0.1),
    borderWidth: 1,
    borderColor: tint(colors.accent, 0.3),
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  card: {
    padding: 18,
    gap: 14,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  balance: { fontSize: 36, fontWeight: '600', letterSpacing: -1.2, marginTop: 4 },
  unit: { fontSize: 16, fontWeight: '600', color: colors.muted, letterSpacing: 0 },
  shield: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { fontSize: 14, fontWeight: '800', color: colors.onAccent },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.text },
});
