import { ChevronDown, Filter, Info } from 'lucide-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIST_WINDOWS, activeFilterCount } from '../../lib/market';
import { transition } from '../../lib/motion';
import { colors, radius, space } from '../../lib/theme';
import { Sheet } from '../Sheet';
import { ErrorState } from '../States';
import { Logo } from '../Logo';
import { usePulse } from '../Motion';
import { Text } from '../Text';
import { EmptyFeed } from './EmptyFeed';
import { Highlights } from './Highlights';
import { FiltersSheet } from './FiltersSheet';
import { DevnetPill, NetworkChip, NetworkNote } from './Network';
import { SearchBar } from './SearchBar';
import { Tabs } from './Tabs';
import { TokenListRow } from './TokenListRow';
import { type DiscoverState, FEEDS } from './useDiscover';

/** Discover on a phone: a searchable, filterable list, not a shrunken table. */
export function MobileDiscover({ state }: { state: DiscoverState }) {
  const insets = useSafeAreaInsets();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const { market, rows } = state;
  const filterCount = activeFilterCount(state.filters);
  const windowLabel = LIST_WINDOWS.find((w) => w.minutes === state.windowMinutes)?.label ?? '1h';

  const header = (
    <View style={styles.header}>
      <View style={styles.top}>
        <Logo size={26} />
        <View style={styles.topRight}>
          <NetworkChip onPress={() => setNetworkOpen(true)} />
          <DevnetPill soft />
        </View>
      </View>
      <View>
        <Text style={styles.eyebrow}>MARKETS</Text>
        <Text style={styles.title} accessibilityRole="header">
          Discover
        </Text>
      </View>
      <SearchBar value={state.query} onChange={state.setQuery} onSubmit={state.openAddress} />
      <Highlights
        tokens={rows}
        stats={market.statsMap}
        onOpen={(mint) => router.push(`/token/${mint}`)}
      />
      {state.address ? (
        <Pressable
          onPress={state.openAddress}
          accessibilityRole="link"
          style={({ pressed }) => [styles.openAddress, pressed && styles.pressed]}
        >
          <Text style={styles.openText} numberOfLines={1}>
            Open token {state.address.slice(0, 6)}…{state.address.slice(-6)}
          </Text>
        </Pressable>
      ) : null}
      <Tabs label="Token lists" options={FEEDS} value={state.feed} onChange={state.setFeed} />
      <View style={styles.controls}>
        <View style={styles.flex}>
          <Tabs
            compact
            label="Time window"
            options={LIST_WINDOWS.map((w) => ({ value: w.minutes, label: w.label }))}
            value={state.windowMinutes}
            onChange={state.setWindowMinutes}
          />
        </View>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filters${filterCount ? `, ${filterCount} on` : ''}`}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.filters,
            (pressed || hovered) && { backgroundColor: colors.surface2 },
            transition,
          ]}
        >
          <Filter size={16} color={colors.text} strokeWidth={2} />
          <Text style={styles.filtersText}>Filters</Text>
          {filterCount > 0 ? (
            <View style={styles.badge}>
              <Text mono style={styles.badgeText}>
                {filterCount}
              </Text>
            </View>
          ) : null}
          <ChevronDown size={14} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      {state.hiddenRed > 0 ? (
        <Text style={styles.hidden}>
          Safety filter on: {state.hiddenRed} red {state.hiddenRed === 1 ? 'token' : 'tokens'}{' '}
          hidden.{' '}
          <Text style={styles.link} onPress={state.showRed} accessibilityRole="button">
            Show
          </Text>
        </Text>
      ) : null}
      <View style={styles.columns}>
        <Pressable
          onPress={() => state.sortBy('age')}
          style={styles.colToken}
          accessibilityRole="button"
          accessibilityLabel="Sort by age"
        >
          <Text style={styles.colText}>Token / Vol{state.sortMark('age')}</Text>
        </Pressable>
        <Pressable
          onPress={() => state.sortBy('price')}
          style={styles.colPrice}
          accessibilityRole="button"
          accessibilityLabel="Sort by price"
        >
          <Text style={styles.colText}>Price (SOL){state.sortMark('price')}</Text>
        </Pressable>
        <Pressable
          onPress={() => state.sortBy('change')}
          style={styles.colChange}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${windowLabel} change`}
        >
          <Text style={styles.colText}>
            {windowLabel} %{state.sortMark('change')}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {market.list.isError ? (
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.screen }}>
          {header}
          <ErrorState message={market.list.error.message} onRetry={() => market.list.refetch()} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(token) => token.mint}
          renderItem={({ item }) => (
            <TokenListRow
              token={item}
              stats={market.statsMap.get(item.mint)}
              note={state.noteFor(item.mint)}
            />
          )}
          ListHeaderComponent={header}
          ListFooterComponent={
            <View style={styles.footNote}>
              <Info size={14} color={colors.faint} strokeWidth={2} />
              <Text style={styles.footText}>Devnet data · Not financial advice.</Text>
            </View>
          }
          contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xl * 2 }}
          ListEmptyComponent={market.list.isPending ? <LoadingRows /> : <EmptyFeed state={state} />}
          refreshControl={
            <RefreshControl
              refreshing={market.list.isRefetching}
              onRefresh={() => void market.list.refetch()}
              tintColor={colors.muted}
            />
          }
          keyboardShouldPersistTaps="handled"
        />
      )}
      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={state.filters}
        onChange={state.setFilters}
      />
      <Sheet visible={networkOpen} onClose={() => setNetworkOpen(false)} title="Network">
        <NetworkNote />
      </Sheet>
    </View>
  );
}

/** Placeholder rows while the list loads. */
export function LoadingRows({ count = 8 }: { count?: number }) {
  const pulse = usePulse();
  return (
    <Animated.View accessibilityLabel="Loading tokens" style={{ opacity: pulse }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skeleton}>
          <View style={styles.skAvatar} />
          <View style={styles.skLines}>
            <View style={[styles.skLine, { width: '50%' }]} />
            <View style={[styles.skLine, { width: '30%', height: 8 }]} />
          </View>
          <View style={[styles.skLine, { width: 64 }]} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { gap: space.md, paddingHorizontal: space.screen, paddingBottom: 0 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { fontSize: 16, fontWeight: '700', letterSpacing: 3 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: colors.muted },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  footNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.screen,
    paddingVertical: space.md,
  },
  footText: { fontSize: 12, color: colors.faint },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  openAddress: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  openText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  pressed: { opacity: 0.7 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filtersText: { fontSize: 14, fontWeight: '600' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.onAccent },
  hidden: { fontSize: 12, color: colors.muted },
  link: { fontSize: 12, fontWeight: '600', color: colors.accent },
  columns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  colToken: { flex: 1, minHeight: 32, justifyContent: 'center' },
  colPrice: { minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  colChange: { width: 82, minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  colText: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  skeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingHorizontal: space.screen,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  skAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2 },
  skLines: { flex: 1, gap: 6 },
  skLine: { height: 11, borderRadius: 4, backgroundColor: colors.surface2 },
});
