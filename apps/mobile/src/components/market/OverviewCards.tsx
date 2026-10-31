import type { TokenStats } from '@sift/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatSolPrice, shortAddress } from '../../lib/format';
import { type MarketToken, overviewLists } from '../../lib/market';
import { transition } from '../../lib/motion';
import { colors, radius } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from './Change';

/** Below this, a card's prices would be cut. */
const MIN_CARD = 260;

/**
 * The overview strip above the desktop table, exchange style: Hot, New, Top gainers and
 * Top volume, three tokens each with price and change.
 */
export function OverviewCards({
  tokens,
  stats,
  onOpen,
  width,
}: {
  tokens: readonly MarketToken[];
  stats: ReadonlyMap<string, TokenStats>;
  onOpen: (mint: string) => void;
  /** The space the strip has: it shows as many cards as fit (at least two). */
  width?: number;
}) {
  const fit = width === undefined ? 4 : Math.max(2, Math.floor((width + 16) / (MIN_CARD + 16)));
  const lists = overviewLists(tokens, stats).slice(0, fit);
  if (lists.length === 0) return null;
  return (
    <View style={styles.row}>
      {lists.map((list) => (
        <View key={list.key} style={styles.card}>
          <Text style={styles.title}>{list.label}</Text>
          {list.tokens.map((token) => {
            const s = stats.get(token.mint);
            const symbol = (token.symbol ?? token.name ?? shortAddress(token.mint)).slice(0, 10);
            return (
              <Pressable
                key={token.mint}
                onPress={() => onOpen(token.mint)}
                accessibilityRole="button"
                accessibilityLabel={`${list.label}: ${symbol}`}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.item,
                  hovered && styles.itemHover,
                  transition,
                ]}
              >
                <TokenAvatar
                  uri={token.imageUrl}
                  label={token.symbol ?? token.name}
                  seed={token.mint}
                  size={22}
                />
                <Text style={styles.symbol} numberOfLines={1}>
                  {symbol}
                </Text>
                <Text mono style={styles.price} numberOfLines={1}>
                  {s?.priceSol ? formatSolPrice(s.priceSol) : '–'}
                </Text>
                <View style={styles.change}>
                  <Change pct={s?.changePct} size={13} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16 },
  card: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 8,
    borderRadius: radius.card + 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, marginBottom: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  itemHover: { backgroundColor: colors.surface2 },
  // The symbol gives way; the price is never cut.
  symbol: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600' },
  price: { flexShrink: 0, fontSize: 14, fontWeight: '500', textAlign: 'right' },
  change: { width: 54, alignItems: 'flex-end' },
});
