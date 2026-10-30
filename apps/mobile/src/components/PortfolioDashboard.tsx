import { router } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatCompact, formatSol, formatSolPrice, shortAddress } from '../lib/format';
import { transition } from '../lib/motion';
import { usePortfolio } from '../lib/portfolio-hooks';
import { colors, radius, space } from '../lib/theme';
import { EmptyState } from './EmptyState';
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

  return (
    <View style={styles.wrap}>
      <View style={styles.tiles}>
        <Tile label="SOL balance" value={sol !== undefined ? formatSol(sol) : '…'} />
        <Tile
          label="Tokens (est.)"
          value={pricesPending ? '…' : formatSol(tokenValue)}
          hint={rows.length > priced ? `${rows.length - priced} without a price` : undefined}
        />
        <Tile
          label="Total (est.)"
          value={sol !== undefined ? formatSol(sol + tokenValue) : '…'}
          strong
        />
        <Tile label="Tokens held" value={String(items.length)} />
      </View>

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

function Tile({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text mono style={[styles.tileValue, strong && { color: colors.accent }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  tile: {
    flex: 1,
    minWidth: 160,
    padding: space.lg,
    gap: 4,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  tileLabel: { fontSize: 12, color: colors.muted },
  tileValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  tileHint: { fontSize: 11, color: colors.faint },
  table: { borderRadius: radius.card, backgroundColor: colors.surface },
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
