import type { TokenSummary } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../../components/Segmented';
import { Empty, ErrorState, Loading } from '../../components/States';
import { TokenRow } from '../../components/TokenRow';
import { api } from '../../lib/api';
import { useMode } from '../../lib/mode';
import { usePalette } from '../../lib/theme';

type Feed = 'new' | 'trending';

export default function DiscoverScreen() {
  const palette = usePalette();
  const { mode } = useMode();
  const [feed, setFeed] = useState<Feed>('trending');
  const query = useQuery<{ tokens: TokenSummary[] }>({
    queryKey: ['feed', feed],
    queryFn: feed === 'new' ? api.newTokens : api.trending,
    refetchInterval: 15_000,
  });

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Segmented
          value={feed}
          onChange={setFeed}
          options={[
            { value: 'trending', label: 'Trending' },
            { value: 'new', label: 'New launches' },
          ]}
        />
        <Text style={[styles.hint, { color: palette.muted }]}>
          {feed === 'trending' ? 'Most distinct traders in the last hour.' : 'Newest tokens first.'}{' '}
          Every token is checked for common scam patterns.
          {mode === 'pro' ? ' Solana devnet.' : ''}
        </Text>
      </View>

      {query.isPending ? (
        <Loading label="Finding tokens…" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={query.data.tokens}
          keyExtractor={(token) => token.mint}
          renderItem={({ item }) => <TokenRow token={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <Empty message="No tokens yet. New launches appear here within seconds." />
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: { padding: 16, paddingBottom: 8, gap: 8 },
  hint: { fontSize: 13 },
  list: { padding: 16, paddingTop: 8 },
});
