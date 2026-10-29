import type { TokenSummary } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '../../components/Button';
import { FeaturedToken } from '../../components/FeaturedToken';
import { Logo } from '../../components/Logo';
import { FadeIn, usePulse } from '../../components/Motion';
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

  const pulse = usePulse(0.3, 1000);
  const all = query.data?.tokens ?? [];
  const redCount = all.filter((token) => token.riskLevel === 'red').length;
  const visible = all.filter((token) =>
    feed === 'clean' ? token.riskLevel === 'green' : showRed || token.riskLevel !== 'red',
  );
  // On Trending, the busiest token gets the big card (never a red one).
  const featured =
    feed === 'trending' && visible[0] && visible[0].riskLevel !== 'red' ? visible[0] : null;
  const tokens = featured ? visible.slice(1) : visible;

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Logo />
        <ModeToggle />
      </View>
      <View>
        <Text style={typeScale.title}>Discover</Text>
        <Text style={styles.subtitle}>Every token is checked for scam patterns first</Text>
        <View style={styles.live}>
          <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
          <Text style={styles.liveText}>
            Live{mode === 'pro' ? ' · Solana devnet' : ''} · updates every 15 seconds
          </Text>
        </View>
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
      {featured ? (
        <FadeIn>
          <FeaturedToken token={featured} />
        </FadeIn>
      ) : null}
      {featured && tokens.length > 0 ? <Text style={styles.listLabel}>Also trending</Text> : null}
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
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <TokenRow token={item} />
            </FadeIn>
          )}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingTop: insets.top + 16 }]}
          ItemSeparatorComponent={() => <View style={{ height: space.gap }} />}
          ListEmptyComponent={
            query.isPending || featured ? undefined : (
              <Empty
                message={
                  feed === 'clean'
                    ? 'No trending token is free of red flags right now.'
                    : redCount > 0 && !showRed
                      ? 'Only red-flagged tokens right now. Tap Show above to see them.'
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
  listLabel: { fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.up },
  liveText: { fontSize: 12, color: colors.faint },
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
  list: { paddingHorizontal: space.screen, paddingBottom: space.tabBar },
});
