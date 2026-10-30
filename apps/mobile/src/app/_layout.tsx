import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Appearance, Platform, useWindowDimensions } from 'react-native';
import { scheme, startupMode } from '../lib/appearance';
import { ModeProvider } from '../lib/mode';
import { TerminalHeader } from '../components/market/TerminalHeader';
import { breakpoints, colors, fonts, isDark } from '../lib/theme';
import { WalletProvider } from '../lib/wallet';
import { PushRegistration } from '../components/PushRegistration';
import { SessionProvider } from '../lib/session';

// The window behind the app (overscroll, keyboard) and the browser bar match the theme.
void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = colors.bg;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  // Tablets and desktops: every screen sits under Sift's own header.
  const wide = useWindowDimensions().width >= breakpoints.tablet;
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );

  // The colours are fixed at startup, so when the browser switches light/dark and Sift
  // follows it, reload to repaint. Phones pick the change up on the next launch.
  useEffect(() => {
    if (Platform.OS !== 'web' || startupMode !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if ((colorScheme === 'dark' ? 'dark' : 'light') !== scheme) window.location.reload();
    });
    return () => sub.remove();
  }, []);

  // A font that fails to load falls back to the system font rather than a blank app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <WalletProvider>
          <SessionProvider>
            <PushRegistration />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: fonts.ui[700], fontSize: 16 },
                contentStyle: { backgroundColor: colors.bg },
                ...(wide ? { header: () => <TerminalHeader /> } : {}),
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="token/[mint]" options={{ headerShown: wide }} />
              <Stack.Screen name="wallet" options={{ headerShown: wide }} />
              <Stack.Screen name="orders" options={{ headerShown: wide }} />
              <Stack.Screen name="leaderboard" options={{ headerShown: wide }} />
              <Stack.Screen name="deposit" options={{ headerShown: wide }} />
              <Stack.Screen name="send" options={{ headerShown: wide }} />
              <Stack.Screen
                name="order/[mint]"
                options={{ headerShown: wide, presentation: wide ? 'card' : 'modal' }}
              />
              <Stack.Screen
                name="trade/[mint]"
                options={{ title: 'Trade', presentation: wide ? 'card' : 'modal' }}
              />
              <Stack.Screen name="phantom-callback/[action]" options={{ title: 'Phantom' }} />
              <Stack.Screen
                name="u/[handle]"
                options={wide ? { headerShown: true } : { title: 'Profile' }}
              />
            </Stack>
            <StatusBar style={isDark ? 'light' : 'dark'} />
          </SessionProvider>
        </WalletProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
}
