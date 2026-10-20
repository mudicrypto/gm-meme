import type { SharedTrade } from '@sift/shared';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAgo } from '../lib/format';
import { describeTrade, tokenLabel } from '../lib/social';
import { usePalette } from '../lib/theme';
import { RiskBadge } from './RiskBadge';
import { TokenAvatar } from './TokenAvatar';

/** One shared trade: who, what, when. Tapping opens the token (risk score first). */
export function SharedTradeRow({
  trade,
  showName = true,
}: {
  trade: SharedTrade;
  showName?: boolean;
}) {
  const palette = usePalette();
  return (
    <Link href={`/token/${trade.token.mint}`} asChild>
      <Pressable
        style={StyleSheet.flatten([
          styles.row,
          { backgroundColor: palette.card, borderColor: palette.border },
        ])}
      >
        <TokenAvatar uri={trade.token.imageUrl} label={tokenLabel(trade.token)} size={36} />
        <View style={styles.flex}>
          <Text style={{ color: palette.text }} numberOfLines={2}>
            {showName ? (
              <Text style={styles.bold}>
                {trade.displayName}{' '}
                <Text style={{ color: palette.muted }}>@{trade.handle}</Text>{' '}
              </Text>
            ) : null}
            <Text style={{ color: trade.side === 'buy' ? palette.up : palette.down }}>
              {describeTrade(trade)}
            </Text>
          </Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>{formatAgo(trade.at)}</Text>
        </View>
        <RiskBadge level={trade.token.riskLevel} />
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
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: '700' },
});
