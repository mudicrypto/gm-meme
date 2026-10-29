import type { RiskLevel, TokenSummary, TrendingToken } from '@sift/shared';
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { formatAge, formatCompact, formatSol, shortAddress } from '../lib/format';
import { useMode } from '../lib/mode';
import { colors, radius } from '../lib/theme';
import { PressableScale } from './Motion';
import { RiskBadge } from './RiskBadge';
import { Text } from './Text';
import { TokenAvatar } from './TokenAvatar';

// The list API carries the level, not the reasons: the card says what the level means;
// the token screen lists the checks.
const LEVEL_LINE: Record<RiskLevel | 'unknown', string> = {
  green: 'No red flags in Sift’s checks',
  amber: 'Some checks need a look',
  red: 'Red flags found: check before trading',
  unknown: 'Checking for scams…',
};

/** Token card: avatar, name, age and activity, then the risk badge and what it means. */
export function TokenRow({ token }: { token: TokenSummary | TrendingToken }) {
  const { mode } = useMode();
  const trending = 'uniqueTraders' in token ? token : undefined;
  const title = token.name ?? token.symbol ?? shortAddress(token.mint);
  const age = formatAge(token.launchedAt ?? token.firstSeenAt);

  return (
    <Link href={`/token/${token.mint}`} asChild>
      {/* One flat style object: on web, Link's asChild puts it on an <a>, which can't take
          style arrays or functions. */}
      <PressableScale style={StyleSheet.flatten(styles.card)} scaleTo={0.98}>
        <View style={styles.top}>
          <TokenAvatar uri={token.imageUrl} label={token.name ?? token.symbol} seed={token.mint} />
          <View style={styles.middle}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {title}
              </Text>
              {token.symbol ? (
                <Text style={styles.symbol} numberOfLines={1}>
                  {token.symbol}
                </Text>
              ) : null}
            </View>
            <Text mono style={styles.meta} numberOfLines={1}>
              {[
                age === 'just now' ? 'just launched' : `${age} old`,
                token.marketCapUsd !== undefined
                  ? `MC $${formatCompact(token.marketCapUsd)}`
                  : undefined,
                trending ? `${trending.uniqueTraders} traders` : undefined,
                mode === 'pro' ? shortAddress(token.mint) : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {trending ? (
            <View style={styles.right}>
              <Text mono style={styles.value}>
                {formatSol(trending.volumeSol)}
              </Text>
              <Text style={styles.valueLabel}>volume</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottom}>
          <RiskBadge level={token.riskLevel} />
          <Text style={styles.why} numberOfLines={1}>
            {LEVEL_LINE[token.riskLevel ?? 'unknown']}
          </Text>
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  middle: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  symbol: { fontSize: 12, color: colors.muted },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  value: { fontSize: 15, fontWeight: '600' },
  valueLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  why: { flex: 1, fontSize: 12, color: colors.muted },
});
