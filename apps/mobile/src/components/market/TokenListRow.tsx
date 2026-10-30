import type { TokenStats } from '@sift/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatAge, formatCompact, formatSolPrice, shortAddress } from '../../lib/format';
import type { MarketToken } from '../../lib/market';
import { transition } from '../../lib/motion';
import { colors } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from './Change';
import { RISK_TAGS, RiskTag } from './RiskTag';

/** A phone list row, exchange style: token and volume, price and market cap, change badge. */
export function TokenListRow({
  token,
  stats,
  note,
}: {
  token: MarketToken;
  stats: TokenStats | undefined;
  /** Replaces the age in the second line (e.g. "3 top traders bought"). */
  note?: string;
}) {
  const symbol = (token.symbol ?? token.name ?? shortAddress(token.mint)).slice(0, 12);
  const age = formatAge(token.launchedAt ?? token.firstSeenAt);
  return (
    <Pressable
      onPress={() => router.push(`/token/${token.mint}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        (pressed || hovered) && styles.active,
        transition,
      ]}
      accessibilityRole="link"
      accessibilityLabel={`${token.name ?? symbol}, ${RISK_TAGS[token.riskLevel ?? 'unknown']}`}
    >
      <TokenAvatar
        uri={token.imageUrl}
        label={token.symbol ?? token.name}
        seed={token.mint}
        size={40}
      />
      <View style={styles.name}>
        <View style={styles.subRow}>
          <Text style={styles.symbol} numberOfLines={1}>
            {symbol}
          </Text>
          {/* The risk check stays visible: a shield whose shape says the level. */}
          <RiskTag level={token.riskLevel} size={12} iconOnly />
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {note ?? (stats ? `Vol ${formatCompact(stats.volumeSol)} SOL` : (token.name ?? age))}
        </Text>
      </View>
      <View style={styles.priceCol}>
        <Text mono style={styles.price} numberOfLines={1}>
          {stats?.priceSol ? formatSolPrice(stats.priceSol) : '–'}
        </Text>
        <Text mono style={styles.sub} numberOfLines={1}>
          {stats?.marketCapSol
            ? `MC ${formatCompact(stats.marketCapSol)}`
            : age === 'just now'
              ? 'New'
              : age}
        </Text>
      </View>
      <View style={styles.changeCol}>
        <Change pct={stats?.changePct} size={14} badge />
      </View>
    </Pressable>
  );
}

export function marketCapText(stats: TokenStats | undefined): string {
  return stats?.marketCapSol ? `${formatCompact(stats.marketCapSol)} SOL` : '–';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 68,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  active: { backgroundColor: colors.surface2 },
  name: { flex: 1, minWidth: 0, gap: 4 },
  symbol: { fontSize: 16, fontWeight: '700', color: colors.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  sub: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  priceCol: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  price: { fontSize: 15, fontWeight: '600' },
  changeCol: { width: 82, alignItems: 'flex-end' },
});
