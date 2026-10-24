import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
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
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
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
