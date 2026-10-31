import { router } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatCompact, formatSol, formatSolPrice, shortAddress } from '../lib/format';
import { transition } from '../lib/motion';
import { useNetwork } from '../lib/network';
import { usePortfolio } from '../lib/portfolio-hooks';
import { colors, radius, space } from '../lib/theme';
import { EmptyState } from './EmptyState';
import { GlowPanel } from './GlowPanel';
import { QuickActions } from './home/HomeSections';
import { Change } from './market/Change';
import { RiskTag } from './market/RiskTag';
import { Text } from './Text';
import { TokenAvatar } from './TokenAvatar';

/**
 * Portfolio on desktop: summary tiles and a holdings table. Values are the token amount
 * times its last traded price in SOL ("est."): Sift has no cost basis, so there's no
 * profit/loss, only the value now and its 24h change.
 */
export function PortfolioDashboard({ address }: { address: string }) {
  const { holdings, items, rows, sol, tokenValue, priced, pricesPending } = usePortfolio(address);
  const { isDevnet } = useNetwork();

  return (
    <View style={styles.wrap}>
      <GlowPanel style={styles.hero}>
        <View style={styles.heroMain}>
          <Text style={styles.tileLabel}>Est. total value</Text>
          <Text mono style={styles.total} numberOfLines={1}>
            {sol !== undefined ? formatCompact(sol + tokenValue) : '…'}
            <Text style={styles.unit}> {isDevnet ? 'test SOL' : 'SOL'}</Text>
          </Text>
          <View style={styles.stats}>
            <Stat label="SOL" value={sol !== undefined ? formatCompact(sol) : '…'} />
            <Stat
              label="Tokens (est.)"
              value={pricesPending ? '…' : formatCompact(tokenValue)}
              hint={rows.length > priced ? `${rows.length - priced} without a price` : undefined}
            />
            <Stat label="Tokens held" value={String(items.length)} />
          </View>
        </View>
        <View style={styles.heroActions}>
          <QuickActions />
        </View>
      </GlowPanel>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={styles.tableTitle}>Holdings</Text>
          <Text style={styles.headNote}>{shortAddress(address)}</Text>
        </View>
        {holdings.isPending ? (
          <Text style={styles.loading}>Loading holdings…</Text>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No tokens yet"
            body="Tokens you buy show up here with their value and risk."
            action={{ label: 'Discover tokens', onPress: () => router.navigate('/markets') }}
          />
        ) : (
          <>
            <View style={[styles.row, styles.headRow]}>
              <Text style={[styles.th, styles.colToken]}>Token</Text>
              <Text style={[styles.th, styles.colNum]}>Amount</Text>
              <Text style={[styles.th, styles.colNum]}>Price (SOL)</Text>
              <Text style={[styles.th, styles.colNum]}>Value (SOL)</Text>
              <Text style={[styles.th, styles.colChange]}>24h %</Text>
              <Text style={[styles.th, styles.colRisk]}>Risk</Text>
              <View style={styles.colAction} />
            </View>
            {rows.map(({ h, s, value }) => {
              const symbol = (h.symbol ?? h.name ?? shortAddress(h.mint)).slice(0, 12);
              return (
                <Pressable
                  key={h.mint}
                  onPress={() => router.push(`/token/${h.mint}`)}
                  accessibilityRole="link"
                  accessibilityLabel={`${symbol}, value ${value !== undefined ? formatSol(value) : 'unknown'}`}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.row,
                    hovered && { backgroundColor: colors.surface2 },
                    transition,
                  ]}
                >
                  <View style={[styles.colToken, styles.token]}>
                    <TokenAvatar
                      uri={h.imageUrl}
                      label={h.symbol ?? h.name}
                      seed={h.mint}
                      size={32}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.symbol} numberOfLines={1}>
                        {symbol}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {h.name ?? shortAddress(h.mint)}
                      </Text>
                    </View>
                  </View>
                  <Text mono style={[styles.td, styles.colNum]} numberOfLines={1}>
                    {formatCompact(h.amount)}
                  </Text>
                  <Text mono style={[styles.td, styles.colNum]} numberOfLines={1}>
                    {s?.priceSol !== undefined ? formatSolPrice(s.priceSol) : '–'}
                  </Text>
                  <Text mono style={[styles.td, styles.colNum, styles.value]} numberOfLines={1}>
                    {value !== undefined ? formatCompact(value) : '–'}
                  </Text>
                  <View style={styles.colChange}>
                    <Change pct={s?.changePct} size={13} />
                  </View>
                  <View style={styles.colRisk}>
                    <RiskTag level={h.riskLevel} />
                  </View>
                  <Pressable
                    onPress={() => router.push(`/trade/${h.mint}?side=sell`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Sell ${symbol}`}
                    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                      styles.colAction,
                      styles.sell,
                      hovered && { borderColor: colors.borderStrong },
                      transition,
                    ]}
                  >
                    <Text style={styles.sellText}>Sell</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </>
        )}
      </View>
      <Text style={styles.foot}>
        Values use each token’s last traded price in SOL. Sift doesn’t know what you paid, so it
        doesn’t show profit or loss.
      </Text>
    </View>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text mono style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  flex: { flex: 1, minWidth: 0 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.xl, padding: space.xl },
  heroMain: { flex: 1, minWidth: 0, gap: 4 },
  heroActions: { width: 340 },
  total: { fontSize: 40, fontWeight: '600', letterSpacing: -1.2 },
  unit: { fontSize: 15, fontWeight: '600', color: colors.muted, letterSpacing: 0 },
  stats: { flexDirection: 'row', gap: 40, marginTop: space.md },
  stat: { gap: 2 },
  statValue: { fontSize: 17, fontWeight: '600' },
  tileLabel: { fontSize: 12, color: colors.muted },
  tileHint: { fontSize: 11, color: colors.faint },
  table: {
    borderRadius: radius.card + 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  tableTitle: { fontSize: 15, fontWeight: '600' },
  headNote: { fontSize: 12, color: colors.faint },
  loading: { padding: space.lg, fontSize: 13, color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: space.lg,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  headRow: { minHeight: 40 },
  th: { fontSize: 12, fontWeight: '500', color: colors.faint },
  td: { fontSize: 14, fontWeight: '500' },
  value: { fontWeight: '600' },
  colToken: { flex: 1, minWidth: 0 },
  colNum: { width: 112, textAlign: 'right' },
  colChange: { width: 80, alignItems: 'flex-end', textAlign: 'right' } as object,
  colRisk: { width: 112, paddingLeft: space.md },
  colAction: { width: 64, alignItems: 'flex-end' },
  token: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symbol: { fontSize: 14, fontWeight: '500' },
  sub: { fontSize: 12, color: colors.faint, marginTop: 1 },
  sell: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  sellText: { fontSize: 13, fontWeight: '600' },
  foot: { fontSize: 12, color: colors.faint, lineHeight: 18 },
});
