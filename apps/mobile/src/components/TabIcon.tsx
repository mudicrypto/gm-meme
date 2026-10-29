import { Compass, Star, Users, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, type ColorValue, StyleSheet } from 'react-native';
import { EASE_OUT, NATIVE, useReduceMotion } from '../lib/motion';
import { colors, tint } from '../lib/theme';

const ICONS = { discover: Compass, friends: Users, watchlist: Star, portfolio: Wallet } as const;

/** Tab bar icons: lucide line icons at a 2px stroke, in a soft pill when active. */
export function TabIcon({
  name,
  color,
  focused = false,
}: {
  name: keyof typeof ICONS;
  color: ColorValue;
  focused?: boolean;
}) {
  const Icon = ICONS[name];
  const reduce = useReduceMotion();
  const on = useState(() => new Animated.Value(focused ? 1 : 0))[0];
  useEffect(() => {
    Animated.timing(on, {
      toValue: focused ? 1 : 0,
      duration: reduce ? 0 : 200,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    }).start();
  }, [focused, on, reduce]);
  return (
    <Animated.View style={styles.wrap}>
      <Animated.View
        style={[
          styles.pill,
          {
            opacity: on,
            transform: [{ scaleX: on.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      />
      <Icon size={22} color={color as string} strokeWidth={focused ? 2.3 : 2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 15,
    backgroundColor: tint(colors.accent, 0.16),
  },
});
