import type { RiskLevel } from '@sift/shared';
import { SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { transition } from '../../lib/motion';
import { DEFAULT_FILTERS, LIST_WINDOWS, activeFilterCount, filterChips } from '../../lib/market';
import { colors, dark, radius, space } from '../../lib/theme';
import { ErrorState } from '../States';
import { Text } from '../Text';
import { EmptyFeed } from './EmptyFeed';
import { FiltersBody } from './FiltersSheet';
import { MarketTable } from './MarketTable';
import { LoadingRows } from './MobileDiscover';
import { Sidebar } from './Sidebar';
import { StatusLine } from './StatusLine';
import { Tabs } from './Tabs';
import { TerminalHeader } from './TerminalHeader';
import { TokenPanel } from './TokenPanel';
import { type DiscoverState, FEEDS } from './useDiscover';
import { useNetwork } from '../../lib/network';

const SIDEBAR = 64;
/** The token panel: 400 on wide screens, 360 on smaller desktops. */
const panelWidth = (width: number) => (width >= 1440 ? 420 : 380);
const DRAWER = 320;

/**
 * Discover on tablets and desktops: header, tool rail, the discovery table and, on wide
 * screens, the selected token beside it. Smaller desktops drop the panel and rows open
 * the token page instead. Filters live in a drawer over the table: closing it keeps them.
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { market, rows } = state;
  const filterCount = activeFilterCount(state.filters);
  const chips = filterChips(state.filters);
  const windowLabel = LIST_WINDOWS.find((w) => w.minutes === state.windowMinutes)?.label ?? '1h';
  const panel = panelWidth(width);
  const tableWidth = width - SIDEBAR - (showPanel ? panel : 0) - space.xl * 2;
  const selectedToken = rows.find((t) => t.mint === state.selected) ?? rows[0];
  const toggleLevel = (level: RiskLevel | 'unknown') =>
    state.setFilters({
      ...state.filters,
      levels: state.filters.levels.includes(level)
        ? state.filters.levels.filter((l) => l !== level)
        : [...state.filters.levels, level],
    });

  // Esc closes the drawer (web).
  useEffect(() => {
    if (!drawerOpen || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <View style={styles.screen}>
      <TerminalHeader query={state.query} onQuery={state.setQuery} />
      <View style={styles.body}>
        <Sidebar onScreener={() => setDrawerOpen((v) => !v)} screenerOn={drawerOpen} />
        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.eyebrow}>ON-CHAIN DISCOVERY</Text>
              <Text style={styles.title} accessibilityRole="header">
                Discover
              </Text>
            </View>
            <View style={styles.status}>
              <StatusLine state={state} inline />
            </View>
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
            <View style={styles.right}>
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
                onPress={() => setDrawerOpen(true)}
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
          </View>
          {chips.length > 0 || state.hiddenRed > 0 ? (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={() => state.setFilters(chip.without)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove filter: ${chip.label}`}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.chip,
                    hovered && { backgroundColor: colors.surface2 },
                    transition,
                  ]}
                >
                  <Text style={styles.chipText}>{chip.label}</Text>
                  <X size={14} color={colors.muted} strokeWidth={2} />
                </Pressable>
              ))}
              {chips.length > 1 ? (
                <Pressable
                  onPress={() => state.setFilters(DEFAULT_FILTERS)}
                  accessibilityRole="button"
                  style={styles.clear}
                >
                  <Text style={styles.link}>Clear all</Text>
                </Pressable>
              ) : null}
              {state.hiddenRed > 0 ? (
                <Text style={styles.hidden}>
                  {state.hiddenRed} red {state.hiddenRed === 1 ? 'token' : 'tokens'} hidden by the
                  safety filter.{' '}
                  <Text style={styles.link} onPress={state.showRed} accessibilityRole="button">
                    Show
                  </Text>
                </Text>
              ) : null}
            </View>
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
            <EmptyFeed state={state} />
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
          <View style={[styles.panel, { width: panel }]}>
            {selectedToken ? (
              <TokenPanel
                key={selectedToken.mint}
                token={selectedToken}
                listStats={market.statsMap.get(selectedToken.mint)}
                listWindowMinutes={state.windowMinutes}
              />
            ) : (
              <View style={styles.panelEmpty}>
                <Text style={[styles.subtitle, { color: dark.muted }]}>
                  Select a token to see its chart and trade it.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {drawerOpen ? (
          <>
            <Pressable
              style={styles.backdrop}
              onPress={() => setDrawerOpen(false)}
              accessibilityLabel="Close filters"
            />
            <View style={styles.drawer} accessibilityRole="none" accessibilityLabel="Filters">
              <View style={styles.drawerHead}>
                <Text style={styles.drawerTitle}>Filters</Text>
                <Pressable
                  onPress={() => state.setFilters(DEFAULT_FILTERS)}
                  accessibilityRole="button"
                  style={styles.reset}
                >
                  <Text style={styles.link}>Reset</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDrawerOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close filters"
                  style={styles.close}
                >
                  <X size={18} color={colors.text} strokeWidth={2} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.drawerBody}>
                <FiltersBody
                  filters={state.filters}
                  onChange={state.setFilters}
                  toggleLevel={toggleLevel}
                />
              </ScrollView>
              <View style={styles.drawerFoot}>
                <Text style={styles.count}>
                  {rows.length} {rows.length === 1 ? 'token' : 'tokens'} match
                </Text>
                <Pressable
                  onPress={() => setDrawerOpen(false)}
                  accessibilityRole="button"
                  style={styles.done}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  body: { flex: 1, flexDirection: 'row' },
  reset: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  main: { flex: 1 },
  mainContent: { padding: space.xl, gap: space.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.md,
  },
  status: { flexShrink: 1 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: colors.muted },
  title: { fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    flexWrap: 'wrap',
  },
  feeds: { flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  windows: { width: 208 },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
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
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  clear: { height: 32, justifyContent: 'center', paddingHorizontal: 4 },
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
  panel: { backgroundColor: dark.bg, borderLeftWidth: 1, borderLeftColor: dark.border },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: SIDEBAR,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 30,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: SIDEBAR,
    width: DRAWER,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    zIndex: 31,
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 56,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  drawerTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  close: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  drawerBody: { padding: space.lg },
  drawerFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  count: { fontSize: 13, color: colors.muted },
  done: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: radius.input,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 14, fontWeight: '600', color: colors.onAccent },
  panelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
