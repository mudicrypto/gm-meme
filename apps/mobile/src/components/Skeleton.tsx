import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../lib/theme';

/** Placeholder cards while a list loads (calmer than a spinner). */
export function SkeletonCards({ count = 4, height = 92 }: { count?: number; height?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { height }]}>
          <View style={styles.avatar} />
          <View style={styles.lines}>
            <View style={[styles.line, { width: '55%' }]} />
            <View style={[styles.line, { width: '35%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface2 },
  lines: { flex: 1, gap: 8 },
  line: { height: 12, borderRadius: 6, backgroundColor: colors.surface2 },
});
