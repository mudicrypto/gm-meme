import { router } from 'expo-router';
import { Bell, ListOrdered, MoreHorizontal, SlidersHorizontal, Trophy } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, space } from '../../lib/theme';
import { Text } from '../Text';

/** Secondary tools beside the table (the header holds the main navigation). */
export function Sidebar({
  onScreener,
  screenerOn,
}: {
  onScreener: () => void;
  screenerOn: boolean;
}) {
  const items = [
    {
      key: 'screener',
      label: 'Screener',
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
    <View style={styles.rail} accessibilityRole="toolbar">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: item.active }}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.item,
              item.active && styles.active,
              hovered && !item.active && styles.hover,
            ]}
          >
            <Icon size={20} color={item.active ? colors.accent : colors.muted} strokeWidth={2} />
            <Text style={[styles.label, item.active && { color: colors.text }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 76,
    paddingVertical: space.md,
    gap: 4,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  item: {
    width: 64,
    minHeight: 60,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  active: { backgroundColor: colors.surface },
  hover: { backgroundColor: colors.surface },
  label: { fontSize: 11, fontWeight: '500', color: colors.muted },
});
