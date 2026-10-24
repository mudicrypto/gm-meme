import { ListFilter } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';
import { Text } from './Text';

/** The Sift mark (a sieve) and wordmark. */
export function Logo() {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Sift">
      <View style={styles.mark}>
        <ListFilter size={18} color={colors.onAccent} strokeWidth={2.4} />
      </View>
      <Text style={styles.word}>Sift</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
});
