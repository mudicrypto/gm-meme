import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { EASE_OUT, haptic, useReduceMotion } from '../lib/motion';
import { colors, radius } from '../lib/theme';
import { Text } from './Text';

/** A segmented control: a surface track with a raised pill that slides to the selection. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  const reduce = useReduceMotion();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const x = useState(() => new Animated.Value(0))[0];
  const width = useState(() => new Animated.Value(0))[0];
  const target = layouts[value];
  const placed = useRef(false);

  useEffect(() => {
    if (!target) return;
    // Jump into place the first time, slide after that.
    const duration = placed.current && !reduce ? 220 : 0;
    placed.current = true;
    Animated.parallel([
      Animated.timing(x, { toValue: target.x, duration, easing: EASE_OUT, useNativeDriver: false }),
      Animated.timing(width, {
        toValue: target.width,
        duration,
        easing: EASE_OUT,
        useNativeDriver: false,
      }),
    ]).start();
  }, [target, x, width, reduce]);

  return (
    <View style={[styles.row, compact && styles.compactRow]} accessibilityRole="tablist">
      {target ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, compact && styles.compactIndicator, { left: x, width }]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!selected) haptic.select();
              onChange(option.value);
            }}
            onLayout={(e) => {
              const { x: ox, width: ow } = e.nativeEvent.layout;
              setLayouts((prev) =>
                prev[option.value]?.x === ox && prev[option.value]?.width === ow
                  ? prev
                  : { ...prev, [option.value]: { x: ox, width: ow } },
              );
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.option, compact ? styles.compact : styles.fill]}
          >
            <Text
              style={[
                styles.label,
                compact && styles.compactLabel,
                { color: selected ? colors.text : colors.muted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.input,
    padding: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  compactRow: { borderRadius: 12, padding: 3 },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  compactIndicator: { top: 3, bottom: 3, borderRadius: 9 },
  option: { paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  fill: { flex: 1 },
  // Sized by its label: `flex: 0` collapses to zero width on web.
  compact: {
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  label: { fontSize: 14, fontWeight: '700' },
  compactLabel: { fontSize: 12 },
});
