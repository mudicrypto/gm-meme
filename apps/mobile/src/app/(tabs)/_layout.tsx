import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon } from '../../components/TabIcon';
import { colors, fonts, tint } from '../../lib/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        // Each screen draws its own header (components/Screen.tsx).
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        // A floating bar: rounded, lifted off the bottom edge, content scrolls beneath it.
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 12),
          height: 72,
          paddingTop: 6,
          paddingBottom: 6,
          borderRadius: 24,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderTopColor: colors.borderStrong,
          backgroundColor: tint(colors.tabBar, 0.96),
          shadowColor: colors.shadow,
          shadowOpacity: 0.45,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
        },
        tabBarLabelStyle: { fontFamily: fonts.ui[700], fontSize: 11, lineHeight: 14, marginTop: 2 },
        tabBarItemStyle: { height: 58, paddingVertical: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="discover" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="friends" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: 'Watchlist',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="watchlist" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="portfolio" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
