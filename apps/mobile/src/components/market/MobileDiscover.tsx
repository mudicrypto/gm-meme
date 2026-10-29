import { router } from 'expo-router';
import { ChevronDown, SlidersHorizontal, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIST_WINDOWS, activeFilterCount } from '../../lib/market';
import { colors, radius, space } from '../../lib/theme';
import { IconButton } from '../Button';
import { Sheet } from '../Sheet';
import { Empty, ErrorState } from '../States';
import { Text } from '../Text';
import { FiltersSheet } from './FiltersSheet';
import { NetworkChip, NetworkNote } from './Network';
import { SearchBar } from './SearchBar';
import { StatusLine } from './StatusLine';
import { Tabs } from './Tabs';
import { TokenListRow } from './TokenListRow';
import { type DiscoverState, FEEDS, emptyMessage } from './useDiscover';

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
        <Text style={styles.brand} accessibilityRole="header">
          SIFT
        </Text>
        <View style={styles.topRight}>
          <NetworkChip onPress={() => setNetworkOpen(true)} />
          <IconButton label="Wallet" onPress={() => router.push('/wallet')}>
            <Wallet size={20} color={colors.text} strokeWidth={2} />
          </IconButton>
        </View>
      </View>
      <View>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Every token checked for scam patterns first.</Text>
      </View>
      <SearchBar value={state.query} onChange={state.setQuery} onSubmit={state.openAddress} />
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
          style={({ pressed }) => [styles.filters, pressed && styles.pressed]}
        >
          <SlidersHorizontal size={16} color={colors.text} strokeWidth={2} />
          <Text style={styles.filtersText}>Filters</Text>
          {filterCount > 0 ? (
            <View style={styles.badge}>
              <Text mono style={styles.badgeText}>
                {filterCount}
              </Text>
            </View>
          ) : null}
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
          <Text style={styles.colText}>Token{state.sortMark('age')}</Text>
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
            {windowLabel}
            {state.sortMark('change') || ' '}
          </Text>
          {state.sortMark('change') ? null : (
            <ChevronDown size={12} color={colors.muted} strokeWidth={2} />
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {market.list.isError ? (
        <View style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.screen }}>
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
          ListFooterComponent={<StatusLine state={state} />}
          contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xl }}
          ListEmptyComponent={
            market.list.isPending ? <LoadingRows /> : <Empty message={emptyMessage(state)} />
          }
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
  return (
    <View accessibilityLabel="Loading tokens">
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { gap: space.md, paddingHorizontal: space.screen, paddingBottom: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { fontSize: 18, fontWeight: '700', letterSpacing: 2.5 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 2 },
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
    borderRadius: radius.input,
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
  colPrice: { width: 96, minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  colChange: {
    width: 70,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  colText: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  skeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingHorizontal: space.screen,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  skAvatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface2 },
  skLines: { flex: 1, gap: 6 },
  skLine: { height: 11, borderRadius: 4, backgroundColor: colors.surface2 },
});
