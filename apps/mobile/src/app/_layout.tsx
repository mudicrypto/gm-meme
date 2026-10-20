import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ModeProvider } from '../lib/mode';
import { usePalette } from '../lib/theme';
import { WalletProvider } from '../lib/wallet';

export default function RootLayout() {
  const palette = usePalette();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <WalletProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: palette.card },
              headerTintColor: palette.text,
              contentStyle: { backgroundColor: palette.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="token/[mint]" options={{ title: 'Token' }} />
            <Stack.Screen name="trade/[mint]" options={{ title: 'Trade', presentation: 'modal' }} />
            <Stack.Screen name="phantom-callback/[action]" options={{ title: 'Phantom' }} />
          </Stack>
          <StatusBar style="auto" />
        </WalletProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
}
