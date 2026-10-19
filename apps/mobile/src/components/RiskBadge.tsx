import type { RiskLevel } from '@sift/shared';
import { StyleSheet, Text, View } from 'react-native';
import { RISK_COLORS, RISK_LABELS } from '../lib/theme';

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

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  large: { paddingHorizontal: 12, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '600' },
  largeText: { fontSize: 15 },
});
