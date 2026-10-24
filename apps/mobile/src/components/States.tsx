import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';
import { Button } from './Button';
import { Text } from './Text';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button small variant="secondary" label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 32, alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { textAlign: 'center', fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
