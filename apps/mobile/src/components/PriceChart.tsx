import type { PricePoint } from '@sift/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Svg, { Path } from 'react-native-svg';
import { chartGeometry } from '../lib/chart';
import { usePalette } from '../lib/theme';

const HEIGHT = 160;

export function PriceChart({ points }: { points: readonly PricePoint[] }) {
  const palette = usePalette();
  const [width, setWidth] = useState(0);
  const geometry =
    width > 0
      ? chartGeometry(
          points.map((p) => p.priceSol),
          width,
          HEIGHT,
        )
      : null;
  const rising = points.length > 1 && points[points.length - 1]!.priceSol >= points[0]!.priceSol;
  const color = rising ? palette.up : palette.down;

  return (
    <View style={{ height: HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {points.length < 2 ? (
        <View style={styles.empty}>
          <Text style={{ color: palette.muted }}>
            {points.length === 0
              ? 'No trades recorded in this window yet.'
              : 'Only one trade so far.'}
          </Text>
        </View>
      ) : geometry ? (
        <Svg width={width} height={HEIGHT}>
          <Path d={geometry.area} fill={color} opacity={0.12} />
          <Path d={geometry.line} stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
