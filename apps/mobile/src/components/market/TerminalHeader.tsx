import { router, usePathname } from 'expo-router';
import { Briefcase, LayoutGrid, Star, Users, Wallet } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { searchAddress } from '../../lib/market';
import { shortAddress } from '../../lib/format';
import { breakpoints, colors, radius, space } from '../../lib/theme';
import { useWallet } from '../../lib/wallet';
import { Sheet } from '../Sheet';
import { transition } from '../../lib/motion';
import { Logo } from '../Logo';
import { Text, type TextInputHandle } from '../Text';
import { DevnetPill, NetworkChip, NetworkNote } from './Network';
import { SearchBar } from './SearchBar';

const NAV = [
  { href: '/', label: 'Discover', icon: LayoutGrid },
  { href: '/watchlist', label: 'Watchlist', icon: Star },
  { href: '/friends', label: 'Friends', icon: Users },
  { href: '/wallet', label: 'Wallets', icon: Wallet },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
] as const;

/**
 * The desktop and tablet header: brand, main navigation, search, network and wallet.
 * `query` is shared with the Discover table when it's on screen.
 */
export function TerminalHeader({
  query,
  onQuery,
}: {
  query?: string;
  onQuery?: (query: string) => void;
}) {
  const pathname = usePathname();
  // Below desktop width the nav keeps its icons and drops its labels.
  const compact = useWindowDimensions().width < breakpoints.desktop;
  const wallet = useWallet();
  const [local, setLocal] = useState('');
  const [networkOpen, setNetworkOpen] = useState(false);
  const searchRef = useRef<TextInputHandle>(null);
  const value = query ?? local;
  // ⌘K / Ctrl+K jumps to search, as the hint in the box says.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const mac = Platform.OS === 'web' && /Mac|iPhone|iPad/.test(navigator.platform);
  const setValue = onQuery ?? setLocal;
  const submit = () => {
    const address = searchAddress(value);
    if (address) router.push(`/token/${address}`);
    else if (!onQuery && value.trim()) router.push('/');
  };
  return (
    <View style={styles.bar} accessibilityRole="header">
      <Pressable
        onPress={() => router.navigate('/')}
        accessibilityRole="link"
        accessibilityLabel="Sift home"
        style={styles.brand}
      >
        <Logo size={28} />
      </Pressable>
      <View style={styles.nav} accessibilityRole="tablist">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Pressable
              key={item.href}
              onPress={() => router.navigate(item.href)}
              accessibilityRole="link"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.navItem,
                active && styles.navActive,
                hovered && !active && styles.navHover,
                transition,
              ]}
            >
              {compact ? (
                <Icon size={18} color={active ? colors.accent : colors.muted} strokeWidth={2} />
              ) : (
                <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.search}>
        <SearchBar
          value={value}
          onChange={setValue}
          onSubmit={submit}
          placeholder="Search token or address"
          hint={compact ? undefined : mac ? '⌘K' : 'Ctrl K'}
          inputRef={searchRef}
        />
      </View>
      <NetworkChip onPress={() => setNetworkOpen(true)} />
      {compact ? null : <DevnetPill />}
      {wallet.address ? (
        <Pressable
          onPress={() => router.navigate('/portfolio')}
          accessibilityRole="button"
          accessibilityLabel="Your wallet"
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.walletChip,
            hovered && styles.navHover,
          ]}
        >
          <View style={styles.walletDot} />
          <Text mono style={styles.walletText}>
            {shortAddress(wallet.address)}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.navigate('/portfolio')}
          accessibilityRole="button"
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.connect,
            hovered && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.connectText}>{compact ? 'Connect' : 'Connect wallet'}</Text>
        </Pressable>
      )}
      <Sheet visible={networkOpen} onClose={() => setNetworkOpen(false)} title="Network">
        <NetworkNote />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    height: 72,
    paddingHorizontal: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  brand: { marginRight: space.sm },
  nav: { flexDirection: 'row', alignItems: 'stretch', height: 72, gap: 4 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  navActive: { borderBottomColor: colors.accent },
  navHover: { borderBottomColor: colors.borderStrong },
  navText: { fontSize: 15, fontWeight: '500', color: colors.muted },
  navTextActive: { color: colors.accent, fontWeight: '700' },
  search: { flex: 1, maxWidth: 480, marginLeft: 'auto' },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.up },
  walletText: { fontSize: 13, fontWeight: '600' },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.input + 2,
    backgroundColor: colors.cta,
  },
  connectText: { fontSize: 15, fontWeight: '600', color: colors.onCta },
});
