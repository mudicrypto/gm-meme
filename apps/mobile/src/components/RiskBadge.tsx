import type { RiskLevel } from '@sift/shared';
import { StyleSheet, View } from 'react-native';
import { RISK_COLORS, RISK_LABELS } from '../lib/theme';
import { Text } from './Text';

/** The hero of every token: a pill with a dot and a label. Never colour alone. */
export function RiskBadge({ level, large = false }: { level?: RiskLevel; large?: boolean }) {
  const key = level ?? 'unknown';
  const { fg, bg } = RISK_COLORS[key];
  return (
    <View
      style={[styles.badge, large && styles.large, { backgroundColor: bg }]}
      accessibilityLabel={`Risk: ${RISK_LABELS[key]}`}
    >
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.text, large && styles.largeText, { color: fg }]}>
        {RISK_LABELS[key]}
      </Text>
    </View>
  );
}

/** Just the dot, for dense lists (with an accessible label). */
export function RiskDot({ level }: { level?: RiskLevel }) {
  const key = level ?? 'unknown';
  return (
    <View
      accessibilityLabel={`Risk: ${RISK_LABELS[key]}`}
      style={[styles.dotLarge, { backgroundColor: RISK_COLORS[key].fg }]}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  large: { height: 32, paddingHorizontal: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotLarge: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '800' },
  largeText: { fontSize: 14 },
});
