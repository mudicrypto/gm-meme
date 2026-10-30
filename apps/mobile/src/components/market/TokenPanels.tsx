import type { RiskScore, TokenStats, TokenTrade } from '@sift/shared';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestionMark,
  ShieldX,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatAgo, formatAge, formatCompact, formatSol, formatSolPrice } from '../../lib/format';
import type { MarketToken } from '../../lib/market';
import { transition } from '../../lib/motion';
import { RISK_COLORS, RISK_LABELS, colors, radius, space, tint } from '../../lib/theme';
import { Text } from '../Text';

export const CHECK_NAMES: Record<string, string> = {
  mint_authority: 'Minting',
  freeze_authority: 'Freezing',
  token_extensions: 'Transfer rules',
  holder_concentration: 'Holders',
  liquidity: 'Liquidity',
  dev_history: 'Creator history',
  sell_test: 'Selling',
};

/** Two-by-two key numbers. Only real data: "–" where Sift has none. */
export function Metrics({
  stats,
  token,
  windowLabel,
  flat = false,
}: {
  stats: TokenStats | undefined;
  token: MarketToken | undefined;
  windowLabel: string;
  /** Inside a panel: no card, divider lines only. */
  flat?: boolean;
}) {
  const cells: Array<[string, string]> = [
    ['Market cap', stats?.marketCapSol ? `${formatCompact(stats.marketCapSol)} SOL` : '–'],
    [`Volume (${windowLabel})`, stats ? formatSol(stats.volumeSol) : '–'],
    ['Buys / sells', stats ? `${stats.buys} / ${stats.sells}` : '–'],
    ['Age', token ? ageText(formatAge(token.launchedAt ?? token.firstSeenAt)) : '–'],
  ];
  return (
    <View style={[styles.metrics, flat && styles.metricsFlat]}>
      {cells.map(([label, value], i) => (
        <View
          key={label}
          style={[
            styles.metric,
            flat && styles.metricFlat,
            i % 2 === 1 && styles.metricRight,
            flat && i >= 2 && styles.metricLower,
            flat && i % 2 === 1 && { paddingLeft: 12 },
          ]}
        >
          <Text style={styles.metricLabel}>{label}</Text>
          <Text mono style={styles.metricValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ageText(age: string): string {
  return age === 'just now' ? 'New' : age;
}

/**
 * Risk checks: one row with the result, opening to every check and its reason. A check
 * that couldn't get its data comes back amber (a flag), so "0 flags detected" only ever
 * means every check completed clean; a failed load says so rather than looking clean.
 * Text and an icon always carry the level; never "safe".
 */
export function RiskSignals({
  risk,
  defaultOpen = false,
  unavailable = false,
  onRetry,
  flat = false,
}: {
  risk: RiskScore | undefined;
  defaultOpen?: boolean;
  /** The checks couldn't be loaded. */
  unavailable?: boolean;
  onRetry?: () => void;
  /** Inside a panel: no card, one row between dividers. */
  flat?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (unavailable || !risk) {
    return (
      <View style={[styles.riskBox, flat && styles.riskFlat, styles.risk]}>
        <ShieldQuestionMark size={20} color={colors.muted} strokeWidth={2} />
        <View style={styles.flex}>
          <Text style={styles.riskTitle}>Risk checks</Text>
          <Text style={styles.riskSub}>
            {unavailable
              ? 'Couldn’t load the checks. Nothing is known yet.'
              : 'Checking this token…'}
          </Text>
        </View>
        {unavailable && onRetry ? (
          <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const flags = risk.reasons.filter((r) => r.level !== 'green');
  const tone = RISK_COLORS[risk.level];
  const Icon = risk.level === 'green' ? ShieldCheck : risk.level === 'red' ? ShieldX : ShieldAlert;
  const total = Object.keys(CHECK_NAMES).length;
  const ran = risk.reasons.length;
  const flagText =
    flags.length === 0
      ? '0 flags detected'
      : `${flags.length} ${flags.length === 1 ? 'flag' : 'flags'}`;
  return (
    <View style={[styles.riskBox, flat && styles.riskFlat]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Risk checks: ${RISK_LABELS[risk.level]}, ${flagText}, ${ran} of ${total} checks`}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.risk,
          (pressed || hovered) && { backgroundColor: colors.surface2 },
          transition,
        ]}
      >
        <Icon size={20} color={tone.fg} strokeWidth={2} />
        <View style={styles.flex}>
          <Text style={styles.riskTitle}>Risk checks</Text>
          <Text style={styles.riskSub} numberOfLines={2}>
            <Text style={[styles.level, { color: tone.fg }]}>{RISK_LABELS[risk.level]}</Text>
            {' · '}
            {ran < total
              ? `${ran} of ${total} checks returned`
              : flags.length === 0
                ? `nothing found in ${total} checks`
                : `${total} automated checks`}
          </Text>
        </View>
        <Text style={[styles.flagText, { color: flags.length ? tone.fg : colors.text2 }]}>
          {flagText}
        </Text>
        {open ? (
          <ChevronDown size={18} color={colors.muted} strokeWidth={2} />
        ) : (
          <ChevronRight size={18} color={colors.muted} strokeWidth={2} />
        )}
      </Pressable>
      {open ? (
        <View style={styles.checks}>
          {risk.reasons.map((reason) => (
            <View key={reason.check} style={styles.check}>
              <View style={[styles.mark, { backgroundColor: RISK_COLORS[reason.level].bg }]}>
                <Text style={[styles.markText, { color: RISK_COLORS[reason.level].fg }]}>
                  {reason.level === 'green' ? '✓' : reason.level === 'amber' ? '!' : '×'}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.checkName}>
                  {CHECK_NAMES[reason.check] ?? reason.check}
                  <Text style={[styles.checkLevel, { color: RISK_COLORS[reason.level].fg }]}>
                    {'  '}
                    {RISK_LABELS[reason.level]}
                  </Text>
                </Text>
                <Text style={styles.checkText}>{reason.message}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.disclaimer}>{risk.disclaimer}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The latest recorded trades of a token. */
export function ActivityList({
  trades,
  symbol,
  loading,
}: {
  trades: readonly TokenTrade[] | undefined;
  symbol: string;
  loading: boolean;
}) {
  if (loading) return <Text style={styles.emptyText}>Loading trades…</Text>;
  if (!trades || trades.length === 0)
    return <Text style={styles.emptyText}>No trades recorded in the last 24 hours.</Text>;
  return (
    <View>
      {trades.map((trade, i) => {
        const buy = trade.side === 'buy';
        const sell = trade.side === 'sell';
        const color = buy ? colors.up : sell ? colors.down : colors.muted;
        return (
          <View key={`${trade.at}-${i}`} style={styles.trade}>
            <View style={[styles.tradeIcon, { backgroundColor: tint(color, 0.12) }]}>
              {buy ? (
                <ArrowUp size={16} color={color} strokeWidth={2.2} />
              ) : sell ? (
                <ArrowDown size={16} color={color} strokeWidth={2.2} />
              ) : (
                <ArrowLeftRight size={16} color={color} strokeWidth={2} />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={styles.tradeSide}>
                {buy ? 'Buy' : sell ? 'Sell' : 'Trade'}
                <Text style={styles.tradeTime}>
                  {'  '}
                  {formatAgo(trade.at)}
                </Text>
              </Text>
              <Text mono style={styles.tradeSub}>
                at {formatSolPrice(trade.priceSol)} SOL
              </Text>
            </View>
            <View style={styles.tradeRight}>
              <Text mono style={styles.tradeAmount}>
                {formatCompact(trade.tokenAmount)} {symbol}
              </Text>
              <Text mono style={styles.tradeSub}>
                {formatSol(trade.volumeSol)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingVertical: 6,
  },
  metricsFlat: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingVertical: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  metric: { width: '50%', paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
  metricFlat: { paddingHorizontal: 0, paddingVertical: 12, paddingRight: 12 },
  metricLower: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metricRight: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  metricLabel: { fontSize: 12, color: colors.muted },
  metricValue: { fontSize: 17, fontWeight: '600' },
  riskFlat: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    marginHorizontal: -space.lg,
    paddingHorizontal: 0,
  },
  riskBox: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  risk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  riskTitle: { fontSize: 15, fontWeight: '600' },
  riskSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  level: { fontSize: 12, fontWeight: '600' },
  flagText: { fontSize: 13, fontWeight: '600' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  checks: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 8 },
  mark: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 12, fontWeight: '700' },
  checkName: { fontSize: 14, fontWeight: '600' },
  checkLevel: { fontSize: 12, fontWeight: '600' },
  checkText: { fontSize: 13, lineHeight: 19, color: colors.text2, marginTop: 2 },
  disclaimer: { fontSize: 12, lineHeight: 17, color: colors.faint },
  emptyText: { fontSize: 13, color: colors.muted, paddingVertical: 16, textAlign: 'center' },
  trade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tradeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeSide: { fontSize: 15, fontWeight: '600' },
  tradeTime: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  tradeSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  tradeRight: { alignItems: 'flex-end' },
  tradeAmount: { fontSize: 15, fontWeight: '600' },
});
