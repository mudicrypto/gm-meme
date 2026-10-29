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
import { ModeProvider } from '../lib/mode';
import { colors, fonts } from '../lib/theme';
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
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="token/[mint]" options={{ headerShown: false }} />
              <Stack.Screen name="wallet" options={{ headerShown: false }} />
              <Stack.Screen name="orders" options={{ headerShown: false }} />
              <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
              <Stack.Screen
                name="order/[mint]"
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="trade/[mint]"
                options={{ title: 'Trade', presentation: 'modal' }}
              />
              <Stack.Screen name="phantom-callback/[action]" options={{ title: 'Phantom' }} />
              <Stack.Screen name="u/[handle]" options={{ title: 'Profile' }} />
            </Stack>
            <StatusBar style="light" />
          </SessionProvider>
        </WalletProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
}
