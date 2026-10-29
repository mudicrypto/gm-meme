import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatSol } from '../../lib/format';
import { isStale } from '../../lib/market';
import { colors } from '../../lib/theme';
import { Text } from '../Text';
import type { DiscoverState } from './useDiscover';

/** Live / stale status, row count and volume, plus the devnet and advice notes. */
export function StatusLine({ state, inline = false }: { state: DiscoverState; inline?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const updated = state.market.updatedAt;
  const stale = isStale(updated, now);
  const ago = updated > 0 ? Math.max(0, Math.round((now - updated) / 1000)) : null;
  const volume = state.rows.reduce(
    (total, t) => total + (state.market.statsMap.get(t.mint)?.volumeSol ?? 0),
    0,
  );
  return (
    <View style={[styles.row, inline && styles.inline]}>
      <View style={[styles.dot, { backgroundColor: stale ? colors.caution : colors.up }]} />
      <Text style={[styles.text, { color: stale ? colors.caution : colors.up }]}>
        {stale ? 'Stale' : 'Live'}
      </Text>
      <Text style={styles.text}>
        {ago === null ? 'Loading…' : ago < 10 ? 'Updated just now' : `Updated ${ago}s ago`}
      </Text>
      {inline ? (
        <>
          <Text style={styles.text}>·</Text>
          <Text mono style={styles.text}>
            {state.rows.length} tokens
          </Text>
          <Text style={styles.text}>·</Text>
          <Text mono style={styles.text}>
            {formatSol(volume)} volume
          </Text>
        </>
      ) : null}
      <Text style={styles.text}>· Devnet data. Not financial advice.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  inline: { justifyContent: 'flex-start', paddingVertical: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, color: colors.faint },
});
