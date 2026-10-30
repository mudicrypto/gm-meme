import type { RiskLevel } from '@sift/shared';
import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { transition } from '../../lib/motion';
import { DEFAULT_FILTERS, LIST_WINDOWS, activeFilterCount } from '../../lib/market';
import { colors, radius, space } from '../../lib/theme';
import { Empty, ErrorState } from '../States';
import { Text } from '../Text';
import { FiltersBody, FiltersSheet } from './FiltersSheet';
import { MarketTable } from './MarketTable';
import { LoadingRows } from './MobileDiscover';
import { Sidebar } from './Sidebar';
import { StatusLine } from './StatusLine';
import { Tabs } from './Tabs';
import { TerminalHeader } from './TerminalHeader';
import { TokenPanel } from './TokenPanel';
import { type DiscoverState, FEEDS, emptyMessage } from './useDiscover';
import { useNetwork } from '../../lib/network';

const SIDEBAR = 76;
const PANEL = 400;
const SCREENER = 280;

/**
 * Discover on tablets and desktops: header, tool rail, the discovery table and, on wide
 * screens, the selected token beside it. Smaller desktops drop the panel and rows open
 * the token page instead.
 */
export function DesktopDiscover({
  state,
  showPanel,
}: {
  state: DiscoverState;
  showPanel: boolean;
}) {
  const { width } = useWindowDimensions();
  const { isDevnet } = useNetwork();
  const [screener, setScreener] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { market, rows } = state;
  const filterCount = activeFilterCount(state.filters);
  const windowLabel = LIST_WINDOWS.find((w) => w.minutes === state.windowMinutes)?.label ?? '1h';
  const tableWidth =
    width - SIDEBAR - (showPanel ? PANEL : 0) - (screener ? SCREENER : 0) - space.xl * 2;
  const selectedToken = rows.find((t) => t.mint === state.selected) ?? rows[0];
  const toggleLevel = (level: RiskLevel | 'unknown') =>
    state.setFilters({
      ...state.filters,
      levels: state.filters.levels.includes(level)
        ? state.filters.levels.filter((l) => l !== level)
        : [...state.filters.levels, level],
    });

  return (
    <View style={styles.screen}>
      <TerminalHeader query={state.query} onQuery={state.setQuery} />
      <View style={styles.body}>
        <Sidebar onScreener={() => setScreener((v) => !v)} screenerOn={screener} />
        {screener ? (
          <ScrollView style={styles.screener} contentContainerStyle={styles.screenerContent}>
            <View style={styles.screenerHead}>
              <Text style={styles.screenerTitle}>Screener</Text>
              <Pressable
                onPress={() => state.setFilters(DEFAULT_FILTERS)}
                accessibilityRole="button"
                style={styles.reset}
              >
                <Text style={styles.link}>Reset</Text>
              </Pressable>
            </View>
            <FiltersBody
              filters={state.filters}
              onChange={state.setFilters}
              toggleLevel={toggleLevel}
            />
          </ScrollView>
        ) : null}
        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
          <View style={styles.titleRow}>
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header">
                Discover
              </Text>
              <Text style={styles.subtitle}>Every token checked for scam patterns first.</Text>
            </View>
            <StatusLine state={state} inline />
          </View>
          <View style={styles.controls}>
            <View style={styles.feeds}>
              <Tabs
                label="Token lists"
                options={FEEDS}
                value={state.feed}
                onChange={state.setFeed}
              />
            </View>
            <View style={styles.windows}>
              <Tabs
                compact
                label="Time window"
                options={LIST_WINDOWS.map((w) => ({ value: w.minutes, label: w.label }))}
                value={state.windowMinutes}
                onChange={state.setWindowMinutes}
              />
            </View>
            <Pressable
              onPress={() => (screener ? setScreener(false) : setFiltersOpen(true))}
              accessibilityRole="button"
              accessibilityLabel={`Filters${filterCount ? `, ${filterCount} on` : ''}`}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.filters,
                hovered && { backgroundColor: colors.surface2 },
                transition,
              ]}
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
          {state.address ? (
            <Pressable
              onPress={state.openAddress}
              accessibilityRole="link"
              style={styles.openAddress}
            >
              <Text style={styles.link}>
                Open token {state.address.slice(0, 6)}…{state.address.slice(-6)}
              </Text>
            </Pressable>
          ) : null}
          {market.list.isError ? (
            <ErrorState message={market.list.error.message} onRetry={() => market.list.refetch()} />
          ) : market.list.isPending ? (
            <View style={styles.loading}>
              <LoadingRows />
            </View>
          ) : rows.length === 0 ? (
            <Empty message={emptyMessage(state)} />
          ) : (
            <MarketTable
              tokens={rows}
              stats={market.statsMap}
              windowLabel={windowLabel}
              width={tableWidth}
              selected={showPanel ? (selectedToken?.mint ?? null) : null}
              onSelect={showPanel ? state.select : undefined}
              sortBy={state.sortBy}
              sortMark={state.sortMark}
              traders={market.traders}
            />
          )}
          <Text style={styles.footnote}>
            Liquidity and holder counts aren’t shown yet: Sift has no live source for them.
            {isDevnet ? ' Prices are in test SOL and have no real value.' : ''} Risk signals
            describe what Sift checked; they don’t guarantee a token is harmless. Not financial
            advice.
          </Text>
        </ScrollView>
        {showPanel ? (
          <View style={styles.panel}>
            {selectedToken ? (
              <TokenPanel
                key={selectedToken.mint}
                token={selectedToken}
                listStats={market.statsMap.get(selectedToken.mint)}
                listWindowMinutes={state.windowMinutes}
              />
            ) : (
              <View style={styles.panelEmpty}>
                <Text style={styles.subtitle}>Select a token to see its chart and trade it.</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={state.filters}
        onChange={state.setFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  body: { flex: 1, flexDirection: 'row' },
  screener: {
    width: SCREENER,
    flexGrow: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  screenerContent: { padding: space.lg, gap: space.md },
  screenerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenerTitle: { fontSize: 16, fontWeight: '700' },
  reset: { minHeight: 44, justifyContent: 'center' },
  main: { flex: 1 },
  mainContent: { padding: space.xl, gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  feeds: { width: 380 },
  windows: { width: 220 },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    marginLeft: 'auto',
    borderRadius: radius.input,
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
  hidden: { fontSize: 13, color: colors.muted },
  link: { fontSize: 13, fontWeight: '600', color: colors.accent },
  openAddress: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  loading: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  footnote: { fontSize: 12, color: colors.faint, lineHeight: 18, maxWidth: 760 },
  panel: {
    width: PANEL,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  panelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
