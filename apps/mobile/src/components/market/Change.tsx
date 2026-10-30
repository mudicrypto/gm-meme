import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { formatChange } from '../../lib/market';
import { colors, dark } from '../../lib/theme';
import { Text, useInk } from '../Text';

/** A % change with its sign and an arrow, so it never relies on colour alone. */
export function Change({
  pct,
  size = 13,
  arrow = false,
  badge = false,
}: {
  pct: number | undefined;
  size?: number;
  arrow?: boolean;
  /** A filled green/red box, for market lists. */
  badge?: boolean;
}) {
  const known = pct !== undefined && Number.isFinite(pct);
  const up = known && pct >= 0;
  // Brighter tones on the dark trade surfaces.
  const pal = useInk() === dark.text ? dark : colors;
  const color = !known ? pal.muted : up ? pal.up : pal.down;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  if (badge)
    return (
      <View
        style={[
          styles.badge,
          { minWidth: Math.round(size * 5.2), height: Math.round(size * 2.1) },
          { backgroundColor: !known ? pal.surface2 : up ? colors.upFill : colors.downFill },
        ]}
        accessibilityLabel={known ? `${up ? 'Up' : 'Down'} ${formatChange(pct)}` : 'No change data'}
      >
        <Text
          mono
          numberOfLines={1}
          style={{ fontSize: size, fontWeight: '600', color: known ? colors.onFill : pal.muted }}
        >
          {formatChange(pct)}
        </Text>
      </View>
    );
  return (
    <View
      style={styles.row}
      accessibilityLabel={known ? `${up ? 'Up' : 'Down'} ${formatChange(pct)}` : 'No change data'}
    >
      {arrow && known ? <Icon size={size + 1} color={color} strokeWidth={2.4} /> : null}
      <Text mono style={{ fontSize: size, fontWeight: '600', color }}>
        {formatChange(pct)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badge: {
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
