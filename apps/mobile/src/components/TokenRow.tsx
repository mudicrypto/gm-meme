import type { TokenSummary, TrendingToken } from '@sift/shared';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAge, formatSol, shortAddress } from '../lib/format';
import { useMode } from '../lib/mode';
import { usePalette } from '../lib/theme';
import { RiskBadge } from './RiskBadge';
import { TokenAvatar } from './TokenAvatar';

export function TokenRow({ token }: { token: TokenSummary | TrendingToken }) {
  const palette = usePalette();
  const { mode } = useMode();
  const trending = 'uniqueTraders' in token ? token : undefined;
  const title = token.name ?? token.symbol ?? shortAddress(token.mint);

  return (
    <Link href={`/token/${token.mint}`} asChild>
      {/* One flat style object: on web, Link's asChild puts it on an <a>, which can't take
          style arrays or functions. */}
      <Pressable
        style={StyleSheet.flatten([
          styles.row,
          { backgroundColor: palette.card, borderColor: palette.border },
        ])}
      >
        <TokenAvatar uri={token.imageUrl} label={token.symbol ?? token.name} />
        <View style={styles.middle}>
          <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.meta, { color: palette.muted }]} numberOfLines={1}>
            {[
              token.symbol ? `$${token.symbol}` : undefined,
              formatAge(token.launchedAt ?? token.firstSeenAt),
              trending ? `${trending.uniqueTraders} traders` : undefined,
              mode === 'pro' && trending ? formatSol(trending.volumeSol) : undefined,
              mode === 'pro' ? shortAddress(token.mint) : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <RiskBadge level={token.riskLevel} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  middle: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13 },
});
