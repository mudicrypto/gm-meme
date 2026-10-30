import type { TokenSummary, TrendingToken } from '@sift/shared';
import { Link } from 'expo-router';
import { Flame } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { formatAge, formatCompact, formatSol, shortAddress } from '../lib/format';
import { colors, radius, tint } from '../lib/theme';
import { PressableScale } from './Motion';
import { RiskBadge } from './RiskBadge';
import { Text } from './Text';
import { TokenAvatar } from './TokenAvatar';

/**
 * The most-traded token right now, as a big card at the top of Discover. A fact about
 * activity, not a pick: its risk badge sits right next to the name.
 */
export function FeaturedToken({ token }: { token: TokenSummary | TrendingToken }) {
  const trending = 'uniqueTraders' in token ? token : undefined;
  const name = (token.name ?? token.symbol ?? shortAddress(token.mint)).slice(0, 32);
  const age = formatAge(token.launchedAt ?? token.firstSeenAt);
  const stats: Array<[string, string]> = [
    ...(trending
      ? ([['Volume 1h', formatSol(trending.volumeSol)]] as Array<[string, string]>)
      : []),
    ...(trending ? ([['Traders', String(trending.uniqueTraders)]] as Array<[string, string]>) : []),
    ...(token.marketCapUsd !== undefined
      ? ([['Market cap', `$${formatCompact(token.marketCapUsd)}`]] as Array<[string, string]>)
      : []),
    ['Age', age === 'just now' ? 'New' : age],
  ];
  return (
    <Link href={`/token/${token.mint}`} asChild>
      <PressableScale style={StyleSheet.flatten(styles.card)} scaleTo={0.98}>
        <View style={styles.eyebrow}>
          <Flame size={14} color={colors.caution} strokeWidth={2.4} />
          <Text style={styles.eyebrowText}>Most traded now</Text>
        </View>
        <View style={styles.top}>
          <TokenAvatar
            uri={token.imageUrl}
            label={token.symbol ?? token.name}
            seed={token.mint}
            size={72}
          />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {token.symbol ? (
              <View style={styles.ticker}>
                <Text mono style={styles.tickerText}>
                  ${token.symbol.slice(0, 12)}
                </Text>
              </View>
            ) : null}
            <View style={styles.badge}>
              <RiskBadge level={token.riskLevel} />
            </View>
          </View>
        </View>
        <View style={styles.stats}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statLabel}>{label}</Text>
              <Text mono style={styles.statValue} numberOfLines={1}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    gap: 14,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: tint(colors.accent, 0.28),
    shadowColor: colors.accent,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.caution,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1, minWidth: 0, gap: 6 },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  ticker: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.surface2,
  },
  tickerText: { fontSize: 12, fontWeight: '600', color: colors.text2 },
  badge: { marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.bg,
    gap: 3,
  },
  statLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 13, fontWeight: '600' },
});
