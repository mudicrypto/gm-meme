import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { formatChange } from '../../lib/market';
import { colors } from '../../lib/theme';
import { Text } from '../Text';

/** A % change with its sign and an arrow, so it never relies on colour alone. */
export function Change({
  pct,
  size = 13,
  arrow = false,
}: {
  pct: number | undefined;
  size?: number;
  arrow?: boolean;
}) {
  const known = pct !== undefined && Number.isFinite(pct);
  const up = known && pct >= 0;
  const color = !known ? colors.muted : up ? colors.up : colors.down;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
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

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 2 } });
