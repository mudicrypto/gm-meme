import type { RiskLevel, TokenStats } from '@sift/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  formatAge,
  formatCompact,
  formatSol,
  formatSolPrice,
  shortAddress,
} from '../../lib/format';
import type { MarketToken } from '../../lib/market';
import { RISK_COLORS, colors } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from './Change';
import { Sparkline } from './Sparkline';

const SHORT_RISK: Record<RiskLevel | 'unknown', string> = {
  green: 'No red flags',
  amber: 'Caution',
  red: 'Risky',
  unknown: 'Not checked',
};

/** A phone list row: token and risk, price and volume, change and sparkline. */
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
  const level = token.riskLevel ?? 'unknown';
  const symbol = (token.symbol ?? token.name ?? shortAddress(token.mint)).slice(0, 12);
  const age = formatAge(token.launchedAt ?? token.firstSeenAt);
  return (
    <Pressable
      onPress={() => router.push(`/token/${token.mint}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        (pressed || hovered) && styles.active,
      ]}
      accessibilityRole="link"
      accessibilityLabel={`${token.name ?? symbol}, ${SHORT_RISK[level]}`}
    >
      <TokenAvatar
        uri={token.imageUrl}
        label={token.name ?? token.symbol}
        seed={token.mint}
        size={40}
      />
      <View style={styles.name}>
        <Text style={styles.symbol} numberOfLines={1}>
          {symbol}
        </Text>
        <View style={styles.subRow}>
          <View style={[styles.dot, { backgroundColor: RISK_COLORS[level].fg }]} />
          <Text style={[styles.sub, { color: RISK_COLORS[level].fg }]} numberOfLines={1}>
            {SHORT_RISK[level]}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {' · '}
            {note ?? (age === 'just now' ? 'new' : age)}
          </Text>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text mono style={styles.price} numberOfLines={1}>
          {stats?.priceSol ? formatSolPrice(stats.priceSol) : '–'}
        </Text>
        <Text mono style={styles.sub} numberOfLines={1}>
          {stats ? `${formatSol(stats.volumeSol)} vol` : ' '}
        </Text>
      </View>
      <View style={styles.changeCol}>
        <Change pct={stats?.changePct} />
        <Sparkline
          points={stats?.sparkline ?? []}
          changePct={stats?.changePct}
          width={64}
          height={22}
        />
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
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  active: { backgroundColor: colors.surface },
  name: { flex: 1, minWidth: 0, gap: 3 },
  symbol: { fontSize: 15, fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  sub: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  priceCol: { width: 96, alignItems: 'flex-end', gap: 3 },
  price: { fontSize: 14, fontWeight: '600' },
  changeCol: { width: 70, alignItems: 'flex-end', gap: 2 },
});
