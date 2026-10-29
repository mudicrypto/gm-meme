import type { PricePoint } from '@sift/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { formatSolPrice } from '../../lib/format';
import { colors, fonts } from '../../lib/theme';
import { Text } from '../Text';

const AXIS = 56;
const X_AXIS = 18;

/**
 * Candles (open, high, low, close per time bucket) with volume bars underneath, a price
 * axis on the right and times along the bottom. Built from trades Sift recorded.
 */
export function CandleChart({
  points,
  height = 220,
  windowMinutes,
}: {
  points: readonly PricePoint[];
  height?: number;
  windowMinutes: number;
}) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - AXIS);
  const volumeH = Math.round(height * 0.18);
  const priceH = height - volumeH - X_AXIS - 6;

  if (points.length < 2) {
    return (
      <View
        style={[styles.empty, { height }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <Text style={styles.emptyText}>
          {points.length === 0
            ? 'No trades recorded in this window yet.'
            : 'Only one trade so far: not enough for a chart.'}
        </Text>
      </View>
    );
  }

  const lows = points.map((p) => p.low);
  const highs = points.map((p) => p.high);
  let min = Math.min(...lows);
  let max = Math.max(...highs);
  if (max === min) {
    max *= 1.01;
    min *= 0.99;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const y = (price: number) => ((max - price) / (max - min)) * priceH;
  const maxVolume = Math.max(...points.map((p) => p.volumeSol), 1e-12);
  const step = plotW / points.length;
  const body = Math.max(1.5, Math.min(10, step * 0.62));
  const levels = [0, 1, 2, 3].map((i) => max - ((max - min) * (i + 0.5)) / 4);
  const timeLabels = [0, Math.floor(points.length / 2), points.length - 1].map((i) => ({
    x: i * step + step / 2,
    label: timeLabel(points[i]!.t, windowMinutes),
  }));
  const last = points[points.length - 1]!;

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={`Price chart, ${points.length} intervals, last price ${formatSolPrice(last.priceSol)} SOL`}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {levels.map((level) => (
            <Line
              key={level}
              x1={0}
              x2={plotW}
              y1={y(level)}
              y2={y(level)}
              stroke={colors.divider}
              strokeWidth={1}
            />
          ))}
          {points.map((p, i) => {
            const up = p.priceSol >= p.open;
            const color = up ? colors.up : colors.down;
            const cx = i * step + step / 2;
            const top = y(Math.max(p.open, p.priceSol));
            const bottom = y(Math.min(p.open, p.priceSol));
            const vh = (p.volumeSol / maxVolume) * (volumeH - 2);
            return (
              <G key={p.t}>
                <Line x1={cx} x2={cx} y1={y(p.high)} y2={y(p.low)} stroke={color} strokeWidth={1} />
                <Rect
                  x={cx - body / 2}
                  y={top}
                  width={body}
                  height={Math.max(1, bottom - top)}
                  fill={color}
                  rx={1}
                />
                <Rect
                  x={cx - body / 2}
                  y={priceH + 6 + (volumeH - vh)}
                  width={body}
                  height={Math.max(1, vh)}
                  fill={color}
                  opacity={0.35}
                />
              </G>
            );
          })}
          {/* The last price, marked on the axis. */}
          <Line
            x1={0}
            x2={plotW}
            y1={y(last.priceSol)}
            y2={y(last.priceSol)}
            stroke={colors.muted}
            strokeDasharray="2 4"
            strokeWidth={1}
          />
          {levels.map((level) => (
            <SvgText
              key={`l${level}`}
              x={width - 4}
              y={y(level) + 4}
              fontSize={10}
              fontFamily={fonts.ui[500]}
              fill={colors.faint}
              textAnchor="end"
            >
              {formatSolPrice(level)}
            </SvgText>
          ))}
          {timeLabels.map((t) => (
            <SvgText
              key={`t${t.x}`}
              x={Math.min(Math.max(t.x, 18), plotW - 18)}
              y={height - 4}
              fontSize={10}
              fontFamily={fonts.ui[500]}
              fill={colors.faint}
              textAnchor="middle"
            >
              {t.label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

function timeLabel(iso: string, windowMinutes: number): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return windowMinutes > 360
    ? `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hm}`
    : hm;
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  emptyText: { fontSize: 13, color: colors.muted },
});
