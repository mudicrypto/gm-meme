import { router } from 'expo-router';
import { Bell, ListOrdered, MoreHorizontal, SlidersHorizontal, Trophy } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { transition } from '../../lib/motion';
import { colors, space } from '../../lib/theme';
import { HoverTip } from '../HoverTip';

/** Secondary tools beside the table (the header holds the main navigation). */
export function Sidebar({
  onScreener,
  screenerOn,
}: {
  onScreener: () => void;
  /** The filter drawer is open. */
  screenerOn: boolean;
}) {
  const items = [
    {
      key: 'screener',
      label: 'Filters',
      icon: SlidersHorizontal,
      onPress: onScreener,
      active: screenerOn,
    },
    {
      key: 'orders',
      label: 'Orders',
      icon: ListOrdered,
      onPress: () => router.push('/orders'),
      active: false,
    },
    {
      key: 'alerts',
      label: 'Alerts',
      icon: Bell,
      onPress: () => router.navigate('/watchlist'),
      active: false,
    },
    {
      key: 'traders',
      label: 'Traders',
      icon: Trophy,
      onPress: () => router.push('/leaderboard'),
      active: false,
    },
    {
      key: 'more',
      label: 'More',
      icon: MoreHorizontal,
      onPress: () => router.push('/wallet'),
      active: false,
    },
  ];
  return (
    <View style={styles.rail} accessibilityRole="toolbar" accessibilityLabel="Tools">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <HoverTip
            key={item.key}
            tip={item.label}
            side="right"
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: item.active }}
            style={({ hovered, focused }) => [
              styles.item,
              item.active && styles.active,
              (hovered || focused) && !item.active && styles.hover,
              focused && styles.focus,
              transition,
            ]}
          >
            <Icon size={20} color={item.active ? colors.accent : colors.muted} strokeWidth={2} />
          </HoverTip>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 64,
    paddingVertical: space.md,
    gap: space.sm,
    alignItems: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    zIndex: 20,
  },
  item: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: colors.surface2 },
  hover: { backgroundColor: colors.surface },
  focus: { outlineColor: colors.accent, outlineWidth: 1, outlineStyle: 'solid' } as object,
});
