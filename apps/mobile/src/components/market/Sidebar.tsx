import { router } from 'expo-router';
import { Bell, ListOrdered, Settings, SlidersHorizontal, Trophy } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { transition } from '../../lib/motion';
import { colors, space, tint } from '../../lib/theme';
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
      key: 'settings',
      label: 'Wallet & settings',
      icon: Settings,
      onPress: () => router.push('/wallet'),
      active: false,
    },
  ];
  return (
    <View style={styles.rail} accessibilityRole="toolbar" accessibilityLabel="Tools">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <View key={item.key} style={item.key === 'settings' ? styles.bottom : undefined}>
            <HoverTip
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
          </View>
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
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
    zIndex: 20,
  },
  // Settings sits at the foot of the rail, apart from the tools.
  bottom: { marginTop: 'auto' },
  item: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: tint(colors.accent, 0.1) },
  hover: { backgroundColor: colors.surface2 },
  focus: { outlineColor: colors.accent, outlineWidth: 1, outlineStyle: 'solid' } as object,
});
