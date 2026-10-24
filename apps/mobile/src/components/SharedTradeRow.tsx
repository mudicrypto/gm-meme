import type { SharedTrade } from '@sift/shared';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatAgo } from '../lib/format';
import { describeTrade, tokenLabel } from '../lib/social';
import { colors, radius, tint } from '../lib/theme';
import { PersonAvatar } from './PersonAvatar';
import { RiskBadge } from './RiskBadge';
import { Text } from './Text';
import { TokenAvatar } from './TokenAvatar';

/** One shared trade post: who, buy or sell, and the token with its risk badge. */
export function SharedTradeRow({
  trade,
  showName = true,
}: {
  trade: SharedTrade;
  showName?: boolean;
}) {
  const buy = trade.side === 'buy';
  const sideColor = buy ? colors.up : colors.down;
  return (
    <View style={styles.post}>
      <View style={styles.head}>
        {showName ? <PersonAvatar name={trade.displayName} seed={trade.handle} /> : null}
        <View style={styles.flex}>
          {showName ? (
            <Text style={styles.name} numberOfLines={1}>
              {trade.displayName} <Text style={styles.handle}>@{trade.handle}</Text>
            </Text>
          ) : null}
          <Text style={styles.time}>{formatAgo(trade.at)}</Text>
        </View>
        <View style={[styles.side, { backgroundColor: tint(sideColor, 0.12) }]}>
          <Text style={[styles.sideText, { color: sideColor }]}>{buy ? 'BUY' : 'SELL'}</Text>
        </View>
      </View>
      <Text style={styles.what}>{describeTrade(trade)}</Text>
      <Link href={`/token/${trade.token.mint}`} asChild>
        <Pressable style={StyleSheet.flatten(styles.token)}>
          <TokenAvatar
            uri={trade.token.imageUrl}
            label={trade.token.name ?? trade.token.symbol}
            seed={trade.token.mint}
            size={36}
          />
          <View style={styles.flex}>
            <Text style={styles.tokenName} numberOfLines={1}>
              {trade.token.name ?? tokenLabel(trade.token)}
            </Text>
            {trade.token.symbol ? (
              <Text style={styles.handle} numberOfLines={1}>
                {trade.token.symbol}
              </Text>
            ) : null}
          </View>
          <RiskBadge level={trade.token.riskLevel} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700' },
  handle: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  time: { fontSize: 12, color: colors.faint },
  side: { height: 24, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' },
  sideText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  what: { fontSize: 14, color: colors.text2 },
  token: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.input,
    backgroundColor: colors.surface2,
  },
  tokenName: { fontSize: 14, fontWeight: '700' },
});
