import { RISK_DISCLAIMER, isSolanaAddress } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { ModeToggle } from '../../components/ModeToggle';
import { PriceChart } from '../../components/PriceChart';
import { RiskBadge } from '../../components/RiskBadge';
import { Segmented } from '../../components/Segmented';
import { ErrorState, Loading } from '../../components/States';
import { api } from '../../lib/api';
import {
  formatPct,
  formatSol,
  formatSolPrice,
  priceChangePct,
  shortAddress,
} from '../../lib/format';
import { useMode } from '../../lib/mode';
import { RISK_COLORS, usePalette } from '../../lib/theme';

const WINDOWS = [
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '1440', label: '24h' },
] as const;

const CHECK_NAMES: Record<string, string> = {
  mint_authority: 'Minting',
  freeze_authority: 'Freezing',
  token_extensions: 'Transfer rules',
  holder_concentration: 'Holders',
  liquidity: 'Liquidity',
  dev_history: 'Creator history',
  sell_test: 'Selling',
};

export default function TokenScreen() {
  const palette = usePalette();
  const { mode } = useMode();
  const { mint = '' } = useLocalSearchParams<{ mint: string }>();
  const [window, setWindow] = useState<(typeof WINDOWS)[number]['value']>('60');
  const valid = isSolanaAddress(mint);

  const risk = useQuery({
    queryKey: ['risk', mint],
    queryFn: () => api.risk(mint),
    enabled: valid,
  });
  const summary = useQuery({
    queryKey: ['summary', mint],
    queryFn: () => api.summary(mint),
    enabled: valid,
  });
  const chart = useQuery({
    queryKey: ['chart', mint, window],
    queryFn: () => api.chart(mint, Number(window)),
    enabled: valid,
    refetchInterval: 15_000,
  });

  if (!valid) return <ErrorState message="That isn't a valid token address." />;
  if (risk.isPending) return <Loading label="Checking this token…" />;
  if (risk.isError)
    return <ErrorState message={risk.error.message} onRetry={() => risk.refetch()} />;

  const points = chart.data?.points ?? [];
  const lastPrice = points[points.length - 1]?.priceSol;
  const change = priceChangePct(points);
  const volume = points.reduce((total, p) => total + p.volumeSol, 0);
  const flagged = risk.data.reasons.filter((r) => r.level !== 'green');
  const reasons =
    mode === 'pro'
      ? risk.data.reasons
      : flagged.length > 0
        ? flagged
        : risk.data.reasons.slice(0, 3);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: shortAddress(mint), headerRight: () => <ModeToggle /> }} />

      <Card>
        <View style={styles.priceRow}>
          <View>
            <Text style={[styles.price, { color: palette.text }]}>
              {lastPrice ? `${formatSolPrice(lastPrice)} SOL` : 'No price yet'}
            </Text>
            {change !== undefined ? (
              <Text style={{ color: change >= 0 ? palette.up : palette.down, fontWeight: '600' }}>
                {formatPct(change)} · {WINDOWS.find((w) => w.value === window)?.label}
              </Text>
            ) : null}
          </View>
          <RiskBadge level={risk.data.level} large />
        </View>
        <PriceChart points={points} />
        <Segmented compact value={window} onChange={setWindow} options={WINDOWS} />
        {mode === 'pro' ? (
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {formatSol(volume)} traded · prices from trades Sift recorded · {mint}
          </Text>
        ) : null}
      </Card>

      <Card title="In plain words" right={summary.data?.source === 'ai' ? <Tag text="AI" /> : null}>
        {summary.isPending ? (
          <Text style={{ color: palette.muted }}>Writing a summary…</Text>
        ) : summary.isError ? (
          <Text style={{ color: palette.muted }}>Summary unavailable right now.</Text>
        ) : (
          <>
            <Text style={[styles.body, { color: palette.text }]}>{summary.data.summary}</Text>
            {summary.data.redFlags.length > 0 ? (
              <View style={styles.flags}>
                {summary.data.redFlags.map((flag) => (
                  <Text
                    key={flag}
                    style={[
                      styles.flag,
                      { color: RISK_COLORS.red.fg, backgroundColor: RISK_COLORS.red.bg },
                    ]}
                  >
                    {flag}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Card>

      <Card
        title={
          mode === 'pro' ? 'All checks' : flagged.length > 0 ? 'What we found' : 'Checks passed'
        }
      >
        {reasons.map((reason) => (
          <View key={reason.check} style={styles.reason}>
            <View style={[styles.reasonDot, { backgroundColor: RISK_COLORS[reason.level].fg }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.reasonName, { color: palette.text }]}>
                {CHECK_NAMES[reason.check] ?? reason.check}
              </Text>
              <Text style={{ color: palette.muted }}>{reason.message}</Text>
            </View>
          </View>
        ))}
        {mode === 'simple' && reasons.length < risk.data.reasons.length ? (
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {risk.data.reasons.length - reasons.length} more checks passed. Switch to Pro to see
            all.
          </Text>
        ) : null}
      </Card>

      <View style={styles.actions}>
        {(['Buy', 'Sell'] as const).map((label) => (
          <Link key={label} href={`/trade/${mint}?side=${label.toLowerCase()}`} asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.action,
                {
                  backgroundColor: label === 'Buy' ? palette.accent : palette.card,
                  borderColor: palette.border,
                },
              ])}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: label === 'Buy' ? palette.accentText : palette.text },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <Text style={[styles.note, { color: palette.muted }]}>
        You’ll see the full cost, every fee included, before confirming.
      </Text>
      <Text style={[styles.note, { color: palette.muted }]}>
        {risk.data.disclaimer ?? RISK_DISCLAIMER}
      </Text>
    </ScrollView>
  );
}

function Tag({ text }: { text: string }) {
  const palette = usePalette();
  return (
    <Text style={[styles.tag, { color: palette.accent, borderColor: palette.accent }]}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  price: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  reason: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  reasonName: { fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, textAlign: 'center' },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
});
