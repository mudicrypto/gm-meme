import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '../lib/theme';
import { Text } from './Text';

/**
 * The Sift mark: a sieve (three bars narrowing to a point) on a mint tile, the same art as
 * the app icon, drawn as vector so it stays sharp at any size.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  // Proportions match the app icon: bars 15% tall, 13% apart, widths 100/64/28%.
  const unit = size * 0.58;
  const h = unit * 0.15;
  const gap = unit * 0.13;
  const top = (size - (3 * h + 2 * gap)) / 2;
  return (
    <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no">
      <Rect width={size} height={size} rx={size * 0.26} fill={colors.accent} />
      {[1, 0.64, 0.28].map((w, i) => (
        <Rect
          key={w}
          x={(size - unit * w) / 2}
          y={top + i * (h + gap)}
          width={unit * w}
          height={h}
          rx={h / 2}
          fill={colors.onAccent}
        />
      ))}
    </Svg>
  );
}

/** Mark and wordmark, for headers. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Sift">
      <LogoMark size={size} />
      <Text style={[styles.word, { fontSize: Math.round(size * 0.72) }]}>Sift</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontWeight: '700', letterSpacing: -0.4, color: colors.text },
});
