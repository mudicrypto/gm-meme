import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../lib/theme';

/**
 * A tiny price line, coloured like the % change beside it (grey when flat). Decorative:
 * the % is the data.
 */
export function Sparkline({
  points,
  changePct,
  width = 72,
  height = 28,
}: {
  points: readonly number[];
  /** The window's change, so line and number never disagree. */
  changePct?: number;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <View style={{ width, height, justifyContent: 'center' }}>
        <View style={{ height: 1, backgroundColor: colors.border }} />
      </View>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => {
      const y = max === min ? height / 2 : height - 2 - ((p - min) / range) * (height - 4);
      return `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const change = changePct ?? points[points.length - 1]! - points[0]!;
  const stroke = change > 0 ? colors.up : change < 0 ? colors.down : colors.muted;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}
