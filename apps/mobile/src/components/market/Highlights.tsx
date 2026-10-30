import type { TokenStats } from '@sift/shared';
import { Activity, Flame, Sparkles, TrendingUp } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatSolPrice, shortAddress } from '../../lib/format';
import { type HighlightKey, type MarketToken, pickHighlights } from '../../lib/market';
import { transition } from '../../lib/motion';
import { colors, radius, space } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from './Change';
import { Sparkline } from './Sparkline';

const ICONS: Record<HighlightKey, typeof Flame> = {
  gainer: TrendingUp,
  volume: Flame,
  newest: Sparkles,
  trades: Activity,
};

/**
 * Four cards above the list: top gainer, most traded, newest and most trades in the
 * window. A horizontal strip on phones, a row of equal cards on wider screens.
 */
export function Highlights({
  tokens,
  stats,
  onOpen,
  row = false,
}: {
  tokens: readonly MarketToken[];
  stats: ReadonlyMap<string, TokenStats>;
  onOpen: (mint: string) => void;
  /** Equal-width cards in a row (desktop) instead of a scrolling strip. */
  row?: boolean;
}) {
  const picks = pickHighlights(tokens, stats);
  if (picks.length === 0) return null;
  const cards = picks.map(({ key, label, token }) => {
    const s = stats.get(token.mint);
    const Icon = ICONS[key];
    const symbol = (token.symbol ?? token.name ?? shortAddress(token.mint)).slice(0, 10);
    return (
      <Pressable
        key={key}
        onPress={() => onOpen(token.mint)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${symbol}`}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.card,
          row ? styles.cardRow : styles.cardStrip,
          (pressed || hovered) && { borderColor: colors.borderStrong },
          transition,
        ]}
      >
        <View style={styles.labelRow}>
          <Icon size={14} color={colors.accent} strokeWidth={2.2} />
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={styles.tokenRow}>
          <TokenAvatar
            uri={token.imageUrl}
            label={token.symbol ?? token.name}
            seed={token.mint}
            size={28}
          />
          <Text style={styles.symbol} numberOfLines={1}>
            {symbol}
          </Text>
        </View>
        <View style={styles.bottom}>
          <View style={styles.flex}>
            <Text mono style={styles.price} numberOfLines={1}>
              {s?.priceSol ? formatSolPrice(s.priceSol) : '–'}
            </Text>
            <Change pct={s?.changePct} size={12} />
          </View>
          <Sparkline points={s?.sparkline ?? []} changePct={s?.changePct} width={52} height={28} />
        </View>
      </Pressable>
    );
  });
  if (row) return <View style={styles.row}>{cards}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      style={styles.stripWrap}
    >
      {cards}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', gap: space.md },
  stripWrap: { marginHorizontal: -space.screen },
  strip: { gap: 10, paddingHorizontal: space.screen },
  card: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardStrip: { width: 184 },
  cardRow: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  symbol: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  price: { fontSize: 14, fontWeight: '600' },
});
