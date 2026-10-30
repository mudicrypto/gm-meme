import type { TokenStats } from '@sift/shared';
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
import { transition } from '../../lib/motion';
import { colors } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from './Change';
import { RISK_TAGS, RiskTag } from './RiskTag';
import { Sparkline } from './Sparkline';

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
        <Text style={styles.symbol} numberOfLines={1}>
          {symbol}
        </Text>
        <View style={styles.subRow}>
          <RiskTag level={token.riskLevel} />
          <Text style={styles.sub} numberOfLines={1}>
            {'· '}
            {note ?? (age === 'just now' ? 'new' : age)}
          </Text>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text mono style={styles.price} numberOfLines={1}>
          {stats?.priceSol ? formatSolPrice(stats.priceSol) : '–'}
        </Text>
        <Text mono style={styles.vol} numberOfLines={1}>
          {stats ? `${formatSol(stats.volumeSol)} vol` : ' '}
        </Text>
      </View>
      <View style={styles.changeCol}>
        <Change pct={stats?.changePct} size={13} />
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
    gap: 12,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  active: { backgroundColor: colors.surface },
  name: { flex: 1, minWidth: 0, gap: 4 },
  symbol: { fontSize: 15, fontWeight: '500', color: colors.text },
  subRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  sub: { fontSize: 12, color: colors.faint, flexShrink: 1, marginLeft: 4 },
  priceCol: { width: 92, alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 15, fontWeight: '600' },
  vol: { fontSize: 12, color: colors.faint },
  changeCol: { width: 68, alignItems: 'flex-end', gap: 4 },
});
