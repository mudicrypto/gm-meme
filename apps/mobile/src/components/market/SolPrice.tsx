import { StyleSheet, View } from 'react-native';
import { formatSolPrice } from '../../lib/format';
import { colors } from '../../lib/theme';
import { Text } from '../Text';

/** A price in SOL with the number emphasised and the unit smaller. */
export function SolPrice({
  price,
  size = 32,
  empty = 'No trades yet',
}: {
  price: number | undefined;
  size?: number;
  /** Shown when there's no price. */
  empty?: string;
}) {
  if (price === undefined || !Number.isFinite(price))
    return <Text style={[styles.empty, { fontSize: Math.round(size * 0.6) }]}>{empty}</Text>;
  return (
    <View style={styles.row} accessibilityLabel={`${formatSolPrice(price)} SOL`}>
      <Text
        mono
        style={[styles.value, { fontSize: size, letterSpacing: -size * 0.02 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatSolPrice(price)}
      </Text>
      <Text style={[styles.unit, { fontSize: Math.max(12, Math.round(size * 0.45)) }]}>SOL</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  value: { fontWeight: '700', flexShrink: 1 },
  unit: { fontWeight: '600', color: colors.muted },
  empty: { fontWeight: '600', color: colors.muted },
});
