import { type ReactNode, useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DURATION, EASE_OUT, NATIVE, useReduceMotion } from '../lib/motion';

/**
 * A pressable that sinks slightly while pressed (scale and dim), so every tap feels
 * answered. Pass one flat style object (it may sit inside <Link asChild>).
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const reduce = useReduceMotion();
  const pressed = useState(() => new Animated.Value(0))[0];
  const to = (value: number) =>
    Animated.timing(pressed, {
      toValue: value,
      duration: value ? 90 : 160,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    }).start();
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        if (!reduce) to(1);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(0);
        props.onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [
              { scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] }) },
            ],
            opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }),
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Fades and rises into place on mount; `index` staggers list items (capped). */
export function FadeIn({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const progress = useState(() => new Animated.Value(reduce ? 1 : 0))[0];
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION + 60,
      delay: Math.min(index, 8) * 40,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    }).start();
  }, [progress, index]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A soft breathing opacity, for skeletons and "live" dots. */
export function usePulse(min = 0.45, ms = 900): Animated.Value {
  const reduce = useReduceMotion();
  const value = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: min, duration: ms, useNativeDriver: NATIVE }),
        Animated.timing(value, { toValue: 1, duration: ms, useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, min, ms, reduce]);
  return value;
}
