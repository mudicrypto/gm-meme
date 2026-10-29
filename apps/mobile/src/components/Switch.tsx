import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { EASE_OUT, haptic, useReduceMotion } from '../lib/motion';
import { colors } from '../lib/theme';

/** 48×28 switch, accent when on; the knob slides across. */
export function Switch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
}) {
  const reduce = useReduceMotion();
  const on = useState(() => new Animated.Value(value ? 1 : 0))[0];
  useEffect(() => {
    // Colour can't use the native driver, so the whole switch animates in JS (it's tiny).
    Animated.timing(on, {
      toValue: value ? 1 : 0,
      duration: reduce ? 0 : 180,
      easing: EASE_OUT,
      useNativeDriver: false,
    }).start();
  }, [value, on, reduce]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        haptic.select();
        onValueChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: on.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.track, colors.accent],
            }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: on.interpolate({
                inputRange: [0, 1],
                outputRange: [colors.muted, colors.onAccent],
              }),
              transform: [
                { translateX: on.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
              ],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11 },
});
