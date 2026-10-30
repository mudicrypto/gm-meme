import { router } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Minus, Plus } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatCompact, shortAddress } from '../../lib/format';
import { useMarket } from '../../lib/market-hooks';
import { transition } from '../../lib/motion';
import { useActiveAddress, usePortfolio } from '../../lib/portfolio-hooks';
import { colors, radius, space, tint } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from '../market/Change';
import { SolanaMark } from '../market/Network';
import { Tabs } from '../market/Tabs';
import { TokenListRow } from '../market/TokenListRow';

const ACTIONS = [
  { label: 'Deposit', icon: ArrowDownToLine, href: '/deposit' },
  { label: 'Buy', icon: Plus, href: '/markets' },
  { label: 'Sell', icon: Minus, href: '/portfolio' },
  { label: 'Send', icon: ArrowUpFromLine, href: '/send' },
] as const;

/** Deposit, Buy, Sell and Send, one tap each. */
export function QuickActions() {
  return (
    <View style={styles.actions}>
      {ACTIONS.map(({ label, icon: Icon, href }) => (
        <Pressable
          key={label}
          onPress={() => router.push(href)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.action,
            (pressed || hovered) && { opacity: 0.8 },
            transition,
          ]}
        >
          <View style={styles.actionIcon}>
            <Icon size={20} color={colors.accent} strokeWidth={2.2} />
          </View>
          <Text style={styles.actionText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** SOL and your biggest holdings by value, with a way to the full list. */
export function AssetsCard() {
  const address = useActiveAddress();
  const portfolio = usePortfolio(address);
  if (!address) return null;
  const top = portfolio.rows.slice(0, 3);
  return (
    <View style={styles.card}>
      <View style={styles.moversHead}>
        <SectionHead title="Your assets" link="See all" onLink={() => router.push('/portfolio')} />
      </View>
      <AssetRow
        icon={
          <View style={styles.solIcon}>
            <SolanaMark size={16} />
          </View>
        }
        symbol="SOL"
        sub="Solana"
        amount={portfolio.sol !== undefined ? formatCompact(portfolio.sol) : '…'}
      />
      {top.map(({ h, s, value }) => (
        <AssetRow
          key={h.mint}
          onPress={() => router.push(`/token/${h.mint}`)}
          icon={<TokenAvatar uri={h.imageUrl} label={h.symbol ?? h.name} seed={h.mint} size={36} />}
          symbol={(h.symbol ?? h.name ?? shortAddress(h.mint)).slice(0, 12)}
          sub={formatCompact(h.amount)}
          amount={value !== undefined ? `${formatCompact(value)} SOL` : '–'}
          change={s?.changePct}
        />
      ))}
      {portfolio.items.length === 0 && !portfolio.holdings.isPending ? (
        <Text style={styles.empty}>No tokens yet. Buy one from Markets.</Text>
      ) : null}
    </View>
  );
}

function AssetRow({
  icon,
  symbol,
  sub,
  amount,
  change,
  onPress,
}: {
  icon: ReactNode;
  symbol: string;
  sub: string;
  amount: string;
  change?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.assetRow,
        hovered && onPress && { backgroundColor: colors.surface2 },
      ]}
    >
      {icon}
      <View style={styles.flex}>
        <Text style={styles.assetSymbol}>{symbol}</Text>
        <Text style={styles.assetSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={styles.assetRight}>
        <Text mono style={styles.assetAmount} numberOfLines={1}>
          {amount}
        </Text>
        {change !== undefined ? <Change pct={change} size={12} /> : null}
      </View>
    </Pressable>
  );
}

type MoverTab = 'gainers' | 'losers' | 'volume';

/**
 * Today's biggest moves among checked tokens (24h). Red-flagged tokens stay out, so the
 * home screen never puts a likely scam in front of someone. Facts, not picks.
 */
export function TopMovers({ limit = 6 }: { limit?: number }) {
  const [tab, setTab] = useState<MoverTab>('gainers');
  const market = useMarket('trending', 1440);
  const rows = market.tokens
    .filter((t) => t.riskLevel !== 'red')
    .map((t) => ({ t, s: market.statsMap.get(t.mint) }))
    .filter(({ s }) => s?.priceSol !== undefined && s.changePct !== undefined)
    .filter(({ s }) =>
      tab === 'gainers' ? s!.changePct! > 0 : tab === 'losers' ? s!.changePct! < 0 : true,
    )
    .sort((a, b) =>
      tab === 'gainers'
        ? b.s!.changePct! - a.s!.changePct!
        : tab === 'losers'
          ? a.s!.changePct! - b.s!.changePct!
          : b.s!.volumeSol - a.s!.volumeSol,
    )
    .slice(0, limit);
  return (
    <View style={[styles.card, styles.moversCard]}>
      <View style={styles.moversHead}>
        <SectionHead
          title="Top movers · 24h"
          link="Markets"
          onLink={() => router.push('/markets')}
        />
        <Tabs
          label="Top movers"
          options={[
            { value: 'gainers', label: 'Gainers' },
            { value: 'losers', label: 'Losers' },
            { value: 'volume', label: 'Volume' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {market.list.isPending ? (
        <Text style={styles.empty}>Loading markets…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          {tab === 'losers' ? 'Nothing is down today.' : 'No trades recorded today yet.'}
        </Text>
      ) : (
        rows.map(({ t, s }) => <TokenListRow key={t.mint} token={t} stats={s} />)
      )}
    </View>
  );
}

function SectionHead({ title, link, onLink }: { title: string; link: string; onLink: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onLink} accessibilityRole="link" style={styles.link} hitSlop={8}>
        <Text style={styles.linkText}>{link}</Text>
        <ChevronRight size={14} color={colors.muted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(colors.accent, 0.12),
  },
  actionText: { fontSize: 12, fontWeight: '600' },
  card: {
    paddingVertical: space.sm,
    borderRadius: radius.card + 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  moversCard: { paddingBottom: 0 },
  moversHead: { gap: 4, paddingHorizontal: space.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 13, fontWeight: '500', color: colors.muted },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: space.lg,
  },
  solIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetSymbol: { fontSize: 15, fontWeight: '700' },
  assetSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  assetRight: { alignItems: 'flex-end', gap: 2 },
  assetAmount: { fontSize: 15, fontWeight: '600' },
  empty: { fontSize: 13, color: colors.muted, padding: space.lg },
});
