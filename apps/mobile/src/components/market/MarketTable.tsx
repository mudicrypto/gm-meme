import type { TokenStats } from '@sift/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  formatAge,
  formatCompact,
  formatSol,
  formatSolPrice,
  formatSolPriceFull,
  shortAddress,
} from '../../lib/format';
import type { MarketToken, SortKey } from '../../lib/market';
import { transition } from '../../lib/motion';
import { colors, radius, tint } from '../../lib/theme';
import { HoverTip } from '../HoverTip';
import { WatchStar } from '../WatchStar';
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

// Explicit widths; the token column takes what's left (at least TOKEN_MIN). Optional
// columns join in priority order while they fit: risk first, then the trend, then market cap.
const TOKEN_MIN = 180;
const BASE: Column[] = [
  { key: 'token', label: 'Token', flex: 1, sort: 'age' },
  { key: 'price', label: 'Price (SOL)', flex: 0, width: 120, align: 'right', sort: 'price' },
  { key: 'change', label: '%', flex: 0, width: 88, align: 'right', sort: 'change' },
  { key: 'volume', label: 'Volume', flex: 0, width: 120, align: 'right', sort: 'volume' },
  { key: 'mcap', label: 'Market cap', flex: 0, width: 124, align: 'right', sort: 'marketCap' },
  { key: 'risk', label: 'Risk', flex: 0, width: 108 },
  { key: 'trend', label: 'Last', flex: 0, width: 116, align: 'center' },
  { key: 'watch', label: '', flex: 0, width: 52, align: 'center' },
];
const OPTIONAL = ['risk', 'trend', 'mcap'];

function pickColumns(width: number, windowLabel: string): Column[] {
  const fixed = (keys: Set<string>) =>
    BASE.filter((c) => keys.has(c.key)).reduce((sum, c) => sum + (c.width ?? 0), 0);
  const keys = new Set(BASE.map((c) => c.key).filter((k) => !OPTIONAL.includes(k)));
  for (const key of OPTIONAL) {
    const next = new Set(keys).add(key);
    if (fixed(next) + TOKEN_MIN <= width) keys.add(key);
  }
  const labels: Record<string, string> = {
    change: `${windowLabel} %`,
    volume: `Volume (${windowLabel})`,
    trend: `Last ${windowLabel}`,
  };
  return BASE.filter((c) => keys.has(c.key)).map((c) => ({
    ...c,
    label: labels[c.key] ?? c.label,
  }));
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
  const columns = pickColumns(width, windowLabel);

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
              <View style={[styles.headInner, column.align === 'right' && styles.headRight]}>
                <Text
                  style={[styles.headText, sortMark(column.sort!) ? styles.headOn : null]}
                  numberOfLines={1}
                >
                  {column.label}
                </Text>
                <SortIcon mark={sortMark(column.sort!)} />
              </View>
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
      {tokens.map((token) => {
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
                {column.key === 'token' ? (
                  <View style={styles.tokenCell}>
                    <TokenAvatar
                      uri={token.imageUrl}
                      label={token.symbol ?? token.name}
                      seed={token.mint}
                      size={36}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.symbol} numberOfLines={1}>
                        {symbol}
                      </Text>
                      <Text style={styles.small} numberOfLines={1}>
                        {smart
                          ? `${smart} smart ${smart === 1 ? 'trader' : 'traders'}`
                          : `${(token.name ?? 'Unnamed').slice(0, 24)} · ${age === 'just now' ? 'new' : age}`}
                      </Text>
                    </View>
                  </View>
                ) : column.key === 'price' ? (
                  s?.priceSol ? (
                    <PriceCell price={s.priceSol} />
                  ) : (
                    <Text mono style={styles.value}>
                      –
                    </Text>
                  )
                ) : column.key === 'change' ? (
                  <Change pct={s?.changePct} size={14} />
                ) : column.key === 'volume' ? (
                  <Text mono style={styles.value} numberOfLines={1}>
                    {s ? formatSol(s.volumeSol) : '–'}
                  </Text>
                ) : column.key === 'mcap' ? (
                  <Text mono style={styles.value} numberOfLines={1}>
                    {s?.marketCapSol ? formatCompact(s.marketCapSol) : '–'}
                  </Text>
                ) : column.key === 'risk' ? (
                  <RiskTag level={token.riskLevel} />
                ) : column.key === 'trend' ? (
                  <Sparkline
                    points={s?.sparkline ?? []}
                    changePct={s?.changePct}
                    width={100}
                    height={30}
                  />
                ) : (
                  <WatchStar mint={token.mint} size={18} color={colors.faint} />
                )}
              </View>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Up/down arrows on a sortable heading; one filled arrow when it's the active sort. */
function SortIcon({ mark }: { mark: string }) {
  const Icon = mark.includes('↓') ? ArrowDown : mark.includes('↑') ? ArrowUp : ArrowUpDown;
  return <Icon size={13} color={mark ? colors.accent : colors.faint} strokeWidth={2.2} />;
}

/** A price with its full precision on hover or focus; clicking copies it. */
function PriceCell({ price }: { price: number }) {
  const [copied, setCopied] = useState(false);
  const full = formatSolPriceFull(price);
  return (
    <HoverTip
      tip={copied ? 'Copied' : `${full} SOL · click to copy`}
      onPress={() => {
        void Clipboard.setStringAsync(full).then(() => setCopied(true));
        setTimeout(() => setCopied(false), 1500);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Price ${full} SOL. Copy`}
      style={({ focused }) => [styles.priceTap, focused && styles.priceFocus]}
    >
      <Text mono style={styles.value} numberOfLines={1}>
        {formatSolPrice(price)}
      </Text>
    </HoverTip>
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
  // No overflow clipping: price tooltips rise above the first row.
  table: {
    borderRadius: radius.card + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  priceTap: { paddingVertical: 4, borderRadius: 4 },
  priceFocus: { outlineColor: colors.accent, outlineWidth: 1, outlineStyle: 'solid' } as object,
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headRight: { justifyContent: 'flex-end' },
  headText: { fontSize: 13, fontWeight: '500', color: colors.muted },
  headOn: { color: colors.text, fontWeight: '600' },
  headHover: { backgroundColor: colors.surface2, borderRadius: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowHover: { backgroundColor: colors.surface2 },
  rowSelected: { backgroundColor: tint(colors.accent, 0.07), borderLeftColor: colors.accent },
  rowFocus: { outlineColor: colors.accent, outlineWidth: 1, outlineStyle: 'solid' } as object,
  cell: { paddingHorizontal: 8, justifyContent: 'center', minWidth: 0, minHeight: 36 },
  right: { alignItems: 'flex-end' },
  center: { alignItems: 'center' },
  tokenCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symbol: { fontSize: 15, fontWeight: '700' },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
  value: { fontSize: 15, fontWeight: '500' },
});
