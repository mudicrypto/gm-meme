import { useEffect, useState } from 'react';
import { Animated, type StyleProp, StyleSheet, type TextStyle } from 'react-native';
import { useReduceMotion } from '../lib/motion';
import { colors, fonts } from '../lib/theme';

/**
 * Text for a live number: when `value` rises or falls, it flashes green or red and fades
 * back over 600 ms. Mono font, as numbers are everywhere in Sift.
 */
export function FlashText({
  value,
  children,
  style,
}: {
  /** The number being shown, to tell up from down. */
  value: number | undefined;
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  const reduce = useReduceMotion();
  const [flash] = useState(() => new Animated.Value(0));
  const [seen, setSeen] = useState(value);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [changes, setChanges] = useState(0);

  // Compare with the last value during render (React's pattern for derived state).
  if (value !== seen) {
    setSeen(value);
    if (seen !== undefined && value !== undefined) {
      setDirection(value > seen ? 'up' : 'down');
      setChanges((n) => n + 1);
    }
  }

  useEffect(() => {
    if (reduce || changes === 0) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 600, useNativeDriver: false }).start();
  }, [changes, flash, reduce]);

  const base = StyleSheet.flatten(style) ?? {};
  return (
    <Animated.Text
      style={[
        { fontFamily: fonts.ui[600], fontVariant: ['tabular-nums'], color: colors.text },
        style,
        { fontWeight: undefined },
        {
          color: flash.interpolate({
            inputRange: [0, 1],
            outputRange: [
              (base.color as string | undefined) ?? colors.text,
              direction === 'up' ? colors.up : colors.down,
            ],
          }),
        },
      ]}
    >
      {children}
    </Animated.Text>
  );
}
