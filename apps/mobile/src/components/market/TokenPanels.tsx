import type { RiskScore, TokenStats, TokenTrade } from '@sift/shared';
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ShieldCheck,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatAgo, formatAge, formatCompact, formatSol, formatSolPrice } from '../../lib/format';
import type { MarketToken } from '../../lib/market';
import { RISK_COLORS, RISK_LABELS, colors, radius, tint } from '../../lib/theme';
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
}: {
  stats: TokenStats | undefined;
  token: MarketToken | undefined;
  windowLabel: string;
}) {
  const cells: Array<[string, string]> = [
    ['Market cap', stats?.marketCapSol ? `${formatCompact(stats.marketCapSol)} SOL` : '–'],
    [`Volume (${windowLabel})`, stats ? formatSol(stats.volumeSol) : '–'],
    ['Buys / sells', stats ? `${stats.buys} / ${stats.sells}` : '–'],
    ['Age', token ? ageText(formatAge(token.launchedAt ?? token.firstSeenAt)) : '–'],
  ];
  return (
    <View style={styles.metrics}>
      {cells.map(([label, value], i) => (
        <View key={label} style={[styles.metric, i % 2 === 1 && styles.metricRight]}>
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
 * Risk signals: a row with the number of flags, opening to every check and its reason.
 * Text and an icon always say the level; never "safe".
 */
export function RiskSignals({
  risk,
  defaultOpen = false,
}: {
  risk: RiskScore | undefined;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!risk) {
    return (
      <View style={styles.risk}>
        <CircleHelp size={18} color={colors.muted} strokeWidth={2} />
        <Text style={styles.riskTitle}>Checking this token…</Text>
      </View>
    );
  }
  const flags = risk.reasons.filter((r) => r.level !== 'green');
  const tone = RISK_COLORS[risk.level];
  const Icon = risk.level === 'green' ? ShieldCheck : AlertTriangle;
  return (
    <View style={styles.riskBox}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Risk signals: ${RISK_LABELS[risk.level]}, ${flags.length} ${flags.length === 1 ? 'flag' : 'flags'}`}
        style={({ pressed }) => [styles.risk, pressed && { opacity: 0.8 }]}
      >
        <Icon size={18} color={tone.fg} strokeWidth={2} />
        <Text style={styles.riskTitle}>Risk signals</Text>
        <Text style={[styles.level, { color: tone.fg }]}>{RISK_LABELS[risk.level]}</Text>
        <View style={styles.flex} />
        <View
          style={[
            styles.flagChip,
            { borderColor: flags.length ? tint(tone.fg, 0.5) : colors.border },
          ]}
        >
          <Text style={[styles.flagText, { color: flags.length ? tone.fg : colors.muted }]}>
            {flags.length === 0
              ? 'No flags'
              : `${flags.length} ${flags.length === 1 ? 'flag' : 'flags'}`}
          </Text>
        </View>
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
            <View style={[styles.tradeIcon, { backgroundColor: tint(color, 0.14) }]}>
              <ArrowLeftRight size={16} color={color} strokeWidth={2} />
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 4,
  },
  metric: { width: '50%', paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  metricRight: { borderLeftWidth: 1, borderLeftColor: colors.border },
  metricLabel: { fontSize: 13, color: colors.muted },
  metricValue: { fontSize: 17, fontWeight: '600' },
  riskBox: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  risk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  riskTitle: { fontSize: 15, fontWeight: '600' },
  level: { fontSize: 13, fontWeight: '600' },
  flagChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.chip,
    borderWidth: 1,
    justifyContent: 'center',
  },
  flagText: { fontSize: 13, fontWeight: '600' },
  checks: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
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
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
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
