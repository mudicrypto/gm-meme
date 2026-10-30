import type { TokenStats } from '@sift/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  formatAge,
  formatCompact,
  formatSol,
  formatSolPrice,
  shortAddress,
} from '../../lib/format';
import type { MarketToken, SortKey } from '../../lib/market';
import { transition } from '../../lib/motion';
import { colors, radius, tint } from '../../lib/theme';
import { Text } from '../Text';
import { TokenAvatar } from '../TokenAvatar';
import { Change } from './Change';
import { RISK_TAGS, RiskTag } from './RiskTag';
import { Sparkline } from './Sparkline';

interface Column {
  key: string;
  label: string;
  flex: number;
  /** A fixed width instead of a share (sparkline, action). */
  width?: number;
  align?: 'right' | 'center';
  sort?: SortKey;
  /** Hidden below this table width. */
  minWidth?: number;
}

/** The discovery table: dense, sortable, with a clear selected row. Desktop and tablet only. */
export function MarketTable({
  tokens,
  stats,
  windowLabel,
  width,
  selected,
  onSelect,
  sortBy,
  sortMark,
  traders,
}: {
  tokens: readonly MarketToken[];
  stats: ReadonlyMap<string, TokenStats>;
  windowLabel: string;
  width: number;
  /** With a token panel: the selected mint, and rows select instead of navigating. */
  selected?: string | null;
  onSelect?: (mint: string) => void;
  sortBy: (key: SortKey) => void;
  sortMark: (key: SortKey) => string;
  traders?: ReadonlyMap<string, number>;
}) {
  const columns: Column[] = (
    [
      { key: 'rank', label: '#', flex: 0.4 },
      { key: 'token', label: 'Token', flex: 2.4, sort: 'age' },
      { key: 'price', label: 'Price (SOL)', flex: 1.2, align: 'right', sort: 'price' },
      { key: 'change', label: `${windowLabel} %`, flex: 0.9, align: 'right', sort: 'change' },
      { key: 'volume', label: 'Volume', flex: 1.1, align: 'right', sort: 'volume' },
      { key: 'txns', label: 'Buys / sells', flex: 1, align: 'right', minWidth: 1050 },
      { key: 'mcap', label: 'Mkt cap', flex: 1.3, align: 'right', sort: 'marketCap' },
      { key: 'risk', label: 'Risk', flex: 1, minWidth: 640 },
      { key: 'trend', label: 'Trend', flex: 0, width: 128, align: 'center', minWidth: 900 },
      { key: 'action', label: '', flex: 0, width: 92, align: 'right' },
    ] satisfies Column[]
  ).filter((c) => !c.minWidth || width >= c.minWidth);

  return (
    <View style={styles.table} accessibilityRole="list">
      <View style={styles.head}>
        {columns.map((column) =>
          column.sort ? (
            <Pressable
              key={column.key}
              onPress={() => sortBy(column.sort!)}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${column.label}`}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.cell,
                cellSize(column),
                alignStyle(column.align),
                hovered && styles.headHover,
                transition,
              ]}
            >
              <Text style={styles.headText} numberOfLines={1}>
                {column.label}
                {sortMark(column.sort!)}
              </Text>
            </Pressable>
          ) : (
            <View
              key={column.key}
              style={[styles.cell, cellSize(column), alignStyle(column.align)]}
            >
              <Text style={styles.headText} numberOfLines={1}>
                {column.label}
              </Text>
            </View>
          ),
        )}
      </View>
      {tokens.map((token, index) => {
        const s = stats.get(token.mint);
        const isSelected = selected === token.mint;
        const symbol = (token.symbol ?? token.name ?? shortAddress(token.mint)).slice(0, 12);
        const age = formatAge(token.launchedAt ?? token.firstSeenAt);
        const smart = traders?.get(token.mint);
        return (
          <Pressable
            key={token.mint}
            onPress={() => (onSelect ? onSelect(token.mint) : router.push(`/token/${token.mint}`))}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${token.name ?? symbol}, ${RISK_TAGS[token.riskLevel ?? 'unknown']}`}
            style={({
              hovered,
              focused,
            }: {
              pressed: boolean;
              hovered?: boolean;
              focused?: boolean;
            }) => [
              styles.row,
              hovered && styles.rowHover,
              isSelected && styles.rowSelected,
              focused && styles.rowFocus,
              transition,
            ]}
          >
            {columns.map((column) => (
              <View
                key={column.key}
                style={[styles.cell, cellSize(column), alignStyle(column.align)]}
              >
                {column.key === 'rank' ? (
                  <Text mono style={styles.muted}>
                    {index + 1}
                  </Text>
                ) : column.key === 'token' ? (
                  <View style={styles.tokenCell}>
                    <TokenAvatar
                      uri={token.imageUrl}
                      label={token.name ?? token.symbol}
                      seed={token.mint}
                      size={32}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.symbol} numberOfLines={1}>
                        {symbol}
                      </Text>
                      <Text style={styles.small} numberOfLines={1}>
                        {smart
                          ? `${smart} smart ${smart === 1 ? 'trader' : 'traders'}`
                          : `SOL · ${age === 'just now' ? 'new' : `${age} ago`}`}
                      </Text>
                    </View>
                  </View>
                ) : column.key === 'price' ? (
                  <Text mono style={styles.value} numberOfLines={1}>
                    {s?.priceSol ? formatSolPrice(s.priceSol) : '–'}
                  </Text>
                ) : column.key === 'change' ? (
                  <Change pct={s?.changePct} size={14} />
                ) : column.key === 'volume' ? (
                  <Text mono style={styles.value} numberOfLines={1}>
                    {s ? formatSol(s.volumeSol) : '–'}
                  </Text>
                ) : column.key === 'txns' ? (
                  <Text mono style={styles.value} numberOfLines={1}>
                    {s ? `${s.buys} / ${s.sells}` : '–'}
                  </Text>
                ) : column.key === 'mcap' ? (
                  <Text mono style={styles.value} numberOfLines={1}>
                    {s?.marketCapSol ? `${formatCompact(s.marketCapSol)} SOL` : '–'}
                  </Text>
                ) : column.key === 'risk' ? (
                  <RiskTag level={token.riskLevel} />
                ) : column.key === 'trend' ? (
                  <Sparkline
                    points={s?.sparkline ?? []}
                    changePct={s?.changePct}
                    width={104}
                    height={28}
                  />
                ) : (
                  <Pressable
                    onPress={() => router.push(`/trade/${token.mint}?side=buy`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Trade ${symbol}`}
                    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                      styles.trade,
                      hovered && styles.tradeHover,
                      transition,
                    ]}
                  >
                    <Text style={styles.tradeText}>Trade</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}

function cellSize(column: Column) {
  return column.width ? { width: column.width } : { flex: column.flex };
}

function alignStyle(align?: 'right' | 'center') {
  return align === 'right' ? styles.right : align === 'center' ? styles.center : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  table: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headText: { fontSize: 12, fontWeight: '500', color: colors.faint },
  headHover: { backgroundColor: colors.surface2, borderRadius: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowHover: { backgroundColor: colors.surface2 },
  rowSelected: { backgroundColor: tint(colors.accent, 0.06), borderLeftColor: colors.accent },
  rowFocus: { outlineColor: colors.accent, outlineWidth: 1, outlineStyle: 'solid' } as object,
  cell: { paddingHorizontal: 8, justifyContent: 'center', minWidth: 0, minHeight: 36 },
  right: { alignItems: 'flex-end' },
  center: { alignItems: 'center' },
  tokenCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symbol: { fontSize: 14, fontWeight: '500' },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
  value: { fontSize: 14, fontWeight: '500' },
  muted: { fontSize: 13, color: colors.muted },
  trade: {
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeHover: { borderColor: colors.accent },
  tradeText: { fontSize: 13, fontWeight: '600' },
});
