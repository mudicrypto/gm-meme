import type { PricePoint } from '@sift/shared';
import { useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { chartGeometry } from '../lib/chart';
import { colors } from '../lib/theme';
import { usePulse } from './Motion';
import { Text } from './Text';

const HEIGHT = 170;
const EMPTY_HEIGHT = 110;
// Room on the right for the latest-price marker.
const PAD = 8;

export function PriceChart({ points }: { points: readonly PricePoint[] }) {
  const [width, setWidth] = useState(0);
  const pulse = usePulse(0, 1100);
  const geometry =
    width > 0
      ? chartGeometry(
          points.map((p) => p.priceSol),
          width,
          HEIGHT,
          PAD,
        )
      : null;
  const rising = points.length > 1 && points[points.length - 1]!.priceSol >= points[0]!.priceSol;
  const color = rising ? colors.up : colors.down;

  return (
    <View
      style={{ height: points.length < 2 ? EMPTY_HEIGHT : HEIGHT }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {points.length < 2 ? (
        <View style={styles.empty}>
          <Svg width={width} height={EMPTY_HEIGHT} style={StyleSheet.absoluteFill}>
            {[0.2, 0.8].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={width}
                y1={EMPTY_HEIGHT * f}
                y2={EMPTY_HEIGHT * f}
                stroke={colors.divider}
                strokeDasharray="3 5"
              />
            ))}
          </Svg>
          <Text style={styles.emptyText}>
            {points.length === 0
              ? 'No trades recorded in this window yet.'
              : 'Only one trade so far.'}
          </Text>
        </View>
      ) : geometry ? (
        <>
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={width}
                y1={HEIGHT * f}
                y2={HEIGHT * f}
                stroke={colors.divider}
                strokeDasharray="3 5"
              />
            ))}
            <Path d={geometry.area} fill="url(#fill)" />
            <Path
              d={geometry.line}
              stroke={color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx={geometry.end.x} cy={geometry.end.y} r={4} fill={color} />
          </Svg>
          {/* A soft breathing halo on the latest price: the chart is live. */}
          <View
            pointerEvents="none"
            style={[styles.haloWrap, { left: geometry.end.x - 10, top: geometry.end.y - 10 }]}
          >
            <Animated.View
              style={[
                styles.halo,
                {
                  backgroundColor: color,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
                },
              ]}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  haloWrap: { position: 'absolute', width: 20, height: 20 },
  halo: { width: 20, height: 20, borderRadius: 10 },
});
