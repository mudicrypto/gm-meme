import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalHeader } from '../../components/market/TerminalHeader';
import { TabIcon } from '../../components/TabIcon';
import { breakpoints, colors, fonts } from '../../lib/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Tablets and desktops navigate from the terminal header instead of a tab bar.
  const wide = useWindowDimensions().width >= breakpoints.tablet;
  return (
    <Tabs
      screenOptions={{
        // Phones: each screen draws its own header (components/Screen.tsx). Wide screens
        // get the terminal header; Discover draws its own, with the search wired in.
        headerShown: wide,
        header: () => <TerminalHeader />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          display: wide ? 'none' : 'flex',
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.ui[600], fontSize: 11, lineHeight: 14, marginTop: 2 },
        tabBarItemStyle: { height: 58, paddingVertical: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          headerShown: false,
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
