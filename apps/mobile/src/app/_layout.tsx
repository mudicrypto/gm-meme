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
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { ModeProvider } from '../lib/mode';
import { TerminalHeader } from '../components/market/TerminalHeader';
import { breakpoints, colors, fonts } from '../lib/theme';
import { WalletProvider } from '../lib/wallet';
import { PushRegistration } from '../components/PushRegistration';
import { SessionProvider } from '../lib/session';

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
            <StatusBar style="dark" />
          </SessionProvider>
        </WalletProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
}
