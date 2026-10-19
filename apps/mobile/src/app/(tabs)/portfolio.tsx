import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSolanaAddress } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from '../../components/Card';
import { RiskBadge } from '../../components/RiskBadge';
import { Empty, ErrorState, Loading } from '../../components/States';
import { TokenAvatar } from '../../components/TokenAvatar';
import { api } from '../../lib/api';
import { formatCompact, shortAddress } from '../../lib/format';
import { useMode } from '../../lib/mode';
import { usePalette } from '../../lib/theme';

const STORAGE_KEY = 'sift.watchedWallet';

export default function PortfolioScreen() {
  const palette = usePalette();
  const { mode } = useMode();
  const [address, setAddress] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => saved && setAddress(saved))
      .catch(() => {});
  }, []);

  const save = () => {
    const next = draft.trim();
    if (!isSolanaAddress(next)) return;
    setAddress(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };
  const clear = () => {
    setAddress(null);
    setDraft('');
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  const holdings = useQuery({
    queryKey: ['holdings', address],
    queryFn: () => api.holdings(address!),
    enabled: address !== null,
  });

  if (!address) {
    const valid = isSolanaAddress(draft.trim());
    return (
      <View style={styles.screen}>
        <Card title="Watch a wallet">
          <Text style={{ color: palette.muted }}>
            Paste any Solana wallet address to see its tokens and their risk levels. This is
            read-only: Sift never asks for keys or seed phrases. Connecting your own wallet to trade
            comes next.
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Wallet address"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          {draft.length > 0 && !valid ? (
            <Text style={{ color: palette.down }}>That doesn’t look like a Solana address.</Text>
          ) : null}
          <Pressable
            onPress={save}
            disabled={!valid}
            style={[styles.button, { backgroundColor: palette.accent, opacity: valid ? 1 : 0.4 }]}
          >
            <Text style={[styles.buttonText, { color: palette.accentText }]}>Watch wallet</Text>
          </Pressable>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Card
        title="Watched wallet"
        right={
          <Pressable onPress={clear}>
            <Text style={{ color: palette.accent, fontWeight: '600' }}>Change</Text>
          </Pressable>
        }
      >
        <Text style={{ color: palette.muted }}>
          {mode === 'pro' ? address : shortAddress(address, 6)}
        </Text>
        {holdings.data ? (
          <Text style={[styles.balance, { color: palette.text }]}>
            {formatCompact(holdings.data.solBalance)} SOL
          </Text>
        ) : null}
      </Card>

      {holdings.isPending ? (
        <Loading label="Loading holdings…" />
      ) : holdings.isError ? (
        <ErrorState message={holdings.error.message} onRetry={() => holdings.refetch()} />
      ) : (
        <FlatList
          data={holdings.data.holdings}
          keyExtractor={(h) => h.mint}
          contentContainerStyle={{ gap: 8, paddingTop: 12 }}
          ListEmptyComponent={<Empty message="No tokens in this wallet." />}
          renderItem={({ item }) => (
            <Link href={`/token/${item.mint}`} asChild>
              <Pressable
                style={StyleSheet.flatten([
                  styles.row,
                  { backgroundColor: palette.card, borderColor: palette.border },
                ])}
              >
                <TokenAvatar uri={item.imageUrl} label={item.symbol ?? item.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
                    {item.name ?? item.symbol ?? shortAddress(item.mint)}
                  </Text>
                  <Text style={{ color: palette.muted }}>
                    {formatCompact(item.amount)} {item.symbol ?? 'tokens'}
                  </Text>
                </View>
                <RiskBadge level={item.riskLevel} />
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  balance: { fontSize: 24, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: '600' },
});
