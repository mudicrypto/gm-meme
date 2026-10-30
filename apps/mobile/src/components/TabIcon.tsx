import { CandlestickChart, House, PieChart, Star, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, type ColorValue, StyleSheet, View } from 'react-native';
import { EASE_OUT, NATIVE, useReduceMotion } from '../lib/motion';
import { colors } from '../lib/theme';

const ICONS = {
  home: House,
  markets: CandlestickChart,
  friends: Users,
  watchlist: Star,
  portfolio: PieChart,
} as const;

/** Tab bar icons: line icons; the active one sits white on a filled green circle. */
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
            transform: [{ scale: on.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      />
      {/* Above the circle: on the web an absolutely placed view paints over its siblings. */}
      <View style={styles.icon}>
        <Icon
          size={focused ? 18 : 22}
          color={focused ? colors.onAccent : (color as string)}
          strokeWidth={2}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  icon: { zIndex: 1 },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
});
