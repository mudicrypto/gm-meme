import { Animated, StyleSheet, View } from 'react-native';
import { usePulse } from './Motion';
import { colors, radius } from '../lib/theme';

/** Placeholder cards while a list loads (calmer than a spinner). */
export function SkeletonCards({ count = 4, height = 92 }: { count?: number; height?: number }) {
  const pulse = usePulse();
  return (
    <Animated.View style={[styles.list, { opacity: pulse }]} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { height }]}>
          <View style={styles.avatar} />
          <View style={styles.lines}>
            <View style={[styles.line, { width: `${55 - (i % 3) * 8}%` }]} />
            <View style={[styles.line, styles.thin, { width: `${35 + (i % 2) * 10}%` }]} />
            <View style={[styles.pill]} />
          </View>
        </View>
      ))}
    </Animated.View>
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
  thin: { height: 9 },
  pill: { width: 96, height: 18, borderRadius: 9, backgroundColor: colors.surface2, marginTop: 4 },
});
