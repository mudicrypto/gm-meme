import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../lib/theme';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const palette = usePalette();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.accent} />
      <Text style={{ color: palette.muted }}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const palette = usePalette();
  return (
    <View style={styles.center}>
      <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.button, { borderColor: palette.border }]}>
          <Text style={{ color: palette.accent, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ message }: { message: string }) {
  const palette = usePalette();
  return (
    <View style={styles.center}>
      <Text style={{ color: palette.muted, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 32, alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { textAlign: 'center', fontSize: 15 },
  button: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
});
