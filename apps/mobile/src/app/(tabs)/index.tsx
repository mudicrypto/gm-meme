import type { TokenSummary } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { ModeToggle } from '../../components/ModeToggle';
import { SkeletonCards } from '../../components/Skeleton';
import { Empty, ErrorState } from '../../components/States';
import { Text } from '../../components/Text';
import { TokenRow } from '../../components/TokenRow';
import { api } from '../../lib/api';
import { useMode } from '../../lib/mode';
import { colors, radius, space, type as typeScale } from '../../lib/theme';

// "No red flags" is the trending list with only green tokens: Sift never calls a token safe.
type Feed = 'new' | 'trending' | 'clean';

const FEEDS: ReadonlyArray<{ value: Feed; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'trending', label: 'Trending' },
  { value: 'clean', label: 'No red flags' },
];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { mode } = useMode();
  const [feed, setFeed] = useState<Feed>('trending');
  const [showRed, setShowRed] = useState(false);
  const query = useQuery<{ tokens: TokenSummary[] }>({
    queryKey: ['feed', feed === 'new' ? 'new' : 'trending'],
    queryFn: feed === 'new' ? api.newTokens : api.trending,
    refetchInterval: 15_000,
  });

  const all = query.data?.tokens ?? [];
  const redCount = all.filter((token) => token.riskLevel === 'red').length;
  const tokens = all.filter((token) =>
    feed === 'clean' ? token.riskLevel === 'green' : showRed || token.riskLevel !== 'red',
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Logo />
        <ModeToggle />
      </View>
      <View>
        <Text style={typeScale.title}>Discover</Text>
        <Text style={styles.subtitle}>
          Every token checked for scam patterns before you see it
          {mode === 'pro' ? ' · Solana devnet' : ''}
        </Text>
      </View>
      <View style={styles.tabs}>
        {FEEDS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={feed === option.value}
            onPress={() => setFeed(option.value)}
          />
        ))}
      </View>
      {feed !== 'clean' && redCount > 0 ? (
        <View style={styles.filter}>
          <ShieldCheck size={20} color={colors.up} strokeWidth={2} />
          <Text style={styles.filterText}>
            {showRed ? 'Safety filter off · ' : 'Safety filter on · '}
            <Text style={styles.filterCount}>
              {redCount} red {redCount === 1 ? 'token' : 'tokens'} {showRed ? 'shown' : 'hidden'}
            </Text>
          </Text>
          <Pressable
            onPress={() => setShowRed((value) => !value)}
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={styles.filterAction}>{showRed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
      ) : null}
      {feed === 'clean' ? (
        <Text style={styles.note}>
          Trending tokens with no red flags in Sift’s checks. That lowers the risk; it doesn’t
          remove it.
        </Text>
      ) : null}
      {query.isPending ? <SkeletonCards count={5} /> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {query.isError ? (
        <View style={{ paddingTop: insets.top }}>
          {header}
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        </View>
      ) : (
        <FlatList
          data={tokens}
          keyExtractor={(token) => token.mint}
          renderItem={({ item }) => <TokenRow token={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingTop: insets.top + 16 }]}
          ItemSeparatorComponent={() => <View style={{ height: space.gap }} />}
          ListEmptyComponent={
            query.isPending ? undefined : (
              <Empty
                message={
                  feed === 'clean'
                    ? 'No trending token is free of red flags right now.'
                    : 'No tokens yet. New launches appear here within seconds.'
                }
              />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.muted}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { gap: 14, paddingBottom: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtitle: { marginTop: 4, fontSize: 14, color: colors.muted },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterText: { flex: 1, fontSize: 13, color: colors.text2 },
  filterCount: { fontSize: 13, fontWeight: '700', color: colors.text },
  filterAction: { fontSize: 13, fontWeight: '700', color: colors.link },
  note: { fontSize: 13, color: colors.faint },
  list: { paddingHorizontal: space.screen, paddingBottom: 40 },
});
